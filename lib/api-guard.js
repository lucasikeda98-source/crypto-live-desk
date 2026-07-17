'use strict';

const { Ratelimit } = require('@upstash/ratelimit');
const { getRedis } = require('./redis-runtime');

// Best-effort per-instance limiter for public read-only proxies. Vercel may run several isolated
// instances, so this is defense in depth rather than a replacement for an account-level firewall.
const buckets = new Map();
const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 120;
const MAX_BUCKETS = 10_000;
let lastBucketSweepAt = 0;
let lastFallbackLogAt = 0;
let distributedLimiter = null;
let distributedLimiterIdentity = '';
let distributedLimiterRedis = null;

function header(request, name) {
  const headers = request && request.headers || {};
  const value = headers[name] === undefined ? headers[name.toLowerCase()] : headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestHost(request) {
  // `host` primeiro: na Vercel ele roteia o deployment e nao pode ser forjado para alcancar esta
  // funcao. `x-forwarded-host` fica como fallback para proxies que reescrevem o Host original —
  // nunca como fonte primaria de uma decisao de CORS.
  return String(header(request, 'host') || header(request, 'x-forwarded-host') || '').split(',')[0].trim().toLowerCase();
}

function requestProtocol(request) {
  const forwarded = String(header(request, 'x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  if (forwarded === 'http' || forwarded === 'https') return forwarded;
  if (request && request.socket && request.socket.encrypted) return 'https';
  return '';
}

function allowedOrigins() {
  return String(process.env.API_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => { try { return new URL(value).origin; } catch (error) { return null; } })
    .filter(Boolean);
}

function originAllowed(request, origin) {
  if (!origin) return true;
  let parsed;
  try { parsed = new URL(origin); } catch (error) { return false; }
  const host = requestHost(request);
  if (host && parsed.host.toLowerCase() === host) {
    const protocol = requestProtocol(request);
    return !protocol || parsed.protocol === `${protocol}:`;
  }
  return allowedOrigins().includes(parsed.origin);
}

function clientKey(request) {
  // Ordem de confianca: (1) header proprio da Vercel, que a plataforma preserva mesmo quando um
  // proxy na frente reescreve X-Forwarded-For; (2) endereco real do socket; (3) so entao o
  // X-Forwarded-For controlavel pelo cliente — um atacante fora da Vercel nao pode rotacionar o
  // header para ganhar um bucket novo por requisicao quando existe uma conexao real para chavear.
  const vercelForwarded = String(header(request, 'x-vercel-forwarded-for') || '').split(',')[0].trim();
  const socketAddress = request && request.socket && request.socket.remoteAddress || '';
  const forwarded = String(header(request, 'x-forwarded-for') || '').split(',')[0].trim();
  const raw = vercelForwarded || socketAddress || forwarded || 'anonymous';
  return String(raw).replace(/[\x00-\x20\x7f]/g, '_').slice(0, 128) || 'anonymous';
}

function consumeRate(request, now, limit) {
  const key = clientKey(request);
  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + WINDOW_MS } : current;
  bucket.count += 1;

  // Keep adversarial high-cardinality client keys bounded. The previous implementation only
  // scanned expired entries after the map had already crossed 10k; during the active minute it
  // could grow without limit and repeat an O(n) scan for every request. Sweep occasionally, then
  // evict the oldest bucket before admitting a new key if the hard cap is still full.
  if (!current && buckets.size >= MAX_BUCKETS) {
    if (now - lastBucketSweepAt >= WINDOW_MS / 4) {
      for (const [entryKey, entry] of buckets) if (entry.resetAt <= now) buckets.delete(entryKey);
      lastBucketSweepAt = now;
    }
    if (buckets.size >= MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
  }
  buckets.set(key, bucket);
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

function sendJson(response, statusCode, payload) {
  if (typeof response.status === 'function' && typeof response.json === 'function') return response.status(statusCode).json(payload);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
  return payload;
}

function installCachePolicy(request, response, successCacheControl) {
  // Error, validation, rate-limit and preflight responses must never be shared by a CDN. The
  // public policy is promoted only when a GET actually finishes with a successful JSON status.
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (typeof response.json !== 'function') return;
  const originalJson = response.json;
  response.json = function guardedJson(payload) {
    const statusCode = Number.isFinite(response.statusCode) ? response.statusCode : 200;
    const cacheable = request && request.method === 'GET' && statusCode >= 200 && statusCode < 300;
    response.setHeader('Cache-Control', cacheable ? successCacheControl : 'private, no-store, max-age=0');
    return originalJson.call(this, payload);
  };
}

function applyApiPolicy(request, response, options = {}) {
  const cacheControl = options.cacheControl || 'public, s-maxage=60, stale-while-revalidate=180';
  const limit = Number.isFinite(options.limit) ? Math.max(1, Math.floor(options.limit)) : DEFAULT_LIMIT;
  const methods = (Array.isArray(options.methods) && options.methods.length ? options.methods : ['GET'])
    .map((method) => String(method).toUpperCase()).filter((method, index, rows) => /^[A-Z]+$/.test(method) && rows.indexOf(method) === index);
  installCachePolicy(request, response, cacheControl);
  response.setHeader('Vary', 'Origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  const origin = String(header(request, 'origin') || '');
  const permitted = originAllowed(request, origin);
  if (origin && permitted) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', methods.concat(['OPTIONS']).filter((method, index, rows) => rows.indexOf(method) === index).join(', '));
    response.setHeader('Access-Control-Allow-Headers', 'Accept, Content-Type, X-Journal-Id');
  }
  if (!permitted || (!origin && String(header(request, 'sec-fetch-site') || '').toLowerCase() === 'cross-site')) {
    sendJson(response, 403, { error: 'Cross-origin request not allowed' });
    return false;
  }
  if (request && request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return false;
  }

  const rate = consumeRate(request, Date.now(), limit);
  response.setHeader('X-RateLimit-Limit', String(limit));
  response.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  response.setHeader('X-RateLimit-Scope', 'instance');
  if (!rate.allowed) {
    response.setHeader('Retry-After', String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000))));
    sendJson(response, 429, { error: 'Rate limit exceeded' });
    return false;
  }
  return true;
}

function getDistributedLimiter(limit) {
  const redis = getRedis();
  if (!redis) return null;
  const identity = String(limit);
  if (!distributedLimiter || distributedLimiterIdentity !== identity || distributedLimiterRedis !== redis) {
    distributedLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, '60 s'),
      prefix: 'cld:api:global:v1',
      analytics: false,
      enableProtection: true
    });
    distributedLimiterIdentity = identity;
    distributedLimiterRedis = redis;
  }
  return distributedLimiter;
}

