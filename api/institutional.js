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

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const parsedUrl = new URL(request.url || '/', 'http://localhost');
  const base = String(parsedUrl.searchParams.get('asset') || 'BTC').toUpperCase();
  const mapping = ASSET_MAP[base] || null;
  const configured = { etf: !!mapping };
  const jobs = [];
  const keys = [];

  if (configured.etf) {
    keys.push('etf');
    jobs.push(loadEtf(mapping));
  }

  const settled = await Promise.allSettled(jobs);
  const result = { asset: base, configured, etf: null, errors: {}, fetchedAt: Date.now() };
  settled.forEach((item, index) => {
    const key = keys[index];
    if (item.status === 'fulfilled') result.etf = item.value;
    else result.errors[key] = String(item.reason && item.reason.message || item.reason);
  });

  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  response.setHeader('Access-Control-Allow-Origin', '*');
  return response.status(200).json(result);
};
