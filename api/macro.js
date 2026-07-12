function xmlValue(entry, name) {
  const match = entry.match(new RegExp(`<d:${name}(?:\\s[^>]*)?>([^<]+)<\\/d:${name}>`, 'i'));
  return match && Number.isFinite(Number(match[1])) ? Number(match[1]) : null;
}

function parseTreasury(xml) {
  const rows = (String(xml || '').match(/<entry>[\s\S]*?<\/entry>/gi) || []).map((entry) => {
    const dateMatch = entry.match(/<d:NEW_DATE(?:\s[^>]*)?>([^<]+)<\/d:NEW_DATE>/i);
    return {
      date: dateMatch ? dateMatch[1] : '',
      y2: xmlValue(entry, 'BC_2YEAR'),
      y10: xmlValue(entry, 'BC_10YEAR'),
      y30: xmlValue(entry, 'BC_30YEAR'),
    };
  }).filter((row) => row.date && row.y2 !== null && row.y10 !== null).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const latest = rows.at(-1);
  const prior = rows.at(-6) || rows.at(0);
  return latest ? {
    ...latest,
    curve10y2y: latest.y10 - latest.y2,
    y10Change5d: prior ? latest.y10 - prior.y10 : null,
    y2Change5d: prior ? latest.y2 - prior.y2 : null,
  } : null;
}

function parseVix(csv) {
  const lines = String(csv || '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(',');
    return { date: parts[0], close: Number(parts[4]) };
  }).filter((row) => row.date && Number.isFinite(row.close));
  const latest = rows.at(-1), prior = rows.at(-6) || rows.at(0);
  return latest ? { ...latest, change5d: prior && prior.close ? ((latest.close - prior.close) / prior.close) * 100 : null } : null;
}

async function getText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const year = new Date().getUTCFullYear();
  const treasuryUrl = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${year}`;
  const vixUrl = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
  const results = await Promise.allSettled([getText(treasuryUrl), getText(vixUrl)]);
  const treasury = results[0].status === 'fulfilled' ? parseTreasury(results[0].value) : null;
  const vix = results[1].status === 'fulfilled' ? parseVix(results[1].value) : null;
  if (treasury) treasury.observedAt = Date.parse(treasury.date);
  if (vix) vix.observedAt = Date.parse(vix.date);
  let score = 0;
  if (vix) score += vix.close >= 35 ? -6 : vix.close >= 25 ? -4 : vix.close <= 17 ? 3 : 0;
  if (treasury && Number.isFinite(treasury.y10Change5d)) score += treasury.y10Change5d >= 0.15 ? -2 : treasury.y10Change5d <= -0.15 ? 2 : 0;
  if (treasury && treasury.curve10y2y < 0) score -= 1;

  response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
  response.setHeader('Access-Control-Allow-Origin', '*');
  const observedDates = [treasury && treasury.observedAt, vix && vix.observedAt].filter(Number.isFinite);
  const observedAt = observedDates.length ? Math.max(...observedDates) : null;
  return response.status(treasury || vix ? 200 : 503).json({ treasury, vix, score, observedAt, fetchedAt: Date.now() });
};