/** Enforces one Redis-backed sliding window across all serverless instances when provisioned. */
async function applyApiPolicyAsync(request, response, options = {}) {
  if (!applyApiPolicy(request, response, options)) return false;
  const distributedLimit = Number.isFinite(options.distributedLimit) ? Math.max(1, Math.floor(options.distributedLimit)) : DEFAULT_LIMIT;
  const limiter = Object.prototype.hasOwnProperty.call(options, 'distributedLimiter') ? options.distributedLimiter : getDistributedLimiter(distributedLimit);
  if (!limiter) return true;
  try {
    const result = await limiter.limit(clientKey(request));
    response.setHeader('X-RateLimit-Limit', String(result.limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));
    response.setHeader('X-RateLimit-Scope', 'distributed');
    if (!result.success) {
      response.setHeader('Retry-After', String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))));
      sendJson(response, 429, { error: 'Distributed rate limit exceeded' });
      return false;
    }
    return true;
  } catch (error) {
    // Redis outage degrades to the already-consumed bounded in-process limiter. This preserves
    // availability without claiming that the global protection remained active. O log abaixo e
    // o sinal observavel de que a protecao global caiu (throttled para nao inundar durante a
    // indisponibilidade).
    if (Date.now() - lastFallbackLogAt >= 60_000) {
      lastFallbackLogAt = Date.now();
      console.error('[api-guard] limiter distribuido indisponivel; degradando para instance-fallback:', String(error && error.message || error));
    }
    response.setHeader('X-RateLimit-Scope', 'instance-fallback');
    return true;
  }
}

// Public errors cross an unauthenticated boundary. Only values created by publicApiError are
// considered reviewed; runtime/library errors may contain Redis URLs, tokens or stack details.
function sanitizePublicMessage(value) {
  return String(value || '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** Creates an explicitly reviewed error that may cross the public API boundary. */
function publicApiError(message) {
  const publicMessage = sanitizePublicMessage(message) || 'upstream unavailable';
  const error = new Error(publicMessage);
  Object.defineProperty(error, 'publicMessage', { value: publicMessage, enumerable: false });
  return error;
}

/** Exposes only messages explicitly marked safe; arbitrary Error messages stay server-side. */
function publicErrorMessage(label, error) {
  const message = String(error && error.message || error || '');
  if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return 'timeout';
  if (error && Object.prototype.hasOwnProperty.call(error, 'publicMessage')) {
    const publicMessage = sanitizePublicMessage(error.publicMessage);
    if (publicMessage) return publicMessage;
  }
  console.error(`[api] ${label}:`, message);
  return 'internal error';
}

function resetRateLimits() { buckets.clear(); lastBucketSweepAt = 0; lastFallbackLogAt = 0; distributedLimiter = null; distributedLimiterIdentity = ''; distributedLimiterRedis = null; }
function rateLimitBucketCount() { return buckets.size; }

module.exports = { applyApiPolicy, applyApiPolicyAsync, getDistributedLimiter, originAllowed, publicApiError, publicErrorMessage, resetRateLimits, rateLimitBucketCount };
