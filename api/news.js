const { applyApiPolicyAsync, publicApiError, publicErrorMessage } = require('../lib/api-guard');

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

function clip(value, length) {
  const text = String(value || '');
  return text.length <= length ? text : text.slice(0, length);
}

function parseRss(xml, source, asOf = Date.now()) {
  const items = String(xml || '').match(/<item\b[\s\S]*?<\/item>/gi) || [];
  return items.slice(0, 18).map((item) => {
    const title = clip(tag(item, 'title'), 300);
    const publishedValue = tag(item, 'pubDate') || tag(item, 'dc:date') || tag(item, 'date');
    const parsedPublished = Date.parse(publishedValue);
    const published = Number.isFinite(parsedPublished) && parsedPublished >= 0 && parsedPublished <= asOf + 5 * 60 * 1000 ? parsedPublished : null;
    return {
      title,
      body: clip(tag(item, 'description'), 2000),
      url: clip(tag(item, 'link'), 2048),
      source: clip(tag(item, 'source') || source.name, 120),
      published,
      type: source.type,
    };
  }).filter((item) => item.title && /^https?:\/\//i.test(item.url));
}

async function fetchFeed(source) {
  const response = await fetch(source.url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw publicApiError(`${source.name}: HTTP ${response.status}`);
  return parseRss(await response.text(), source);
}

module.exports = async function handler(request, response) {
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'public, s-maxage=300, stale-while-revalidate=900' })) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const results = await Promise.allSettled(SOURCES.map(fetchFeed));
  const items = results
    .flatMap((result) => result.status === 'fulfilled' ? result.value : [])
    .sort((a, b) => (b.published || 0) - (a.published || 0))
    .filter((item, index, rows) => rows.findIndex((row) => row.title === item.title) === index)
    .slice(0, 40);
  const sources = results.map((result, index) => ({
    name: SOURCES[index].name,
    ok: result.status === 'fulfilled' && result.value.length > 0,
    count: result.status === 'fulfilled' ? result.value.length : 0,
    error: result.status === 'rejected' ? publicErrorMessage(`news-${SOURCES[index].name}`, result.reason) : null,
  }));

  return response.status(items.length ? 200 : 503).json({ items, sources, fetchedAt: Date.now() });
};

module.exports.parseRss = parseRss;
