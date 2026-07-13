'use strict';

const { applyApiPolicyAsync } = require('../lib/api-guard');
const { createDurableSignalStore, namespaceHash } = require('../lib/durable-signals');
const { getRedis } = require('../lib/redis-runtime');

const MAX_BODY_BYTES = 512 * 1024;
const MAX_RECORDS_PER_REQUEST = 50;

function requestHeader(request, name) {
  const headers = request && request.headers || {};
  const value = headers[name] === undefined ? headers[name.toLowerCase()] : headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readJsonBody(request) {
  if (request && request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
    let serialized;
    try { serialized = JSON.stringify(request.body); }
    catch (error) {
      const invalid = new Error('Invalid JSON body');
      invalid.statusCode = 400;
      throw invalid;
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
      const tooLarge = new Error('Payload too large');
      tooLarge.statusCode = 413;
      throw tooLarge;
    }
    return request.body;
  }
  if (request && (typeof request.body === 'string' || Buffer.isBuffer(request.body))) {
    const raw = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body, 'utf8');
    if (raw.length > MAX_BODY_BYTES) {
      const tooLarge = new Error('Payload too large');
      tooLarge.statusCode = 413;
      throw tooLarge;
    }
    if (!raw.length) return {};
    try { return JSON.parse(raw.toString('utf8')); }
    catch (error) {
      const invalid = new Error('Invalid JSON body');
      invalid.statusCode = 400;
      throw invalid;
    }
  }
  if (!request || typeof request[Symbol.asyncIterator] !== 'function') return {};
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Payload too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(buffer);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch (error) {
    const invalid = new Error('Invalid JSON body');
    invalid.statusCode = 400;
    throw invalid;
  }
}

async function handleRequest(request, response, redisOverride) {
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'private, no-store, max-age=0', limit: 30, methods: ['GET', 'POST', 'DELETE'] })) return;
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST, DELETE');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const namespace = String(requestHeader(request, 'x-journal-id') || '');
  if (!namespaceHash(namespace)) return response.status(400).json({ error: 'Invalid or missing X-Journal-Id' });
  const redis = redisOverride === undefined ? getRedis() : redisOverride;
  if (!redis) {
    // A read-only capability probe is a valid response, not a failed resource in the browser.
    // Mutations still fail closed and can never pretend that local data was persisted.
    if (request.method === 'GET') return response.status(200).json({ configured: false, records: [] });
    return response.status(503).json({ error: 'Durable signal storage is not provisioned', configured: false });
  }
  const store = createDurableSignalStore(redis);
  try {
    if (request.method === 'GET') {
      const records = await store.list(namespace, Date.now());
      return response.status(200).json({ configured: true, records });
    }
    if (request.method === 'DELETE') {
      await store.clear(namespace);
      return response.status(200).json({ configured: true, records: [] });
    }
    const body = await readJsonBody(request);
    if (!Array.isArray(body.records) || body.records.length > MAX_RECORDS_PER_REQUEST) {
      return response.status(400).json({ error: `records must be an array with at most ${MAX_RECORDS_PER_REQUEST} items` });
    }
    const records = await store.upsert(namespace, body.records, Date.now());
    return response.status(200).json({ configured: true, records });
  } catch (error) {
    const status = error && error.statusCode || (error instanceof TypeError ? 400 : 503);
    return response.status(status).json({ error: String(error && error.message || error), configured: true });
  }
}

module.exports = function handler(request, response) { return handleRequest(request, response); };

module.exports.handleRequest = handleRequest;
module.exports.readJsonBody = readJsonBody;
module.exports.requestHeader = requestHeader;
