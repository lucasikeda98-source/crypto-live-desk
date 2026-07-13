const ASSET_MAP = {
  BTC: 'btc',
  ETH: 'eth',
  SOL: 'sol',
  XRP: 'xrp',
  HYPE: 'hyp',
};

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
  const body = await response.text();
  const dataLine = body.split(/\r?\n/).find((line) => line.startsWith('data: '));
  if (!dataLine) throw new Error('ETF MCP sem payload');
  const envelope = JSON.parse(dataLine.slice(6));
  const text = envelope && envelope.result && envelope.result.content && envelope.result.content.find((item) => item.type === 'text')?.text;
  if (!text) throw new Error('ETF MCP sem conteudo');
  return JSON.parse(text);
}

async function loadEtf(asset) {
  // Only get_asset_flows is consumed by the client; weekly analytics and the CeFi index were
  // fetched and discarded, tripling the failure surface of the one dataset that scores.
  const flows = await callEtfTool('get_asset_flows', { asset });
  return { flows, source: 'CryptoETF public MCP' };
}

function normalizeCftc(rows) {
  const normalized = (Array.isArray(rows) ? rows : []).map((row) => {
    const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
    const nonCommercialLong = number(row.noncomm_positions_long_all);
    const nonCommercialShort = number(row.noncomm_positions_short_all);
    const commercialLong = number(row.comm_positions_long_all);
    const commercialShort = number(row.comm_positions_short_all);
    const changeLong = number(row.change_in_noncomm_long_all);
    const changeShort = number(row.change_in_noncomm_short_all);
    return {
      date: row.report_date_as_yyyy_mm_dd || null,
      contract: row.market_and_exchange_names || 'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
      openInterest: number(row.open_interest_all),
      nonCommercialLong,
      nonCommercialShort,
      nonCommercialNet: nonCommercialLong !== null && nonCommercialShort !== null ? nonCommercialLong - nonCommercialShort : null,
      commercialLong,
      commercialShort,
      commercialNet: commercialLong !== null && commercialShort !== null ? commercialLong - commercialShort : null,
      changeNonCommercialNet: changeLong !== null && changeShort !== null ? changeLong - changeShort : null,
      traders: number(row.traders_tot_all),
    };
  }).filter((row) => row.date && row.openInterest !== null).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
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
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const parsedUrl = new URL(request.url || '/', 'http://localhost');
  const base = String(parsedUrl.searchParams.get('asset') || 'BTC').toUpperCase();
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

  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  response.setHeader('Access-Control-Allow-Origin', '*');
  return response.status(200).json(result);
};

module.exports.normalizeCftc = normalizeCftc;
