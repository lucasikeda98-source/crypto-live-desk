(function () {
  var REFRESH_MS = 12000;
  var NEWS_REFRESH_MS = 300000;
  var ASSETS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'TRXUSDT', 'DOTUSDT', 'LTCUSDT', 'BCHUSDT', 'UNIUSDT', 'NEARUSDT', 'ATOMUSDT', 'FILUSDT', 'AAVEUSDT'];
  var ASSET_NAMES = {
    BTCUSDT: 'Bitcoin',
    ETHUSDT: 'Ethereum',
    BNBUSDT: 'BNB',
    SOLUSDT: 'Solana',
    XRPUSDT: 'XRP',
    DOGEUSDT: 'Dogecoin',
    ADAUSDT: 'Cardano',
    AVAXUSDT: 'Avalanche',
    LINKUSDT: 'Chainlink',
    TRXUSDT: 'TRON',
    DOTUSDT: 'Polkadot',
    LTCUSDT: 'Litecoin',
    BCHUSDT: 'Bitcoin Cash',
    UNIUSDT: 'Uniswap',
    NEARUSDT: 'NEAR',
    ATOMUSDT: 'Cosmos',
    FILUSDT: 'Filecoin',
    AAVEUSDT: 'Aave'
  };
  var state = { symbol: 'BTCUSDT', interval: '5m', live: true, timer: null, klines: [], analysis: null, board: [], sort: 'score', chain: null, news: [], newsFetchedAt: 0, newsMode: 'auto' };
  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  var fmt0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function money(n) { return Number.isFinite(n) ? '$' + fmt.format(n) : '--'; }
  function compactMoney(n) { return Number.isFinite(n) ? '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : '--'; }
  function num(n, d) { return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: d == null ? 2 : d }).format(n) : '--'; }
  function percent(n, d) { return Number.isFinite(n) ? (n >= 0 ? '+' : '') + n.toFixed(d == null ? 2 : d) + '%' : '--'; }
  function text(id, value) { var node = $(id); if (node) node.textContent = value; }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function avg(values) { return values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : NaN; }
  function last(arr) { return arr[arr.length - 1]; }
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch];
    });
  }
  function safeURL(value) {
    var url = String(value || '#');
    return /^https?:\/\//i.test(url) ? url : '#';
  }
  function lastFinite(arr) {
    for (var i = arr.length - 1; i >= 0; i--) {
      if (Number.isFinite(arr[i])) return arr[i];
    }
    return NaN;
  }
  function baseAsset(symbol) { return symbol.replace(/USDT$/, ''); }
  async function fetchJSON(url, timeout) {
    var controller = new AbortController();
    var id = setTimeout(function () { controller.abort(); }, timeout || 9000);
    try {
      var res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } finally { clearTimeout(id); }
  }
  function parseKlines(rows) {
    return (rows || []).map(function (k) {
      return { time: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: +k[6], quote: +k[7], trades: +k[8], takerBuy: +k[9] };
    }).filter(function (c) { return Number.isFinite(c.close); });
  }
  function emaSeries(values, period) {
    if (values.length < period) return [];
    var k = 2 / (period + 1), out = [], seed = avg(values.slice(0, period));
    for (var i = 0; i < values.length; i++) {
      if (i < period - 1) out.push(null);
      else if (i === period - 1) out.push(seed);
      else out.push(values[i] * k + out[i - 1] * (1 - k));
    }
    return out;
  }
  function rsi(values, period) {
    if (values.length <= period) return NaN;
    var gains = 0, losses = 0;
    for (var i = values.length - period; i < values.length; i++) {
      var diff = values[i] - values[i - 1];
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    if (losses === 0) return 100;
    var rs = gains / losses;
    return 100 - (100 / (1 + rs));
  }
  function rsiSeries(values, period) {
    var out = values.map(function () { return null; });
    for (var i = period; i < values.length; i++) {
      var gains = 0, losses = 0;
      for (var j = i - period + 1; j <= i; j++) {
        var diff = values[j] - values[j - 1];
        if (diff >= 0) gains += diff; else losses -= diff;
      }
      out[i] = losses === 0 ? 100 : 100 - (100 / (1 + gains / losses));
    }
    return out;
  }
  function stochRsi(values, period) {
    var series = rsiSeries(values, period).filter(function (v) { return v != null; });
    if (series.length < period) return NaN;
    var recent = series.slice(-period);
    var min = Math.min.apply(null, recent);
    var max = Math.max.apply(null, recent);
    var latest = last(recent);
    return max === min ? 50 : ((latest - min) / (max - min)) * 100;
  }
  function mfi(candles, period) {
    if (candles.length <= period) return NaN;
    var positive = 0, negative = 0;
    for (var i = candles.length - period; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1];
      var typical = (c.high + c.low + c.close) / 3;
      var prevTypical = (p.high + p.low + p.close) / 3;
      var flow = typical * c.volume;
      if (typical >= prevTypical) positive += flow; else negative += flow;
    }
    if (negative === 0) return 100;
    var ratio = positive / negative;
    return 100 - (100 / (1 + ratio));
  }
  function bollinger(values, period, mult) {
    var mid = values.map(function () { return null; });
    var upper = values.map(function () { return null; });
    var lower = values.map(function () { return null; });
    for (var i = period - 1; i < values.length; i++) {
      var slice = values.slice(i - period + 1, i + 1);
      var mean = avg(slice);
      var variance = avg(slice.map(function (v) { return Math.pow(v - mean, 2); }));
      var deviation = Math.sqrt(variance);
      mid[i] = mean;
      upper[i] = mean + deviation * mult;
      lower[i] = mean - deviation * mult;
    }
    return { mid: mid, upper: upper, lower: lower, latestMid: lastFinite(mid), latestUpper: lastFinite(upper), latestLower: lastFinite(lower) };
  }
  function atr(candles, period) {
    if (candles.length <= period) return NaN;
    var trs = [];
    for (var i = 1; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1];
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
    }
    return avg(trs.slice(-period));
  }
  function macd(values) {
    var fast = emaSeries(values, 12), slow = emaSeries(values, 26);
    var line = values.map(function (_, i) { return fast[i] == null || slow[i] == null ? null : fast[i] - slow[i]; });
    var valid = line.filter(function (v) { return v != null; });
    var signalRaw = emaSeries(valid, 9);
    var signal = signalRaw.length ? last(signalRaw) : null;
    var macdLine = last(valid);
    return { line: macdLine, signal: signal, hist: macdLine != null && signal != null ? macdLine - signal : NaN };
  }
  function macdSeries(values) {
    var fast = emaSeries(values, 12), slow = emaSeries(values, 26);
    var line = values.map(function (_, i) { return fast[i] == null || slow[i] == null ? null : fast[i] - slow[i]; });
    var compact = [], indexMap = [];
    line.forEach(function (v, i) {
      if (v != null) {
        compact.push(v);
        indexMap.push(i);
      }
    });
    var compactSignal = emaSeries(compact, 9);
    var signal = values.map(function () { return null; });
    var hist = values.map(function () { return null; });
    compactSignal.forEach(function (v, i) {
      var index = indexMap[i];
      signal[index] = v;
      hist[index] = v == null ? null : compact[i] - v;
    });
    return { line: line, signal: signal, hist: hist, latestLine: lastFinite(line), latestSignal: lastFinite(signal), latestHist: lastFinite(hist) };
  }
  function vwap(candles, lookback) {
    var rows = candles.slice(-(lookback || 48));
    var pv = 0, vol = 0;
    rows.forEach(function (c) { var tp = (c.high + c.low + c.close) / 3; pv += tp * c.volume; vol += c.volume; });
    return vol ? pv / vol : NaN;
  }
  function pivots(candles) {
    var highs = [], lows = [];
    for (var i = 2; i < candles.length - 2; i++) {
      var c = candles[i];
      if (c.high > candles[i - 1].high && c.high > candles[i - 2].high && c.high > candles[i + 1].high && c.high > candles[i + 2].high) highs.push({ price: c.high, time: c.time });
      if (c.low < candles[i - 1].low && c.low < candles[i - 2].low && c.low < candles[i + 1].low && c.low < candles[i + 2].low) lows.push({ price: c.low, time: c.time });
    }
    return { highs: highs, lows: lows };
  }
  function dedupeLevels(levels, price) {
    var threshold = price * 0.0018, out = [];
    levels.forEach(function (level) { if (!out.some(function (x) { return Math.abs(x - level) < threshold; })) out.push(level); });
    return out;
  }
  function buildCoreAnalysis(candles, ticker, premium, options) {
    options = options || {};
    var closes = candles.map(function (c) { return c.close; });
    var close = last(closes);
    var ema9 = last(emaSeries(closes, 9));
    var ema21 = last(emaSeries(closes, 21));
    var ema20 = last(emaSeries(closes, 20));
    var ema50 = last(emaSeries(closes, 50));
    var ema200 = last(emaSeries(closes, 200));
    var rsiValues = rsiSeries(closes, 14);
    var rsi14 = rsi(closes, 14);
    var stochRsi14 = stochRsi(closes, 14);
    var mfi14 = mfi(candles, 14);
    var atr14 = atr(candles, 14);
    var macdNow = macd(closes);
    var macdData = macdSeries(closes);
    var bb = bollinger(closes, 20, 2);
    var vwapNow = vwap(candles, 48);
    var pv = pivots(candles);
    var lows = pv.lows.map(function (x) { return x.price; }).concat(candles.slice(-90).map(function (c) { return c.low; }).sort(function (a, b) { return a - b; }).slice(0, 2));
    var highs = pv.highs.map(function (x) { return x.price; }).concat(candles.slice(-90).map(function (c) { return c.high; }).sort(function (a, b) { return b - a; }).slice(0, 2));
    var supports = dedupeLevels(lows.filter(function (x) { return x < close; }).sort(function (a, b) { return b - a; }), close).slice(0, 3);
    var resistances = dedupeLevels(highs.filter(function (x) { return x > close; }).sort(function (a, b) { return a - b; }), close).slice(0, 3);
    var recent = candles.slice(-6), prior = candles.slice(-42, -6);
    var priorLow = Math.min.apply(null, prior.map(function (c) { return c.low; }));
    var priorHigh = Math.max.apply(null, prior.map(function (c) { return c.high; }));
    var recentLow = Math.min.apply(null, recent.map(function (c) { return c.low; }));
    var recentHigh = Math.max.apply(null, recent.map(function (c) { return c.high; }));
    var sweepDown = recentLow < priorLow && close > priorLow;
    var sweepUp = recentHigh > priorHigh && close < priorHigh;
    var lastHighs = pv.highs.slice(-2), lastLows = pv.lows.slice(-2);
    var structure = 'Range';
    if (lastHighs.length > 1 && lastLows.length > 1) {
      if (lastHighs[1].price > lastHighs[0].price && lastLows[1].price > lastLows[0].price) structure = 'HH/HL';
      else if (lastHighs[1].price < lastHighs[0].price && lastLows[1].price < lastLows[0].price) structure = 'LH/LL';
    }
    var deltas = candles.slice(-40).map(function (c) { return c.takerBuy - Math.max(0, c.volume - c.takerBuy); });
    var deltaSum = deltas.reduce(function (a, b) { return a + b; }, 0);
    var avgVol = avg(candles.slice(-25, -1).map(function (c) { return c.volume; }));
    var lastVol = last(candles).volume;
    var funding = premium ? +premium.lastFundingRate : NaN;
    var basis = premium ? (+premium.markPrice - +premium.indexPrice) : NaN;
    var trendScore = (close > ema9 ? 6 : -6) + (close > ema21 ? 8 : -8) + (close > ema50 ? 10 : -10) + (ema21 > ema50 ? 8 : -8);
    var momScore = (rsi14 > 52 && rsi14 < 70 ? 12 : rsi14 >= 78 ? -8 : rsi14 >= 70 ? 3 : rsi14 < 35 ? -10 : 0) + (macdNow.hist > 0 ? 8 : -8) + (stochRsi14 > 80 ? -3 : stochRsi14 < 20 ? 3 : 0);
    var flowScore = (deltaSum > 0 ? 9 : -9) + (lastVol > avgVol * 1.35 ? 5 : 0);
    var derivScore = (Number.isFinite(funding) && funding > 0.0003 ? -6 : Number.isFinite(funding) && funding > 0 ? 3 : -3) + (basis > 0 ? 3 : -3);
    var chainScore = options.chainScore || 0;
    var bookScore = options.bookScore || 0;
    var score = clamp(Math.round(trendScore + momScore + flowScore + derivScore + chainScore + bookScore), -100, 100);
    var bias = score >= 35 ? 'Comprador' : score <= -35 ? 'Vendedor' : 'Neutro';
    return { close: close, ema9: ema9, ema21: ema21, ema20: ema20, ema50: ema50, ema200: ema200, rsi14: rsi14, rsiValues: rsiValues, stochRsi14: stochRsi14, mfi14: mfi14, atr14: atr14, macd: macdNow, macdData: macdData, bb: bb, vwap: vwapNow, supports: supports, resistances: resistances, structure: structure, sweepDown: sweepDown, sweepUp: sweepUp, priorLow: priorLow, priorHigh: priorHigh, deltaSum: deltaSum, avgVol: avgVol, lastVol: lastVol, funding: funding, basis: basis, score: score, bias: bias, trendScore: trendScore, momScore: momScore, flowScore: flowScore, derivScore: derivScore, chainScore: chainScore, bookScore: bookScore, ticker: ticker };
  }
  function mergeSelected(candles, ticker, depth, premium, oi, chain) {
    var chainScore = chain && chain.fees && Number.isFinite(+chain.fees.fastestFee) ? (+chain.fees.fastestFee > 80 ? -8 : +chain.fees.fastestFee < 20 ? 5 : 0) : 0;
    var bidQty = 0, askQty = 0, bidNotional = 0, askNotional = 0, spread = NaN, close = last(candles).close, mid = close;
    if (depth && depth.bids && depth.asks && depth.bids.length && depth.asks.length) {
      var bestBid = +depth.bids[0][0], bestAsk = +depth.asks[0][0];
      spread = bestAsk - bestBid; mid = (bestBid + bestAsk) / 2;
      depth.bids.forEach(function (b) { var p = +b[0], q = +b[1]; if (p >= mid * 0.999) { bidQty += q; bidNotional += p * q; } });
      depth.asks.forEach(function (a) { var p = +a[0], q = +a[1]; if (p <= mid * 1.001) { askQty += q; askNotional += p * q; } });
    }
    var bookImb = (bidQty + askQty) ? (bidQty - askQty) / (bidQty + askQty) : 0;
    var bookScore = bookImb > 0.12 ? 10 : bookImb < -0.12 ? -10 : 0;
    var a = buildCoreAnalysis(candles, ticker, premium, { chainScore: chainScore, bookScore: bookScore });
    a.bidQty = bidQty; a.askQty = askQty; a.bidNotional = bidNotional; a.askNotional = askNotional; a.spread = spread; a.bookImb = bookImb; a.oi = oi; a.chain = chain;
    return a;
  }
  async function loadChain() {
    var out = {};
    var rows = await Promise.allSettled([
      fetchJSON('https://mempool.space/api/v1/fees/recommended', 7000),
      fetchJSON('https://mempool.space/api/mempool', 7000),
      fetchJSON('https://mempool.space/api/blocks/tip/height', 7000)
    ]);
    if (rows[0].status === 'fulfilled') out.fees = rows[0].value;
    if (rows[1].status === 'fulfilled') out.mempool = rows[1].value;
    if (rows[2].status === 'fulfilled') out.height = rows[2].value;
    return out;
  }
  async function loadNewsIfNeeded(force) {
    if (!force && Date.now() - state.newsFetchedAt < NEWS_REFRESH_MS) return;
    var cryptoUrl = 'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&excludeCategories=Sponsored&sortOrder=latest';
    var macroUrl = 'https://api.gdeltproject.org/api/v2/doc/doc?query=bitcoin%20crypto%20federal%20reserve%20inflation%20oil%20markets&mode=artlist&format=json&maxrecords=15&sort=hybridrel';
    var rows = await Promise.allSettled([fetchJSON(cryptoUrl, 9000), fetchJSON(macroUrl, 9000)]);
    var news = [];
    if (rows[0].status === 'fulfilled' && rows[0].value && rows[0].value.Data) {
      rows[0].value.Data.slice(0, 24).forEach(function (item) {
        news.push({ title: item.title || '', body: item.body || '', url: item.url || '#', source: item.source || 'CryptoCompare', published: item.published_on ? item.published_on * 1000 : Date.now(), type: 'crypto' });
      });
    }
    if (rows[1].status === 'fulfilled' && rows[1].value && rows[1].value.articles) {
      rows[1].value.articles.slice(0, 16).forEach(function (item) {
        news.push({ title: item.title || '', body: item.seendate || '', url: item.url || '#', source: item.domain || 'GDELT', published: item.seendate ? Date.parse(item.seendate) : Date.now(), type: 'macro' });
      });
    }
    state.news = news.sort(function (a, b) { return (b.published || 0) - (a.published || 0); }).slice(0, 28);
    state.newsFetchedAt = Date.now();
  }
  function scoreNews(symbol) {
    if (state.newsMode === 'risk-on') return { score: 18, label: 'manual risk-on', items: [] };
    if (state.newsMode === 'risk-off') return { score: -18, label: 'manual risk-off', items: [] };
    if (state.newsMode === 'neutral') return { score: 0, label: 'manual neutro', items: [] };
    var base = baseAsset(symbol).toLowerCase();
    var name = (ASSET_NAMES[symbol] || '').toLowerCase();
    var positive = ['inflow', 'inflows', 'approval', 'approved', 'adoption', 'accumulation', 'reserve', 'rally', 'surge', 'dovish', 'rate cut', 'easing', 'lower inflation', 'institutional', 'partnership', 'upgrade', 'etf demand', 'buying'];
    var negative = ['outflow', 'outflows', 'hack', 'lawsuit', 'ban', 'crackdown', 'selloff', 'liquidation', 'hawkish', 'rate hike', 'higher inflation', 'war', 'sanction', 'oil spike', 'recession', 'default', 'exploit', 'probe'];
    var scored = state.news.map(function (item) {
      var textValue = (item.title + ' ' + item.body).toLowerCase();
      var raw = 0;
      positive.forEach(function (word) { if (textValue.indexOf(word) !== -1) raw += 1; });
      negative.forEach(function (word) { if (textValue.indexOf(word) !== -1) raw -= 1; });
      var relevance = item.type === 'macro' ? 0.75 : 0.55;
      if (textValue.indexOf(base) !== -1 || (name && textValue.indexOf(name) !== -1)) relevance = 1.35;
      if (textValue.indexOf('bitcoin') !== -1 || textValue.indexOf('crypto') !== -1 || textValue.indexOf('etf') !== -1) relevance = Math.max(relevance, 0.9);
      return { item: item, score: raw * relevance, relevance: relevance };
    }).filter(function (row) { return row.score !== 0 || row.relevance >= 1.2; });
    var total = scored.reduce(function (sum, row) { return sum + row.score; }, 0);
    var score = clamp(Math.round(total * 6), -22, 22);
    return { score: score, label: state.news.length ? 'auto noticias' : 'sem noticias', items: scored.sort(function (a, b) { return Math.abs(b.score) - Math.abs(a.score); }).slice(0, 6) };
  }
  function buildConfluence(a) {
    var news = scoreNews(state.symbol);
    var technical = clamp(Math.round(a.trendScore * 0.55 + a.momScore * 0.75), -35, 35);
    var flow = clamp(Math.round(a.flowScore + a.bookScore), -25, 25);
    var derivatives = clamp(Math.round(a.derivScore * 1.7), -15, 15);
    var chain = clamp(Math.round(a.chainScore), -10, 10);
    var macro = clamp(news.score, -22, 22);
    var risk = 0;
    var volumeRatio = Number.isFinite(a.avgVol) && a.avgVol ? a.lastVol / a.avgVol : 1;
    if (Number.isFinite(a.bb.latestUpper) && a.close > a.bb.latestUpper && a.rsi14 >= 68) risk -= 8;
    if (Number.isFinite(a.bb.latestLower) && a.close < a.bb.latestLower && a.rsi14 <= 35) risk -= 6;
    if (a.sweepDown && a.close > a.vwap) risk += 5;
    if (a.sweepUp) risk -= 5;
    if (volumeRatio > 1.45 && a.deltaSum > 0) risk += 4;
    if (volumeRatio > 1.45 && a.deltaSum < 0) risk -= 4;
    risk = clamp(risk, -12, 12);
    var total = clamp(Math.round(technical + flow + derivatives + chain + macro + risk), -100, 100);
    var decision = 'Sem entrada clara';
    var tone = 'wait';
    if (total >= 68) { decision = 'Entrada favoravel'; tone = 'long'; }
    else if (total >= 45) { decision = 'Entrada com confirmacao'; tone = 'long'; }
    else if (total >= 20) { decision = 'Aguardar pullback'; tone = 'wait'; }
    else if (total <= -45) { decision = 'Evitar / venda domina'; tone = 'avoid'; }
    else if (total <= -20) { decision = 'Cautela'; tone = 'avoid'; }
    var reasons = [
      { tone: technical > 10 ? 'good' : technical < -10 ? 'bad' : 'neutral', text: technical > 10 ? 'Tecnica favorece compra: medias, RSI/MACD e estrutura estao alinhados.' : technical < -10 ? 'Tecnica pesa contra: tendencia ou momentum ainda fragil.' : 'Tecnica mista: ainda precisa de rompimento, reteste ou perda clara de faixa.' },
      { tone: flow > 7 ? 'good' : flow < -7 ? 'bad' : 'neutral', text: flow > 7 ? 'Fluxo confirma: delta taker e livro mostram demanda no curto prazo.' : flow < -7 ? 'Fluxo pressiona: agressao vendedora ou ask dominando o livro.' : 'Fluxo equilibrado: livro e volume ainda nao confirmam direcao.' },
      { tone: derivatives > 4 ? 'good' : derivatives < -4 ? 'bad' : 'neutral', text: derivatives > 4 ? 'Derivativos dao apoio leve, sem excesso evidente no funding.' : derivatives < -4 ? 'Derivativos pedem cautela: funding/basis podem indicar trade lotado.' : 'Derivativos neutros, sem vantagem quantitativa clara.' },
      { tone: macro > 5 ? 'good' : macro < -5 ? 'bad' : 'neutral', text: macro > 5 ? 'Noticias e macro estao em modo mais favoravel para risco.' : macro < -5 ? 'Noticias e macro aumentam risco de volatilidade negativa.' : 'Noticias/macro sem impulso forte no momento.' }
    ];
    if (risk !== 0) {
      reasons.push({ tone: risk > 0 ? 'good' : 'bad', text: risk > 0 ? 'Ajuste de risco melhora o setup por absorcao/volume.' : 'Ajuste de risco reduz o setup por esticamento, sweep contra ou volume vendedor.' });
    }
    return {
      total: total,
      decision: decision,
      tone: tone,
      news: news,
      reasons: reasons.slice(0, 5),
      components: [
        { name: 'Tecnica', score: technical, max: 35 },
        { name: 'Fluxo', score: flow, max: 25 },
        { name: 'Derivativos', score: derivatives, max: 15 },
        { name: 'On-chain', score: chain, max: 10 },
        { name: 'Noticias', score: macro, max: 22 },
        { name: 'Risco', score: risk, max: 12 }
      ]
    };
  }
  function signed(n) { return (n > 0 ? '+' : '') + String(n); }
  function renderConfluence(a) {
    var c = buildConfluence(a);
    var entry = $('entryDecision');
    if (entry) {
      var card = entry.closest('.entry-card');
      if (card) card.className = 'entry-card ' + c.tone;
    }
    text('confluenceSummary', 'Score composto para ' + state.symbol + ': tecnica no timeframe ' + state.interval + '; book, funding, OI e noticias em leitura atual.');
    text('entryDecision', c.decision);
    text('entryScoreLine', 'Score ' + signed(c.total) + ' / 100 | atualiza mercado a cada ' + Math.round(REFRESH_MS / 1000) + 's');
    var bars = $('confluenceBars');
    if (bars) {
      bars.innerHTML = c.components.map(function (item) {
        var pct = clamp(Math.abs(item.score) / item.max * 50, 0, 50);
        var left = item.score >= 0 ? 50 : 50 - pct;
        var cls = item.score > 0 ? 'positive' : item.score < 0 ? 'negative' : '';
        return '<div class="score-row"><div class="score-row-header"><span>' + escapeHTML(item.name) + '</span><strong>' + signed(item.score) + '</strong></div><div class="score-track"><span class="score-fill ' + cls + '" style="left:' + left.toFixed(2) + '%;width:' + pct.toFixed(2) + '%"></span></div></div>';
      }).join('');
    }
    var reasons = $('confluenceReasons');
    if (reasons) {
      reasons.innerHTML = c.reasons.map(function (item) {
        var dot = item.tone === 'good' ? 'good' : item.tone === 'bad' ? 'bad' : '';
        return '<div class="reason-item"><span class="reason-dot ' + dot + '"></span><span>' + escapeHTML(item.text) + '</span></div>';
      }).join('');
    }
    text('newsScoreLine', signed(c.news.score) + ' | ' + c.news.label);
    var newsList = $('newsList');
    if (newsList) {
      var rows = c.news.items.length ? c.news.items.map(function (x) { return x.item; }) : state.news.slice(0, 5);
      newsList.innerHTML = rows.length ? rows.slice(0, 5).map(function (item) {
        var time = item.published ? new Date(item.published).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        return '<div class="news-item"><a href="' + escapeHTML(safeURL(item.url)) + '" target="_blank" rel="noreferrer">' + escapeHTML(item.title || 'Sem titulo') + '</a><small>' + escapeHTML(item.source || 'Fonte') + (time ? ' | ' + escapeHTML(time) : '') + '</small></div>';
      }).join('') : '<div class="news-item"><small>Sem noticias carregadas agora. Use o botao para tentar atualizar.</small></div>';
    }
    var status = state.newsFetchedAt ? 'Noticias/macro: auto a cada 5 min. Ultima leitura ' + new Date(state.newsFetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + '.' : 'Noticias/macro: tentando carregar fontes externas.';
    text('newsStatus', status);
  }
  function value(result) { return result && result.status === 'fulfilled' ? result.value : null; }
  function tickerMapFromRows(rows) {
    var map = {};
    (rows || []).forEach(function (row) { map[row.symbol] = row; });
    return map;
  }
  function premiumMapFromRows(rows) {
    var map = {};
    (rows || []).forEach(function (row) { map[row.symbol] = row; });
    return map;
  }
  async function refresh() {
    state.symbol = normalizeSymbol($('symbolSelect').value);
    $('symbolSelect').value = state.symbol;
    state.interval = $('intervalSelect').value;
    if (ASSETS.indexOf(state.symbol) === -1) ASSETS.unshift(state.symbol);
    text('statusText', 'Buscando mercado multiativos...');
    try {
      var symbolsParam = encodeURIComponent(JSON.stringify(ASSETS));
      var baseResults = await Promise.allSettled([
        fetchJSON('https://api.binance.com/api/v3/ticker/24hr?symbols=' + symbolsParam, 10000),
        fetchJSON('https://fapi.binance.com/fapi/v1/premiumIndex', 10000),
        loadChain(),
        loadNewsIfNeeded(false)
      ]);
      var tickerMap = tickerMapFromRows(value(baseResults[0]));
      var premiumMap = premiumMapFromRows(value(baseResults[1]));
      state.chain = value(baseResults[2]) || {};
      var boardResults = await Promise.allSettled(ASSETS.map(function (symbol) { return loadBoardAsset(symbol, tickerMap[symbol], premiumMap[symbol]); }));
      state.board = boardResults.map(value).filter(Boolean);
      renderBoard();
      await refreshSelected(tickerMap[state.symbol], premiumMap[state.symbol], state.chain);
      text('statusText', 'Live: ' + ASSETS.length + ' pares | mercado ' + Math.round(REFRESH_MS / 1000) + 's | noticias/macro 5min');
    } catch (error) {
      text('statusText', 'Falha ao atualizar: ' + error.message);
    }
  }
  function normalizeSymbol(value) {
    var clean = String(value || 'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean.endsWith('USDT')) clean += 'USDT';
    return clean || 'BTCUSDT';
  }
  async function loadBoardAsset(symbol, ticker, premium) {
    var rows = await fetchJSON('https://api.binance.com/api/v3/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + state.interval + '&limit=140', 10000);
    var candles = parseKlines(rows);
    if (!candles.length) return null;
    var analysis = buildCoreAnalysis(candles, ticker, premium, {});
    return { symbol: symbol, ticker: ticker, premium: premium, candles: candles, analysis: analysis };
  }
  async function refreshSelected(ticker, premium, chain) {
    var s = encodeURIComponent(state.symbol);
    var results = await Promise.allSettled([
      fetchJSON('https://api.binance.com/api/v3/klines?symbol=' + s + '&interval=' + state.interval + '&limit=240', 10000),
      fetchJSON('https://api.binance.com/api/v3/depth?symbol=' + s + '&limit=100', 10000),
      fetchJSON('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + s, 9000),
      ticker ? Promise.resolve(ticker) : fetchJSON('https://api.binance.com/api/v3/ticker/24hr?symbol=' + s, 9000),
      premium ? Promise.resolve(premium) : fetchJSON('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + s, 9000)
    ]);
    var candles = parseKlines(value(results[0]));
    if (!candles.length) throw new Error('Sem candles para ' + state.symbol);
    state.klines = candles;
    state.analysis = mergeSelected(candles, value(results[3]), value(results[1]), value(results[4]), value(results[2]), chain || {});
    render(value(results[3]), value(results[4]), value(results[2]), chain || {}, value(results[1]));
  }
  function sortedBoard() {
    var rows = state.board.slice();
    if (state.sort === 'change') rows.sort(function (a, b) { return (+((b.ticker || {}).priceChangePercent || 0)) - (+((a.ticker || {}).priceChangePercent || 0)); });
    else if (state.sort === 'volume') rows.sort(function (a, b) { return (+((b.ticker || {}).quoteVolume || 0)) - (+((a.ticker || {}).quoteVolume || 0)); });
    else rows.sort(function (a, b) { return b.analysis.score - a.analysis.score; });
    return rows;
  }
  function renderBoard() {
    var grid = $('assetGrid'); if (!grid) return;
    grid.innerHTML = '';
    var rows = sortedBoard();
    var bulls = rows.filter(function (x) { return x.analysis.bias === 'Comprador'; }).length;
    var bears = rows.filter(function (x) { return x.analysis.bias === 'Vendedor'; }).length;
    text('boardSummary', bulls + ' compradores, ' + bears + ' vendedores, ' + (rows.length - bulls - bears) + ' neutros no tempo ' + state.interval);
    rows.forEach(function (item) {
      var a = item.analysis, t = item.ticker || {};
      var card = document.createElement('button');
      card.className = 'asset-card' + (item.symbol === state.symbol ? ' active' : '');
      card.type = 'button'; card.dataset.symbol = item.symbol;
      card.innerHTML = '<div class="asset-top"><div><span class="asset-symbol">' + baseAsset(item.symbol) + '</span><small>' + (ASSET_NAMES[item.symbol] || item.symbol) + '</small></div><span class="asset-score ' + scoreClass(a.bias) + '">' + a.score + '</span></div>' +
        '<div class="asset-row"><div><span>Preco</span><strong>' + money(a.close) + '</strong></div><div><span>24h</span><strong class="' + ((+t.priceChangePercent || 0) >= 0 ? 'up' : 'down') + '">' + percent(+t.priceChangePercent) + '</strong></div></div>' +
        sparkline(item.candles) +
        '<div class="asset-meta"><div><span>Bias</span><strong>' + a.bias + '</strong></div><div><span>RSI/MFI</span><strong>' + num(a.rsi14, 0) + ' / ' + num(a.mfi14, 0) + '</strong></div><div><span>Vol 24h</span><strong>' + compactMoney(+t.quoteVolume) + '</strong></div><div><span>Funding</span><strong>' + (Number.isFinite(a.funding) ? percent(a.funding * 100, 4) : '--') + '</strong></div></div>' +
        '<div class="asset-row"><span>Suporte ' + (a.supports[0] ? money(a.supports[0]) : '--') + '</span><span>Resist. ' + (a.resistances[0] ? money(a.resistances[0]) : '--') + '</span></div>';
      grid.appendChild(card);
    });
  }
  function scoreClass(bias) { return bias === 'Comprador' ? 'bull' : bias === 'Vendedor' ? 'bear' : 'neutral'; }
  function sparkline(candles) {
    var rows = candles.slice(-18);
    var highs = rows.map(function (x) { return x.high; }); var lows = rows.map(function (x) { return x.low; });
    var max = Math.max.apply(null, highs), min = Math.min.apply(null, lows), range = max - min || 1;
    var bars = rows.map(function (bar) { var h = 18 + ((bar.close - min) / range) * 16; return '<span class="' + (bar.close >= bar.open ? 'upbar' : 'downbar') + '" style="height:' + h.toFixed(0) + 'px"></span>'; }).join('');
    return '<div class="asset-mini">' + bars + '</div>';
  }
  function render(ticker, premium, oi, chain, depth) {
    var a = state.analysis;
    var change = ticker ? +ticker.priceChangePercent : NaN;
    text('chartTitle', 'Price Action ' + state.symbol);
    text('lastPrice', money(a.close));
    text('priceChange', percent(change) + ' 24h');
    $('priceChange').className = change >= 0 ? 'up' : 'down';
    text('dayRange', ticker ? money(+ticker.lowPrice) + ' / ' + money(+ticker.highPrice) : '--');
    text('weightedAvg', ticker ? 'VWAP 24h ' + money(+ticker.weightedAvgPrice) : '--');
    text('fundingRate', Number.isFinite(a.funding) ? percent(a.funding * 100, 4) : '--');
    text('nextFunding', premium && premium.nextFundingTime ? 'Prox. ' + new Date(+premium.nextFundingTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--');
    text('openInterest', oi && oi.openInterest ? num(+oi.openInterest, 2) : '--');
    text('basisLine', Number.isFinite(a.basis) ? 'Mark-Index ' + money(a.basis) : '--');
    text('mempoolLine', chain && chain.mempool ? fmt0.format(chain.mempool.count || 0) + ' tx' : '--');
    text('feeLine', chain && chain.fees ? 'fee ' + chain.fees.fastestFee + '/' + chain.fees.hourFee + ' sat/vB' : '--');
    text('supportLevels', a.supports.length ? a.supports.map(money).join('  ') : '--');
    text('resistanceLevels', a.resistances.length ? a.resistances.map(money).join('  ') : '--');
    var upTrigger = a.resistances[0], downTrigger = a.supports[0];
    text('triggerLine', (upTrigger ? 'Alta > ' + money(upTrigger) : '') + (downTrigger ? ' | Baixa < ' + money(downTrigger) : ''));
    var sweep = a.sweepDown ? 'Sweep de baixa absorvido' : a.sweepUp ? 'Sweep de topo rejeitado' : 'Sem sweep relevante';
    text('structureLine', a.structure + ' | ' + sweep + ' | preco ' + (a.close > a.vwap ? 'acima' : 'abaixo') + ' do VWAP');
    text('ema9', money(a.ema9));
    text('ema21', money(a.ema21));
    text('ema50', money(a.ema50));
    text('ema200', money(a.ema200));
    text('rsi14', num(a.rsi14, 1));
    text('stochRsi', num(a.stochRsi14, 1));
    text('macdLine', num(a.macd.hist, 2));
    text('mfi14', num(a.mfi14, 1));
    text('atr14', money(a.atr14));
    text('bbLine', money(a.bb.latestLower) + ' / ' + money(a.bb.latestUpper));
    text('vwapLine', money(a.vwap));
    text('volumeRatio', Number.isFinite(a.avgVol) && a.avgVol ? num(a.lastVol / a.avgVol, 2) + 'x' : '--');
    text('rsiState', a.rsi14 >= 70 ? 'Sobrecompra' : a.rsi14 <= 30 ? 'Sobrevenda' : 'Neutro');
    text('macdState', a.macd.hist > 0 ? 'Acima do sinal' : 'Abaixo do sinal');
    text('volumeState', Number.isFinite(a.avgVol) && a.lastVol > a.avgVol * 1.35 ? 'Volume alto' : 'Normal');
    updateScore(a); updateBook(a); updateChain(chain); renderConfluence(a); drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); renderBoard();
    text('updatedAt', new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    document.title = state.symbol + ' ' + money(a.close);
  }
  function updateScore(a) {
    var c = buildConfluence(a);
    text('scoreValue', String(c.total)); text('scoreBias', c.decision);
    var gauge = $('scoreGauge'); gauge.className = 'score-gauge ' + (c.tone === 'long' ? 'bull' : c.tone === 'avoid' ? 'bear' : 'neutral');
    text('trendSignal', a.trendScore > 10 ? 'Alta' : a.trendScore < -10 ? 'Baixa' : 'Misto');
    text('momentumSignal', a.momScore > 8 ? 'Forte' : a.momScore < -8 ? 'Fraco' : 'Neutro');
    text('volumeSignal', a.flowScore > 8 ? 'Compra' : a.flowScore < -8 ? 'Venda' : 'Equilibrio');
    text('bookSignal', a.bookScore > 0 ? 'Bid domina' : a.bookScore < 0 ? 'Ask domina' : 'Balanceado');
    text('derivativesSignal', a.derivScore > 0 ? 'Leve apoio' : 'Cautela');
    text('chainSignal', a.chainScore > 0 ? 'Limpo' : a.chainScore < 0 ? 'Congestionado' : 'Neutro');
    var top = a.resistances[0], base = a.supports[0];
    var plan = a.bias === 'Comprador' ? 'Favorece continuacao se aceitar acima de ' + money(top) + '. Evitar chase se RSI esticar sem volume.' : a.bias === 'Vendedor' ? 'Favorece correcao se perder ' + money(base) + '. Reentrada compradora so com recuperacao rapida da zona.' : 'Faixa de decisao entre ' + money(base) + ' e ' + money(top) + '. Melhor sinal vem de rompimento com reteste.';
    text('playbookText', plan);
  }
  function updateBook(a) {
    var total = (a.bidQty || 0) + (a.askQty || 0);
    var bidPct = total ? clamp((a.bidQty / total) * 100, 5, 95) : 50;
    $('bidBar').style.width = bidPct + '%'; $('askBar').style.width = (100 - bidPct) + '%';
    text('bidDepth', 'Bid ' + num(a.bidQty, 3) + ' ' + baseAsset(state.symbol)); text('askDepth', 'Ask ' + num(a.askQty, 3) + ' ' + baseAsset(state.symbol));
    text('spreadLine', 'Spread ' + money(a.spread) + ' | Imbalance ' + percent((a.bookImb || 0) * 100, 1));
  }
  function updateChain(chain) {
    text('blockHeight', chain && chain.height ? fmt0.format(chain.height) : '--');
    text('mempoolTx', chain && chain.mempool ? fmt0.format(chain.mempool.count || 0) : '--');
    text('fastFee', chain && chain.fees ? chain.fees.fastestFee + ' sat/vB' : '--');
    text('lowFee', chain && chain.fees ? chain.fees.minimumFee + ' sat/vB' : '--');
  }
  function setupCanvas(canvas) {
    var box = canvas.getBoundingClientRect(); var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(320, Math.floor(box.width * dpr)); canvas.height = Math.max(220, Math.floor(box.height * dpr));
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx: ctx, w: box.width, h: box.height };
  }
  function drawPriceChart() {
    var canvas = $('priceCanvas'); if (!canvas || !state.klines.length) return;
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, w, h);
    var candles = state.klines.slice(-120), pad = { l: 52, r: 70, t: 22, b: 88 }, ch = h - pad.t - pad.b;
    var highs = candles.map(function (x) { return x.high; }), lows = candles.map(function (x) { return x.low; });
    var max = Math.max.apply(null, highs), min = Math.min.apply(null, lows), range = max - min || 1; max += range * 0.08; min -= range * 0.08;
    function y(p) { return pad.t + (max - p) / (max - min) * ch; }
    function x(i) { return pad.l + i * ((w - pad.l - pad.r) / Math.max(1, candles.length - 1)); }
    ctx.strokeStyle = '#232a33'; ctx.lineWidth = 1; ctx.font = '12px Inter, sans-serif'; ctx.fillStyle = '#9da7b3';
    for (var g = 0; g <= 5; g++) { var yy = pad.t + ch * g / 5; ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r + 18, yy); ctx.stroke(); var price = max - (max - min) * g / 5; ctx.fillText(money(price), w - pad.r + 24, yy + 4); }
    var bw = Math.max(3, ((w - pad.l - pad.r) / candles.length) * 0.58);
    candles.forEach(function (bar, i) { var xx = x(i); var up = bar.close >= bar.open; ctx.strokeStyle = up ? '#22c783' : '#ff5c70'; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(xx, y(bar.high)); ctx.lineTo(xx, y(bar.low)); ctx.stroke(); var top = y(Math.max(bar.open, bar.close)); var bot = y(Math.min(bar.open, bar.close)); ctx.fillRect(xx - bw / 2, top, bw, Math.max(2, bot - top)); });
    var closeSeries = candles.map(function (q) { return q.close; });
    drawLine(ctx, candles, emaSeries(closeSeries, 9), x, y, '#4fd3c4');
    drawLine(ctx, candles, emaSeries(closeSeries, 21), x, y, '#55a7ff');
    drawLine(ctx, candles, emaSeries(closeSeries, 50), x, y, '#f5b84b');
    var bb = bollinger(closeSeries, 20, 2);
    drawLine(ctx, candles, bb.upper, x, y, 'rgba(169,139,255,.72)');
    drawLine(ctx, candles, bb.lower, x, y, 'rgba(169,139,255,.72)');
    var a = state.analysis;
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#f4f0e8'; ctx.beginPath(); ctx.moveTo(pad.l, y(a.close)); ctx.lineTo(w - pad.r + 18, y(a.close)); ctx.stroke(); ctx.setLineDash([]);
    a.supports.concat(a.resistances).forEach(function (level) { ctx.strokeStyle = level < a.close ? 'rgba(34,199,131,.55)' : 'rgba(255,92,112,.55)'; ctx.beginPath(); ctx.moveTo(pad.l, y(level)); ctx.lineTo(w - pad.r + 18, y(level)); ctx.stroke(); });
    var maxVol = Math.max.apply(null, candles.map(function (q) { return q.volume; })) || 1, vh = 56, vy = h - 66;
    candles.forEach(function (bar, i) { var height = (bar.volume / maxVol) * vh; ctx.fillStyle = bar.close >= bar.open ? 'rgba(34,199,131,.28)' : 'rgba(255,92,112,.28)'; ctx.fillRect(x(i) - bw / 2, vy + vh - height, bw, height); });
    ctx.fillStyle = '#9da7b3'; ctx.fillText('EMA9', pad.l, 18); ctx.fillStyle = '#4fd3c4'; ctx.fillRect(pad.l + 42, 10, 16, 3);
    ctx.fillStyle = '#9da7b3'; ctx.fillText('EMA21', pad.l + 70, 18); ctx.fillStyle = '#55a7ff'; ctx.fillRect(pad.l + 118, 10, 16, 3);
    ctx.fillStyle = '#9da7b3'; ctx.fillText('EMA50', pad.l + 146, 18); ctx.fillStyle = '#f5b84b'; ctx.fillRect(pad.l + 194, 10, 16, 3);
  }
  function drawLine(ctx, candles, series, x, y, color) { ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); var started = false; series.slice(-candles.length).forEach(function (v, i) { if (v == null) return; if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v)); }); ctx.stroke(); }
  function drawFlowChart() {
    var canvas = $('flowCanvas'); if (!canvas || !state.klines.length) return;
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, w, h);
    var rows = state.klines.slice(-48).map(function (bar) { return bar.takerBuy - Math.max(0, bar.volume - bar.takerBuy); });
    var max = Math.max.apply(null, rows.map(Math.abs)) || 1, mid = h / 2, bw = Math.max(3, w / rows.length * .62);
    ctx.strokeStyle = '#303741'; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
    rows.forEach(function (v, i) { var x = i * (w / rows.length) + 3; var height = Math.abs(v) / max * (h * .42); ctx.fillStyle = v >= 0 ? '#22c783' : '#ff5c70'; ctx.fillRect(x, v >= 0 ? mid - height : mid, bw, height); });
    var sum = rows.reduce(function (a, b) { return a + b; }, 0); text('flowCaption', 'Delta taker aprox. ' + num(sum, 3) + ' ' + baseAsset(state.symbol) + ' nos ultimos candles');
  }
  function drawRsiChart() {
    var canvas = $('rsiCanvas'); if (!canvas || !state.analysis) return;
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#11161d'; ctx.fillRect(0, 0, w, h);
    var values = state.analysis.rsiValues.slice(-120);
    var pad = { l: 28, r: 18, t: 10, b: 20 };
    function y(v) { return pad.t + (100 - v) / 100 * (h - pad.t - pad.b); }
    function x(i) { return pad.l + i * ((w - pad.l - pad.r) / Math.max(1, values.length - 1)); }
    [70, 50, 30].forEach(function (level) {
      ctx.strokeStyle = level === 50 ? '#303741' : 'rgba(245,184,75,.35)';
      ctx.beginPath(); ctx.moveTo(pad.l, y(level)); ctx.lineTo(w - pad.r, y(level)); ctx.stroke();
      ctx.fillStyle = '#9da7b3'; ctx.font = '11px Inter, sans-serif'; ctx.fillText(String(level), 4, y(level) + 4);
    });
    ctx.strokeStyle = '#55a7ff'; ctx.lineWidth = 1.8; ctx.beginPath();
    var started = false;
    values.forEach(function (v, i) {
      if (v == null) return;
      if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();
  }
  function drawMacdChart() {
    var canvas = $('macdCanvas'); if (!canvas || !state.analysis) return;
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#11161d'; ctx.fillRect(0, 0, w, h);
    var data = state.analysis.macdData;
    var line = data.line.slice(-120), signal = data.signal.slice(-120), hist = data.hist.slice(-120);
    var values = line.concat(signal).concat(hist).filter(function (v) { return Number.isFinite(v); });
    var maxAbs = Math.max.apply(null, values.map(Math.abs).concat([1]));
    var pad = { l: 24, r: 14, t: 12, b: 20 };
    var mid = pad.t + (h - pad.t - pad.b) / 2;
    function y(v) { return mid - (v / maxAbs) * ((h - pad.t - pad.b) / 2); }
    function x(i) { return pad.l + i * ((w - pad.l - pad.r) / Math.max(1, hist.length - 1)); }
    ctx.strokeStyle = '#303741'; ctx.beginPath(); ctx.moveTo(pad.l, mid); ctx.lineTo(w - pad.r, mid); ctx.stroke();
    var bw = Math.max(2, ((w - pad.l - pad.r) / hist.length) * .62);
    hist.forEach(function (v, i) {
      if (v == null) return;
      ctx.fillStyle = v >= 0 ? 'rgba(34,199,131,.76)' : 'rgba(255,92,112,.76)';
      var yy = y(v);
      ctx.fillRect(x(i) - bw / 2, Math.min(mid, yy), bw, Math.max(1, Math.abs(yy - mid)));
    });
    drawMiniLine(ctx, line, x, y, '#55a7ff');
    drawMiniLine(ctx, signal, x, y, '#f5b84b');
  }
  function drawVolumeChart() {
    var canvas = $('volumeCanvas'); if (!canvas || !state.klines.length) return;
    var c = setupCanvas(canvas), ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#11161d'; ctx.fillRect(0, 0, w, h);
    var rows = state.klines.slice(-96);
    var maxVol = Math.max.apply(null, rows.map(function (bar) { return bar.volume; }).concat([1]));
    var pad = { l: 22, r: 14, t: 12, b: 22 };
    var bw = Math.max(2, ((w - pad.l - pad.r) / rows.length) * .7);
    rows.forEach(function (bar, i) {
      var x = pad.l + i * ((w - pad.l - pad.r) / Math.max(1, rows.length - 1));
      var height = (bar.volume / maxVol) * (h - pad.t - pad.b);
      var delta = bar.takerBuy - Math.max(0, bar.volume - bar.takerBuy);
      ctx.fillStyle = delta >= 0 ? 'rgba(34,199,131,.72)' : 'rgba(255,92,112,.72)';
      ctx.fillRect(x - bw / 2, h - pad.b - height, bw, height);
    });
    var mean = avg(rows.map(function (bar) { return bar.volume; }));
    var meanY = h - pad.b - (mean / maxVol) * (h - pad.t - pad.b);
    ctx.strokeStyle = 'rgba(245,184,75,.72)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(pad.l, meanY); ctx.lineTo(w - pad.r, meanY); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawMiniLine(ctx, values, x, y, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath();
    var started = false;
    values.forEach(function (v, i) {
      if (v == null) return;
      if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();
  }
  function setIntervalChoice(interval) {
    state.interval = interval; $('intervalSelect').value = interval;
    Array.from($('timeTabs').querySelectorAll('button')).forEach(function (btn) { btn.classList.toggle('active', btn.dataset.interval === interval); });
    refresh();
  }
  function setSort(sort) {
    state.sort = sort;
    $('sortScoreButton').classList.toggle('active', sort === 'score');
    $('sortChangeButton').classList.toggle('active', sort === 'change');
    $('sortVolumeButton').classList.toggle('active', sort === 'volume');
    renderBoard();
  }
  function selectSymbol(symbol) {
    state.symbol = normalizeSymbol(symbol);
    $('symbolSelect').value = state.symbol;
    refresh();
  }
  function populateAssetSelect() {
    var select = $('symbolSelect');
    if (!select) return;
    select.innerHTML = ASSETS.map(function (symbol) {
      return '<option value="' + symbol + '">' + baseAsset(symbol) + ' - ' + (ASSET_NAMES[symbol] || symbol) + '</option>';
    }).join('');
    select.value = state.symbol;
  }
  function bind() {
    populateAssetSelect();
    $('refreshButton').addEventListener('click', refresh);
    $('intervalSelect').addEventListener('change', function (e) { setIntervalChoice(e.target.value); });
    $('symbolSelect').addEventListener('change', function (e) { selectSymbol(e.target.value); });
    $('liveButton').addEventListener('click', function () { state.live = !state.live; $('liveButton').classList.toggle('is-on', state.live); $('liveButton').setAttribute('aria-pressed', String(state.live)); });
    $('timeTabs').addEventListener('click', function (e) { if (e.target.dataset.interval) setIntervalChoice(e.target.dataset.interval); });
    $('assetGrid').addEventListener('click', function (e) { var card = e.target.closest('.asset-card'); if (card) selectSymbol(card.dataset.symbol); });
    $('sortScoreButton').addEventListener('click', function () { setSort('score'); });
    $('sortChangeButton').addEventListener('click', function () { setSort('change'); });
    $('sortVolumeButton').addEventListener('click', function () { setSort('volume'); });
    $('newsModeSelect').addEventListener('change', function (e) {
      state.newsMode = e.target.value;
      if (state.analysis) renderConfluence(state.analysis);
    });
    $('newsRefreshButton').addEventListener('click', async function () {
      text('newsStatus', 'Atualizando noticias e macro...');
      await loadNewsIfNeeded(true);
      if (state.analysis) renderConfluence(state.analysis);
    });
    window.addEventListener('resize', function () { drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); });
    state.timer = setInterval(function () { if (state.live) refresh(); }, REFRESH_MS);
  }
  bind(); refresh();
})();
