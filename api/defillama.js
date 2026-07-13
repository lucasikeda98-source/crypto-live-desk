// Proxy for DeFiLlama /protocols. The upstream list is ~10-15MB (every DeFi protocol);
// the client only ever matches a handful by name/slug/symbol/gecko_id and needs tvl >= $1M
// to score. We fetch server-side, keep the fields the client reads, drop anything below the
// score floor and cap the list, turning a ~10GB/day drip into a few hundred KB cached response.

const FIELDS = ['name', 'slug', 'symbol', 'gecko_id', 'tvl', 'change_1d', 'change_7d'];
const MIN_TVL = 1_000_000; // mirrors RULESET.protocolMinTvl: below it nothing can match on fallback
const MAX_ROWS = 500; // top-by-TVL cap for fallback matches (gecko/name), all high-TVL
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

async function loadProtocols() {
  const all = await getJson('https://api.llama.fi/protocols');
  const rows = Array.isArray(all) ? all : [];
  const byTvl = rows
    .filter((protocol) => protocol && Number(protocol.tvl) >= MIN_TVL)
    .sort((a, b) => Number(b.tvl || 0) - Number(a.tvl || 0))
    .slice(0, MAX_ROWS);
  const included = new Set(byTvl);
  const pinned = rows.filter((protocol) => protocol && !included.has(protocol) && isPinned(protocol));
  const protocols = byTvl.concat(pinned).map(slim);
  return { protocols, count: protocols.length, source: 'DeFiLlama /protocols (filtrado)', fetchedAt: Date.now(), stale: false };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  response.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  response.setHeader('Access-Control-Allow-Origin', '*');

  if (cachedPayload && Date.now() - cachedAt < 120000) {
    return response.status(200).json(cachedPayload);
  }

  try {
    cachedPayload = await loadProtocols();
    cachedAt = Date.now();
  } catch (error) {
    if (!cachedPayload) return response.status(503).json({ error: String(error && error.message || error) });
    cachedPayload = { ...cachedPayload, stale: true };
  }

  return response.status(200).json(cachedPayload);
};
