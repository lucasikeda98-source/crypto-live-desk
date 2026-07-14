const { classifyEtfFlowObservation, toFiniteNumber } = require('../lib/analytics-core');
const { applyApiPolicyAsync } = require('../lib/api-guard');

const ASSET_MAP = {
  BTC: 'btc',
  ETH: 'eth',
  SOL: 'sol',
  XRP: 'xrp',
  HYPE: 'hyp',
};
const ALLOWED_ASSETS = new Set(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'TRX', 'DOT', 'LTC', 'BCH', 'UNI', 'NEAR', 'ATOM', 'FIL', 'AAVE', 'SUI', 'HBAR', 'XLM', 'ICP', 'ARB', 'OP']);

async function callEtfTool(name, args) {
  const response = await fetch('https://mcp.cryptoetf.today/api/mcp', {
    method: 'POST',
    headers: {
      'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args || {} } }),
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`ETF MCP HTTP ${response.status}`);
  return parseEtfMcpBody(await response.text());
}

function parseEtfMcpBody(body) {
  const raw = String(body || '').trim();
  const envelopes = [];
  if (raw) {
    try { envelopes.push(JSON.parse(raw)); } catch (error) {
      raw.split(/\r?\n\r?\n/).forEach((eventBlock) => {
        const fragments = eventBlock.split(/\r?\n/)
          .filter((line) => /^data:/i.test(line))
          .map((line) => line.replace(/^data:\s?/i, ''));
        const data = fragments.join('\n').trim();
        if (!data || data === '[DONE]') return;
        try { envelopes.push(JSON.parse(data)); } catch (parseError) {
          // Some MCP gateways wrap a single JSON-RPC envelope across multiple `data:` lines
          // without intending a literal newline inside the JSON token stream.
          try { envelopes.push(JSON.parse(fragments.join('').trim())); } catch (fragmentError) { /* tenta o proximo evento completo */ }
        }
      });
    }
  }
  const envelope = envelopes.find((item) => item && item.result) || envelopes.find((item) => item && item.error);
  if (!envelope) throw new Error('ETF MCP sem payload JSON-RPC valido');
  if (envelope.error) throw new Error('ETF MCP: ' + String(envelope.error.message || envelope.error.code || 'erro semantico'));
  const contentItems = Array.isArray(envelope.result && envelope.result.content) ? envelope.result.content : [];
  const text = contentItems.find((item) => item && typeof item === 'object' && item.type === 'text')?.text;
  if (!text) throw new Error('ETF MCP sem conteudo');
  return JSON.parse(text);
}

async function loadEtf(asset) {
  // Only get_asset_flows is consumed by the client; weekly analytics and the CeFi index were
  // fetched and discarded, tripling the failure surface of the one dataset that scores.
  const flows = normalizeEtfFlows(await callEtfTool('get_asset_flows', { asset }));
  return { flows, source: 'CryptoETF public MCP' };
}

function etfFlowNumber(row) {
  const millions = toFiniteNumber(row && row.netFlowUsdM);
  if (millions !== null) {
    const converted = millions * 1000000;
    return Number.isFinite(converted) ? converted : null;
  }
  const fields = ['flow_usd', 'net_flow_usd', 'netFlowUsd', 'net_flow', 'flow', 'total'];
  for (const field of fields) {
    const value = toFiniteNumber(row && row[field]);
    if (value !== null) return value;
  }
  return null;
}

function annotateEtfRows(rows) {
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const classification = classifyEtfFlowObservation(row, etfFlowNumber(row));
    return { ...row, reported: classification.reported, reportReason: classification.reason };
  });
}

function normalizeEtfFlows(payload, depth = 0) {
  if (Array.isArray(payload)) return annotateEtfRows(payload);
  if (!payload || typeof payload !== 'object') return payload;
  if (depth >= 16) return payload;
  const normalized = { ...payload };
  for (const key of ['data', 'flows', 'items', 'results', 'history', 'days', 'rows']) {
    if (Array.isArray(payload[key])) normalized[key] = annotateEtfRows(payload[key]);
    else if (payload[key] && typeof payload[key] === 'object') normalized[key] = normalizeEtfFlows(payload[key], depth + 1);
  }
  return normalized;
}

