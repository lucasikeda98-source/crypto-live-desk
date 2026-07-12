const SOURCES = [
  {
    name: 'Google News Crypto',
    type: 'crypto',
    url: 'https://news.google.com/rss/search?q=(bitcoin%20OR%20ethereum%20OR%20crypto)%20when%3A1d&hl=en-US&gl=US&ceid=US%3Aen',
  },
  {
    name: 'Google News Macro',
    type: 'macro',
    url: 'https://news.google.com/rss/search?q=(Federal%20Reserve%20OR%20inflation%20OR%20geopolitics%20OR%20oil)%20markets%20when%3A2d&hl=en-US&gl=US&ceid=US%3Aen',
  },
  { name: 'CoinDesk', type: 'crypto', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
  { name: 'Decrypt', type: 'crypto', url: 'https://decrypt.co/feed' },
];

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(item, name) {
  const match = item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function parseRss(xml, source) {
  const items = String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 18).map((item) => {
    const title = tag(item, 'title');
    const publishedValue = tag(item, 'pubDate') || tag(item, 'dc:date') || tag(item, 'date');
    return {
      title,
      body: tag(item, 'description'),
      url: tag(item, 'link'),
      source: tag(item, 'source') || source.name,
      published: Number.isFinite(Date.parse(publishedValue)) ? Date.parse(publishedValue) : Date.now(),
      type: source.type,
    };
  }).filter((item) => item.title && /^https?:\/\//i.test(item.url));
}

async function fetchFeed(source) {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  return parseRss(await response.text(), source);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const results = await Promise.allSettled(SOURCES.map(fetchFeed));
  const items = results
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .sort((a, b) => b.published - a.published)
    .filter((item, index, rows) => rows.findIndex((row) => row.title === item.title) === index)
    .slice(0, 40);
  const sources = results.map((result, index) => ({
    name: SOURCES[index].name,
    ok: result.status === 'fulfilled' && result.value.length > 0,
    count: result.status === 'fulfilled' ? result.value.length : 0,
    error: result.status === 'rejected' ? String(result.reason && result.reason.message || result.reason) : null,
  }));

  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  response.setHeader('Access-Control-Allow-Origin', '*');
  return response.status(items.length ? 200 : 503).json({ items, sources, fetchedAt: Date.now() });
};
