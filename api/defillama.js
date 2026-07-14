const { toFiniteNumber } = require('../lib/analytics-core');
const { applyApiPolicyAsync } = require('../lib/api-guard');

// Proxy for DeFiLlama /protocols. The upstream list is ~10-15MB (every DeFi protocol);
// the client only ever matches a handful by name/slug/symbol/gecko_id and needs tvl >= $1M
// to score. We fetch server-side, keep the fields the client reads, drop anything below the
// score floor and cap the list, turning a ~10GB/day drip into a few hundred KB cached response.

const FIELDS = ['name', 'slug', 'symbol', 'gecko_id', 'tvl', 'change_1d', 'change_7d'];
const MIN_TVL = 1_000_000; // mirrors RULESET.protocolMinTvl: below it nothing can match on fallback
const MAX_ROWS = 500; // top-by-TVL cap for fallback matches (gecko/name), all high-TVL
const RETRY_BACKOFF_MS = 15_000;
// Explicit protocol mappings in the client's ASSET_CONTEXT match WITHOUT a TVL floor, so they
// must be pinned even when their DeFiLlama TVL is low/zero (e.g. Chainlink, an oracle).
// Keep in sync with the `protocol:` keys in app.js ASSET_CONTEXT.
const ALWAYS_INCLUDE = ['chainlink', 'aave', 'uniswap'];

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isPinned(protocol) {
  const keys = [protocol.slug, protocol.name, protocol.symbol, protocol.gecko_id].map(normalizeKey);
  return ALWAYS_INCLUDE.some((wanted) => keys.indexOf(wanted) !== -1);
}

let cachedPayload = null;
let cachedAt = 0;
let refreshPromise = null;
let retryAfterAt = 0;

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)',
    },
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function slim(protocol) {
  const row = {};
  for (const field of FIELDS) {
    if (protocol[field] !== undefined && protocol[field] !== null) row[field] = protocol[field];
  }
  return row;
}

function protocolIdentity(protocol) {
  return normalizeKey(protocol && (protocol.slug || protocol.gecko_id || protocol.name || protocol.symbol));
}

async function loadProtocols() {
  const all = await getJson('https://api.llama.fi/protocols');
  const rows = Array.isArray(all) ? all : [];
  const sorted = rows
    .filter((protocol) => protocol && toFiniteNumber(protocol.tvl) !== null && toFiniteNumber(protocol.tvl) >= MIN_TVL)
    .sort((a, b) => toFiniteNumber(b.tvl) - toFiniteNumber(a.tvl));
  const identities = new Set();
  const byTvl = [];
  for (const protocol of sorted) {
    const identity = protocolIdentity(protocol);
    if (!identity || identities.has(identity)) continue;
    identities.add(identity);
    byTvl.push(protocol);
    if (byTvl.length >= MAX_ROWS) break;
  }
  const included = new Set(byTvl);
  const pinned = [];
  for (const wanted of ALWAYS_INCLUDE) {
    const protocol = rows.find((candidate) => candidate && !included.has(candidate)
      && !identities.has(protocolIdentity(candidate))
      && [candidate.slug, candidate.name, candidate.symbol, candidate.gecko_id].map(normalizeKey).includes(wanted));
    if (!protocol) continue;
    identities.add(protocolIdentity(protocol));
    pinned.push(protocol);
  }
  const protocols = byTvl.concat(pinned).map(slim);
  const acquiredAt = Date.now();
  return { protocols, count: protocols.length, source: 'DeFiLlama /protocols (filtrado)', observedAt: acquiredAt, observedAtProvenance: 'server-acquired-live-snapshot', fetchedAt: acquiredAt, stale: false, errors: {} };
}

function refreshProtocols() {
  if (!refreshPromise) {
    refreshPromise = loadProtocols().then((payload) => {
      cachedPayload = payload;
      cachedAt = Date.now();
      retryAfterAt = 0;
      return payload;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function handler(request, response) {
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'public, s-maxage=120, stale-while-revalidate=600' })) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }


  if (cachedPayload && (Date.now() - cachedAt < 120000 || Date.now() < retryAfterAt)) {
    return response.status(200).json(cachedPayload);
  }

  try {
    await refreshProtocols();
  } catch (error) {
    if (!cachedPayload) return response.status(503).json({ error: String(error && error.message || error) });
    retryAfterAt = Date.now() + RETRY_BACKOFF_MS;
    cachedPayload = { ...cachedPayload, stale: true, errors: { ...cachedPayload.errors, refresh: String(error && error.message || error) } };
  }

  return response.status(200).json(cachedPayload);
}

module.exports = handler;
module.exports.loadProtocols = loadProtocols;
module.exports.isPinned = isPinned;
module.exports.slim = slim;