function safeDifference(left, right) {
  if (left === null || right === null) return null;
  const value = left - right;
  return Number.isFinite(value) ? value : null;
}

function normalizeCftc(rows) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => {
    const number = (value) => toFiniteNumber(value);
    const nonNegativeNumber = (value) => { const parsed = number(value); return parsed !== null && parsed >= 0 ? parsed : null; };
    const nonCommercialLong = nonNegativeNumber(row.noncomm_positions_long_all);
    const nonCommercialShort = nonNegativeNumber(row.noncomm_positions_short_all);
    const commercialLong = nonNegativeNumber(row.comm_positions_long_all);
    const commercialShort = nonNegativeNumber(row.comm_positions_short_all);
    const changeLong = number(row.change_in_noncomm_long_all);
    const changeShort = number(row.change_in_noncomm_short_all);
    return {
      date: row.report_date_as_yyyy_mm_dd || null,
      contract: row.market_and_exchange_names || 'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
      openInterest: nonNegativeNumber(row.open_interest_all),
      nonCommercialLong,
      nonCommercialShort,
      nonCommercialNet: safeDifference(nonCommercialLong, nonCommercialShort),
      commercialLong,
      commercialShort,
      commercialNet: safeDifference(commercialLong, commercialShort),
      changeNonCommercialNet: safeDifference(changeLong, changeShort),
      traders: nonNegativeNumber(row.traders_tot_all),
    };
  }).filter((row) => {
    const timestamp = Date.parse(row.date);
    return Number.isFinite(timestamp) && timestamp <= Date.now() + 5 * 60 * 1000 && row.openInterest !== null && row.openInterest > 0;
  }).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const latest = normalized.at(-1) || null;
  const prior = normalized.at(-2) || null;
  return {
    latest,
    prior,
    observedAt: latest ? Date.parse(latest.date) : null,
    source: 'CFTC Legacy Futures Only / CME Bitcoin',
  };
}

async function loadCftc() {
  const query = "$where=cftc_contract_market_code='133741'&$order=report_date_as_yyyy_mm_dd DESC&$limit=2";
  const response = await fetch('https://publicreporting.cftc.gov/resource/6dca-aqww.json?' + query, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`CFTC HTTP ${response.status}`);
  const result = normalizeCftc(await response.json());
  if (!result.latest) throw new Error('CFTC sem linha BTC valida');
  return result;
}

module.exports = async function handler(request, response) {
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'public, s-maxage=300, stale-while-revalidate=900' })) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const parsedUrl = new URL(request.url || '/', 'http://localhost');
  const base = String(parsedUrl.searchParams.get('asset') || 'BTC').toUpperCase();
  if (!ALLOWED_ASSETS.has(base)) return response.status(400).json({ error: 'Invalid asset' });
  const mapping = ASSET_MAP[base] || null;
  const configured = { etf: !!mapping, cftc: true };
  const jobs = [];
  const keys = [];

  if (configured.etf) {
    keys.push('etf');
    jobs.push(loadEtf(mapping));
  }
  keys.push('cftc');
  jobs.push(loadCftc());

  const settled = await Promise.allSettled(jobs);
  const result = { asset: base, configured, etf: null, cftc: null, errors: {}, fetchedAt: Date.now() };
  settled.forEach((item, index) => {
    const key = keys[index];
    if (item.status === 'fulfilled') result[key] = item.value;
    else result.errors[key] = String(item.reason && item.reason.message || item.reason);
  });

  const available = ['etf', 'cftc'].filter((key) => result[key]).length;
  result.dataStatus = available === keys.length ? 'fresh' : available ? 'partial' : 'error';
  return response.status(available ? 200 : 503).json(result);
};

module.exports.normalizeCftc = normalizeCftc;
module.exports.parseEtfMcpBody = parseEtfMcpBody;
module.exports.normalizeEtfFlows = normalizeEtfFlows;
