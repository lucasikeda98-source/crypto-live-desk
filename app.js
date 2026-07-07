(function () {
  var REFRESH_MS = 3000;
  var BOARD_REFRESH_MS = 15000;
  var DERIVATIVES_REFRESH_MS = 15000;
  var CHAIN_REFRESH_MS = 30000;
  var NEWS_REFRESH_MS = 300000;
  var EXTERNAL_REFRESH_MS = 120000;
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
  var ASSET_CONTEXT = {
    BTCUSDT: { gecko: 'bitcoin', paprika: 'btc-bitcoin', chain: 'Bitcoin', kind: 'Reserva / macro beta', narrative: 'Bitcoin guia liquidez, dominancia e apetite de risco. Para BTC, peso maior em macro, funding, OI e sentimento global.' },
    ETHUSDT: { gecko: 'ethereum', paprika: 'eth-ethereum', chain: 'Ethereum', kind: 'L1 + DeFi', narrative: 'Ethereum responde a TVL, fees, stablecoins, atividade DeFi e beta de mercado. Chain TVL ajuda a medir demanda estrutural.' },
    BNBUSDT: { gecko: 'binancecoin', paprika: 'bnb-binance-coin', chain: 'BSC', kind: 'Exchange/L1', narrative: 'BNB combina beta cripto, atividade da BSC e risco ligado ao ecossistema Binance.' },
    SOLUSDT: { gecko: 'solana', paprika: 'sol-solana', chain: 'Solana', kind: 'L1 alto beta', narrative: 'Solana tende a reagir forte a fluxo de risco, TVL, DEX volume e narrativas de rede.' },
    XRPUSDT: { gecko: 'ripple', paprika: 'xrp-xrp', chain: 'XRP', kind: 'Pagamentos', narrative: 'XRP costuma ser sensivel a noticias regulatórias, fluxo especulativo e liquidez do mercado amplo.' },
    DOGEUSDT: { gecko: 'dogecoin', paprika: 'doge-dogecoin', kind: 'Meme beta', narrative: 'DOGE e fortemente guiado por sentimento, momentum, volume e apetite por risco em alts.' },
    ADAUSDT: { gecko: 'cardano', paprika: 'ada-cardano', chain: 'Cardano', kind: 'L1', narrative: 'Cardano combina beta de L1, atividade de rede e ciclos de narrativas de desenvolvimento.' },
    AVAXUSDT: { gecko: 'avalanche-2', paprika: 'avax-avalanche', chain: 'Avalanche', kind: 'L1 + DeFi', narrative: 'Avalanche reage a TVL, subnets/ecossistema DeFi, fluxo de alts e liquidez global.' },
    LINKUSDT: { gecko: 'chainlink', paprika: 'link-chainlink', protocol: 'Chainlink', kind: 'Infra oracle', narrative: 'LINK responde a adoção de oraculos, receitas/protocolo e rotacao para infraestrutura cripto.' },
    TRXUSDT: { gecko: 'tron', paprika: 'trx-tron', chain: 'Tron', kind: 'L1/stablecoins', narrative: 'TRON tem leitura forte em stablecoins, atividade de rede e fluxo defensivo dentro de cripto.' },
    DOTUSDT: { gecko: 'polkadot', paprika: 'dot-polkadot', chain: 'Polkadot', kind: 'L1 interoperabilidade', narrative: 'DOT depende de ciclo de alts, atividade do ecossistema e retomada de apetite por L1s.' },
    LTCUSDT: { gecko: 'litecoin', paprika: 'ltc-litecoin', kind: 'Moeda legado', narrative: 'Litecoin costuma seguir liquidez ampla, momentum tecnico e rotacao para moedas de maior historico.' },
    BCHUSDT: { gecko: 'bitcoin-cash', paprika: 'bch-bitcoin-cash', kind: 'Moeda legado', narrative: 'BCH tende a se mover com beta de Bitcoin, fluxo especulativo e narrativas de pagamentos.' },
    UNIUSDT: { gecko: 'uniswap', paprika: 'uni-uniswap', protocol: 'Uniswap', chain: 'Ethereum', kind: 'DEX / DeFi', narrative: 'UNI ganha contexto com volumes DEX, receitas de protocolo e rotacao para tokens DeFi.' },
    NEARUSDT: { gecko: 'near', paprika: 'near-near-protocol', chain: 'Near', kind: 'L1 alto beta', narrative: 'NEAR costuma amplificar apetite por risco em L1s, IA/narrativas e atividade do ecossistema.' },
    ATOMUSDT: { gecko: 'cosmos', paprika: 'atom-cosmos', chain: 'CosmosHub', kind: 'Interoperabilidade', narrative: 'ATOM depende de fluxo para ecossistemas modulares, staking e rotacao para infraestrutura.' },
    FILUSDT: { gecko: 'filecoin', paprika: 'fil-filecoin', chain: 'Filecoin', kind: 'Storage/infra', narrative: 'FIL reage a narrativas de storage, infraestrutura descentralizada e beta de alts.' },
    AAVEUSDT: { gecko: 'aave', paprika: 'aave-new', protocol: 'AAVE', chain: 'Ethereum', kind: 'Lending / DeFi', narrative: 'AAVE tem leitura forte em TVL, receitas, demanda por lending e retomada de DeFi.' }
  };
  var state = { symbol: 'BTCUSDT', interval: '5m', view: 'dashboard', live: true, refreshing: false, pendingRefresh: false, boardRefreshing: false, contextRefreshing: false, chainRefreshing: false, timer: null, klines: [], analysis: null, board: [], boardFetchedAt: 0, boardInterval: '', sort: 'score', chain: null, chainFetchedAt: 0, news: [], newsFetchedAt: 0, newsMode: 'auto', external: {}, externalFetchedAt: 0, derivativeCache: {}, chart: { ema9: true, ema21: true, ema50: true, bb: false, levels: true } };
  var $ = function (id) { return document.getElementById(id); };
  var fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  var fmt0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function cleanZero(n) { return Number.isFinite(n) && Math.abs(n) < 1e-9 ? 0 : n; }
  function money(n) { n = cleanZero(n); return Number.isFinite(n) ? '$' + fmt.format(n) : '--'; }
  function compactMoney(n) { return Number.isFinite(n) ? '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : '--'; }
  function num(n, d) { n = cleanZero(n); return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: d == null ? 2 : d }).format(n) : '--'; }
  function percent(n, d) { n = cleanZero(n); return Number.isFinite(n) ? (n >= 0 ? '+' : '') + n.toFixed(d == null ? 2 : d) + '%' : '--'; }
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
  function contextFor(symbol) {
    return ASSET_CONTEXT[symbol] || { gecko: baseAsset(symbol).toLowerCase(), paprika: '', kind: 'Criptoativo', narrative: 'Ativo acompanhado por mercado Binance, momentum, fluxo, noticias e contexto global.' };
  }
  function biasFromScore(score) { return score >= 35 ? 'Comprador' : score <= -35 ? 'Vendedor' : 'Neutro'; }
  function compactNumber(n) { return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : '--'; }
  function compactUsd(n) { return Number.isFinite(n) ? '$' + compactNumber(n) : '--'; }
  function normKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function sourceRow(name, ok, detail) { return { name: name, ok: !!ok, detail: detail || (ok ? 'online' : 'sem leitura') }; }
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
  function rsiSeries(values, period) {
    var out = values.map(function () { return null; });
    if (values.length <= period) return out;
    var avgGain = 0, avgLoss = 0;
    for (var i = 1; i <= period; i++) {
      var diff = values[i] - values[i - 1];
      if (diff > 0) avgGain += diff; else avgLoss -= diff;
    }
    avgGain /= period; avgLoss /= period;
    out[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    for (var j = period + 1; j < values.length; j++) {
      var change = values[j] - values[j - 1];
      var gain = change > 0 ? change : 0;
      var loss = change < 0 ? -change : 0;
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      out[j] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));
    }
    return out;
  }
  function rsi(values, period) { return lastFinite(rsiSeries(values, period)); }
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
      if (typical > prevTypical) positive += flow;
      else if (typical < prevTypical) negative += flow;
    }
    if (positive === 0 && negative === 0) return 50;
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
    return lastFinite(atrSeries(candles, period));
  }
  function trueRangeSeries(candles) {
    var out = candles.map(function () { return null; });
    for (var i = 1; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1];
      out[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    }
    return out;
  }
  function atrSeries(candles, period) {
    var out = candles.map(function () { return null; });
    if (candles.length <= period) return out;
    var trs = trueRangeSeries(candles).slice(1);
    var value = avg(trs.slice(0, period));
    out[period] = value;
    for (var j = period + 1; j < candles.length; j++) {
      value = ((value * (period - 1)) + trs[j - 1]) / period;
      out[j] = value;
    }
    return out;
  }
  function adx(candles, period) {
    var out = { adx: NaN, plus: NaN, minus: NaN };
    if (candles.length <= period * 2) return out;
    var trs = [], plusDm = [], minusDm = [];
    for (var i = 1; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1];
      var upMove = c.high - p.high;
      var downMove = p.low - c.low;
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
      plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    var trSmooth = avg(trs.slice(0, period)) * period;
    var plusSmooth = avg(plusDm.slice(0, period)) * period;
    var minusSmooth = avg(minusDm.slice(0, period)) * period;
    var dx = [];
    for (var j = period; j < trs.length; j++) {
      if (j > period) {
        trSmooth = trSmooth - (trSmooth / period) + trs[j];
        plusSmooth = plusSmooth - (plusSmooth / period) + plusDm[j];
        minusSmooth = minusSmooth - (minusSmooth / period) + minusDm[j];
      }
      var plusDi = trSmooth ? (plusSmooth / trSmooth) * 100 : 0;
      var minusDi = trSmooth ? (minusSmooth / trSmooth) * 100 : 0;
      var denom = plusDi + minusDi;
      dx.push(denom ? (Math.abs(plusDi - minusDi) / denom) * 100 : 0);
      out.plus = plusDi; out.minus = minusDi;
    }
    if (dx.length < period) return out;
    var adxValue = avg(dx.slice(0, period));
    for (var k = period; k < dx.length; k++) adxValue = ((adxValue * (period - 1)) + dx[k]) / period;
    out.adx = adxValue;
    return out;
  }
  function supertrend(candles, period, mult) {
    var atrs = atrSeries(candles, period);
    var finalUpper = null, finalLower = null, trend = 'Neutro', value = NaN;
    for (var i = period; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1] || c;
      var hl2 = (c.high + c.low) / 2;
      var basicUpper = hl2 + (atrs[i] || 0) * mult;
      var basicLower = hl2 - (atrs[i] || 0) * mult;
      finalUpper = finalUpper == null || basicUpper < finalUpper || p.close > finalUpper ? basicUpper : finalUpper;
      finalLower = finalLower == null || basicLower > finalLower || p.close < finalLower ? basicLower : finalLower;
      if (trend === 'Baixa' && c.close > finalUpper) trend = 'Alta';
      else if (trend === 'Alta' && c.close < finalLower) trend = 'Baixa';
      else if (trend === 'Neutro') trend = c.close >= hl2 ? 'Alta' : 'Baixa';
      value = trend === 'Alta' ? finalLower : finalUpper;
    }
    return { trend: trend, value: value };
  }
  function keltner(candles, period, mult) {
    var closes = candles.map(function (c) { return c.close; });
    var mid = last(emaSeries(closes, period));
    var range = atr(candles, period);
    return { mid: mid, upper: mid + range * mult, lower: mid - range * mult };
  }
  function donchian(candles, period) {
    var rows = candles.slice(-period);
    return {
      upper: Math.max.apply(null, rows.map(function (c) { return c.high; })),
      lower: Math.min.apply(null, rows.map(function (c) { return c.low; }))
    };
  }
  function roc(values, period) {
    if (values.length <= period) return NaN;
    var now = last(values), prev = values[values.length - 1 - period];
    return prev ? ((now - prev) / prev) * 100 : NaN;
  }
  function obv(candles) {
    var total = 0;
    for (var i = 1; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) total += candles[i].volume;
      else if (candles[i].close < candles[i - 1].close) total -= candles[i].volume;
    }
    return total;
  }
  function cmf(candles, period) {
    var rows = candles.slice(-period), mfv = 0, vol = 0;
    rows.forEach(function (c) {
      var range = c.high - c.low;
      var multiplier = range ? (((c.close - c.low) - (c.high - c.close)) / range) : 0;
      mfv += multiplier * c.volume;
      vol += c.volume;
    });
    return vol ? mfv / vol : NaN;
  }
  function volumeProfile(candles, bins) {
    var rows = candles.slice(-120);
    var highs = rows.map(function (c) { return c.high; }), lows = rows.map(function (c) { return c.low; });
    var max = Math.max.apply(null, highs), min = Math.min.apply(null, lows), step = (max - min) / bins || 1;
    var buckets = Array.from({ length: bins }, function (_, i) { return { price: min + step * (i + 0.5), volume: 0 }; });
    rows.forEach(function (c) {
      var idx = clamp(Math.floor(((c.high + c.low + c.close) / 3 - min) / step), 0, bins - 1);
      buckets[idx].volume += c.volume;
    });
    buckets.sort(function (a, b) { return b.volume - a.volume; });
    return buckets[0] || { price: NaN, volume: NaN };
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
    var bbPctB = Number.isFinite(bb.latestUpper) && bb.latestUpper !== bb.latestLower ? ((close - bb.latestLower) / (bb.latestUpper - bb.latestLower)) * 100 : NaN;
    var bbWidth = Number.isFinite(bb.latestMid) && bb.latestMid ? ((bb.latestUpper - bb.latestLower) / bb.latestMid) * 100 : NaN;
    var vwapNow = vwap(candles, 48);
    var adxNow = adx(candles, 14);
    var supertrendNow = supertrend(candles, 10, 3);
    var keltnerNow = keltner(candles, 20, 2);
    var donchianNow = donchian(candles, 20);
    var roc12 = roc(closes, 12);
    var obvNow = obv(candles);
    var cmf20 = cmf(candles, 20);
    var poc = volumeProfile(candles, 24);
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
    var trendScore = (close > ema9 ? 6 : -6) + (close > ema21 ? 8 : -8) + (close > ema50 ? 10 : -10) + (ema21 > ema50 ? 8 : -8) + (adxNow.adx > 25 && adxNow.plus > adxNow.minus ? 4 : adxNow.adx > 25 && adxNow.minus > adxNow.plus ? -4 : 0);
    var momScore = (rsi14 > 52 && rsi14 < 70 ? 12 : rsi14 >= 78 ? -8 : rsi14 >= 70 ? 3 : rsi14 < 35 ? -10 : 0) + (macdNow.hist > 0 ? 8 : -8) + (stochRsi14 > 80 ? -3 : stochRsi14 < 20 ? 3 : 0);
    var flowScore = (deltaSum > 0 ? 9 : -9) + (lastVol > avgVol * 1.35 ? 5 : 0) + (cmf20 > 0.08 ? 4 : cmf20 < -0.08 ? -4 : 0);
    var derivScore = (Number.isFinite(funding) && funding > 0.0003 ? -6 : Number.isFinite(funding) && funding > 0 ? 3 : -3) + (basis > 0 ? 3 : -3);
    var chainScore = options.chainScore || 0;
    var bookScore = options.bookScore || 0;
    var score = clamp(Math.round(trendScore + momScore + flowScore + derivScore + chainScore + bookScore), -100, 100);
    var bias = biasFromScore(score);
    return { close: close, ema9: ema9, ema21: ema21, ema20: ema20, ema50: ema50, ema200: ema200, rsi14: rsi14, rsiValues: rsiValues, stochRsi14: stochRsi14, mfi14: mfi14, atr14: atr14, macd: macdNow, macdData: macdData, bb: bb, bbPctB: bbPctB, bbWidth: bbWidth, vwap: vwapNow, adx: adxNow, supertrend: supertrendNow, keltner: keltnerNow, donchian: donchianNow, roc12: roc12, obv: obvNow, cmf20: cmf20, poc: poc, supports: supports, resistances: resistances, structure: structure, sweepDown: sweepDown, sweepUp: sweepUp, priorLow: priorLow, priorHigh: priorHigh, deltaSum: deltaSum, avgVol: avgVol, lastVol: lastVol, funding: funding, basis: basis, score: score, bias: bias, trendScore: trendScore, momScore: momScore, flowScore: flowScore, derivScore: derivScore, chainScore: chainScore, bookScore: bookScore, ticker: ticker };
  }
  function depthWindow(depth, mid, pct) {
    var bidQty = 0, askQty = 0, bidNotional = 0, askNotional = 0;
    if (!depth || !depth.bids || !depth.asks) return { bidQty: 0, askQty: 0, bidNotional: 0, askNotional: 0, imbalance: 0 };
    depth.bids.forEach(function (b) { var p = +b[0], q = +b[1]; if (p >= mid * (1 - pct)) { bidQty += q; bidNotional += p * q; } });
    depth.asks.forEach(function (a) { var p = +a[0], q = +a[1]; if (p <= mid * (1 + pct)) { askQty += q; askNotional += p * q; } });
    return { bidQty: bidQty, askQty: askQty, bidNotional: bidNotional, askNotional: askNotional, imbalance: (bidQty + askQty) ? (bidQty - askQty) / (bidQty + askQty) : 0 };
  }
  function estimateSlippage(levels, notional, side) {
    var remaining = notional, qty = 0, spent = 0, first = levels && levels.length ? +levels[0][0] : NaN;
    if (!levels || !levels.length || !Number.isFinite(first)) return NaN;
    for (var i = 0; i < levels.length && remaining > 0; i++) {
      var price = +levels[i][0], size = +levels[i][1], levelNotional = price * size;
      var take = Math.min(remaining, levelNotional);
      spent += take;
      qty += take / price;
      remaining -= take;
    }
    if (remaining > 0 || !qty) return NaN;
    var avgPrice = spent / qty;
    return side === 'buy' ? ((avgPrice - first) / first) * 10000 : ((first - avgPrice) / first) * 10000;
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
    var w01 = depthWindow(depth, mid, 0.001);
    var w05 = depthWindow(depth, mid, 0.005);
    var notional = Math.max(1000, Math.min(50000, a.close * 0.75));
    a.bidQty = bidQty; a.askQty = askQty; a.bidNotional = bidNotional; a.askNotional = askNotional; a.spread = spread; a.spreadBps = mid ? (spread / mid) * 10000 : NaN; a.microprice = depth && depth.bids && depth.asks && (bidQty + askQty) ? ((+depth.asks[0][0] * bidQty) + (+depth.bids[0][0] * askQty)) / (bidQty + askQty) : NaN; a.book01 = w01; a.book05 = w05; a.buySlipBps = estimateSlippage(depth && depth.asks, notional, 'buy'); a.sellSlipBps = estimateSlippage(depth && depth.bids, notional, 'sell'); a.slippageNotional = notional; a.bookImb = bookImb; a.oi = oi; a.chain = chain;
    return applyExternalToAnalysis(state.symbol, a);
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
  function geckoIds() {
    var seen = {};
    return ASSETS.map(function (symbol) { return contextFor(symbol).gecko; }).filter(function (id) {
      if (!id || seen[id]) return false;
      seen[id] = true;
      return true;
    }).join(',');
  }
  async function loadExternalContext(force) {
    if (!force && Date.now() - state.externalFetchedAt < EXTERNAL_REFRESH_MS && state.external && state.external.fetchedAt) return state.external;
    var ids = geckoIds();
    var rows = await Promise.allSettled([
      fetchJSON('https://api.alternative.me/fng/?limit=1', 9000),
      fetchJSON('https://api.coingecko.com/api/v3/global', 9000),
      fetchJSON('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(ids) + '&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d', 11000),
      fetchJSON('https://api.coingecko.com/api/v3/search/trending', 9000),
      fetchJSON('https://api.llama.fi/v2/chains', 11000),
      fetchJSON('https://api.llama.fi/protocols', 12000),
      fetchJSON('https://api.llama.fi/stablecoins', 11000),
      fetchJSON('https://api.llama.fi/overview/dexs', 11000),
      fetchJSON('https://api.coinpaprika.com/v1/global', 9000),
      fetchJSON('https://api.llama.fi/overview/fees', 11000),
      fetchJSON('https://api.llama.fi/overview/open-interest', 11000)
    ]);
    var external = normalizeExternal(rows);
    state.external = external;
    state.externalFetchedAt = Date.now();
    return external;
  }
  function normalizeExternal(rows) {
    var external = { fetchedAt: Date.now(), fearGreed: null, global: null, coinMarkets: {}, trending: [], chains: [], protocols: [], stablecoins: null, dex: null, paprikaGlobal: null, fees: null, perpsOi: null, sources: [] };
    var fng = value(rows[0]);
    if (fng && fng.data && fng.data[0]) {
      external.fearGreed = { value: +fng.data[0].value, label: fng.data[0].value_classification || '--', timestamp: +fng.data[0].timestamp * 1000, next: +fng.data[0].time_until_update || NaN };
    }
    var global = value(rows[1]);
    if (global && global.data) external.global = global.data;
    (value(rows[2]) || []).forEach(function (coin) { if (coin && coin.id) external.coinMarkets[coin.id] = coin; });
    var trending = value(rows[3]);
    if (trending && trending.coins) external.trending = trending.coins.map(function (row) { return row.item || row; }).filter(Boolean).slice(0, 8);
    external.chains = Array.isArray(value(rows[4])) ? value(rows[4]) : [];
    external.protocols = Array.isArray(value(rows[5])) ? value(rows[5]) : [];
    external.stablecoins = value(rows[6]);
    external.dex = value(rows[7]);
    external.paprikaGlobal = value(rows[8]);
    external.fees = value(rows[9]);
    external.perpsOi = value(rows[10]);
    external.defiTvl = external.chains.reduce(function (sum, chain) { return sum + (+chain.tvl || 0); }, 0);
    external.stablecoinCap = stablecoinCap(external.stablecoins);
    external.dexVolume = dexVolume(external.dex);
    external.fees24h = overviewTotal(external.fees);
    external.perpsOpenInterest = overviewTotal(external.perpsOi);
    external.sources = [
      sourceRow('Alternative.me', !!external.fearGreed, external.fearGreed ? external.fearGreed.label + ' ' + external.fearGreed.value : 'falhou'),
      sourceRow('CoinGecko', !!(external.global || Object.keys(external.coinMarkets).length), Object.keys(external.coinMarkets).length + ' ativos'),
      sourceRow('DefiLlama', !!(external.chains.length || external.protocols.length), external.chains.length + ' chains'),
      sourceRow('DefiLlama fees/OI', !!(external.fees || external.perpsOi), compactUsd(+external.fees24h) + ' fees'),
      sourceRow('CoinPaprika', !!external.paprikaGlobal, external.paprikaGlobal ? percent(+external.paprikaGlobal.market_cap_change_24h, 2) + ' mcap' : 'falhou')
    ];
    return external;
  }
  function overviewTotal(data) {
    if (!data) return NaN;
    if (Number.isFinite(+data.total24h)) return +data.total24h;
    if (Number.isFinite(+data.totalDataChart24h)) return +data.totalDataChart24h;
    if (Number.isFinite(+data.totalOpenInterest)) return +data.totalOpenInterest;
    if (Number.isFinite(+data.openInterest)) return +data.openInterest;
    var protocols = Array.isArray(data.protocols) ? data.protocols : [];
    return protocols.reduce(function (sum, item) { return sum + (+item.total24h || +item.openInterest || +item.totalOpenInterest || 0); }, 0);
  }
  function stablecoinCap(stablecoins) {
    var assets = stablecoins && stablecoins.peggedAssets ? stablecoins.peggedAssets : [];
    return assets.reduce(function (sum, item) {
      var circulating = item.circulating || {};
      return sum + (+circulating.peggedUSD || +circulating.usd || +item.mcap || 0);
    }, 0);
  }
  function dexVolume(dex) {
    if (!dex) return NaN;
    if (Number.isFinite(+dex.total24h)) return +dex.total24h;
    if (Number.isFinite(+dex.totalDataChart24h)) return +dex.totalDataChart24h;
    var protocols = Array.isArray(dex.protocols) ? dex.protocols : [];
    return protocols.reduce(function (sum, item) { return sum + (+item.total24h || +item.volume24h || 0); }, 0);
  }
  function findChainContext(symbol) {
    var ctx = contextFor(symbol);
    if (!ctx.chain || !state.external || !state.external.chains) return null;
    var key = normKey(ctx.chain);
    return state.external.chains.find(function (chain) {
      return normKey(chain.name) === key || normKey(chain.tokenSymbol) === key || normKey(chain.name).indexOf(key) !== -1;
    }) || null;
  }
  function findProtocolContext(symbol) {
    var ctx = contextFor(symbol);
    if (!state.external || !state.external.protocols) return null;
    var keys = [ctx.protocol, ctx.gecko, baseAsset(symbol), ASSET_NAMES[symbol]].map(normKey).filter(Boolean);
    return state.external.protocols.find(function (protocol) {
      var protocolKeys = [protocol.slug, protocol.name, protocol.symbol, protocol.gecko_id].map(normKey);
      return keys.some(function (key) { return protocolKeys.indexOf(key) !== -1; });
    }) || null;
  }
  function selectedMarket(symbol) {
    var ctx = contextFor(symbol);
    return state.external && state.external.coinMarkets ? state.external.coinMarkets[ctx.gecko] || null : null;
  }
  function scoreExternalContext(symbol) {
    var ext = state.external || {};
    var market = selectedMarket(symbol);
    var chain = findChainContext(symbol);
    var protocol = findProtocolContext(symbol);
    var sentiment = 0, globalScore = 0, asset = 0, defi = 0;
    if (ext.fearGreed && Number.isFinite(ext.fearGreed.value)) {
      var fg = ext.fearGreed.value;
      sentiment = fg >= 80 ? -8 : fg >= 65 ? 4 : fg >= 45 ? 2 : fg >= 25 ? -3 : -6;
    }
    var globalChange = ext.global && Number.isFinite(+ext.global.market_cap_change_percentage_24h_usd) ? +ext.global.market_cap_change_percentage_24h_usd : ext.paprikaGlobal ? +ext.paprikaGlobal.market_cap_change_24h : NaN;
    if (Number.isFinite(globalChange)) globalScore += clamp(Math.round(globalChange * 2.2), -10, 10);
    var btcDom = btcDominanceValue(ext);
    if (Number.isFinite(btcDom)) {
      if (symbol === 'BTCUSDT') globalScore += btcDom >= 54 ? 2 : btcDom <= 45 ? -2 : 0;
      else globalScore += btcDom >= 55 ? -4 : btcDom <= 48 ? 3 : 0;
    }
    if (market) {
      var d24 = +market.price_change_percentage_24h_in_currency || +market.price_change_percentage_24h || 0;
      var d7 = +market.price_change_percentage_7d_in_currency || 0;
      var d30 = +market.price_change_percentage_30d_in_currency || 0;
      asset = clamp(Math.round(d24 * 1.1 + d7 * 0.35 + d30 * 0.1), -12, 12);
      if (+market.market_cap_rank <= 10) asset += 1;
    }
    if (chain) {
      defi += clamp(Math.round((+chain.change_1d || 0) * 1.4 + (+chain.change_7d || 0) * 0.55), -7, 7);
    }
    if (protocol) {
      defi += clamp(Math.round((+protocol.change_1d || 0) * 1.2 + (+protocol.change_7d || 0) * 0.45), -7, 7);
    }
    defi = clamp(defi, -10, 10);
    var total = clamp(sentiment + globalScore + asset + defi, -28, 28);
    return { total: total, sentiment: sentiment, global: globalScore, asset: asset, defi: defi, market: market, chain: chain, protocol: protocol };
  }
  function btcDominanceValue(ext) {
    if (ext && ext.global && ext.global.market_cap_percentage && Number.isFinite(+ext.global.market_cap_percentage.btc)) return +ext.global.market_cap_percentage.btc;
    if (ext && ext.paprikaGlobal && Number.isFinite(+ext.paprikaGlobal.bitcoin_dominance_percentage)) return +ext.paprikaGlobal.bitcoin_dominance_percentage;
    return NaN;
  }
  function applyExternalToAnalysis(symbol, analysis) {
    var externalScore = scoreExternalContext(symbol);
    var baseScore = Number.isFinite(analysis.coreScore) ? analysis.coreScore : analysis.score;
    analysis.external = externalScore;
    analysis.coreScore = baseScore;
    analysis.score = clamp(Math.round(baseScore + externalScore.total), -100, 100);
    analysis.bias = biasFromScore(analysis.score);
    return analysis;
  }
  function setupQuality(a) {
    var volumeRatio = Number.isFinite(a.avgVol) && a.avgVol ? a.lastVol / a.avgVol : NaN;
    var checks = [
      { name: 'Tendencia', score: a.adx.adx > 22 && a.adx.plus > a.adx.minus && a.close > a.ema50 ? 18 : a.adx.adx > 22 && a.adx.minus > a.adx.plus ? -18 : 0, detail: 'ADX ' + num(a.adx.adx, 1) + ' | DI+ ' + num(a.adx.plus, 1) + ' / DI- ' + num(a.adx.minus, 1) },
      { name: 'Momentum', score: a.rsi14 > 52 && a.rsi14 < 70 && a.macd.hist > 0 && a.roc12 > 0 ? 16 : a.rsi14 > 76 || (a.macd.hist < 0 && a.roc12 < 0) ? -14 : 0, detail: 'RSI ' + num(a.rsi14, 1) + ' | ROC ' + percent(a.roc12, 2) },
      { name: 'Fluxo', score: a.deltaSum > 0 && a.cmf20 > 0.05 ? 14 : a.deltaSum < 0 && a.cmf20 < -0.05 ? -14 : 0, detail: 'Delta ' + num(a.deltaSum, 2) + ' | CMF ' + num(a.cmf20, 2) },
      { name: 'Volume', score: Number.isFinite(volumeRatio) && volumeRatio > 1.35 ? 10 : Number.isFinite(volumeRatio) && volumeRatio < 0.55 ? -6 : 0, detail: Number.isFinite(volumeRatio) ? num(volumeRatio, 2) + 'x media' : '--' },
      { name: 'Liquidez', score: Number.isFinite(a.spreadBps) && a.spreadBps < 3 && Number.isFinite(a.buySlipBps) && a.buySlipBps < 8 ? 12 : Number.isFinite(a.spreadBps) && a.spreadBps > 12 ? -10 : 0, detail: 'Spread ' + num(a.spreadBps, 2) + ' bps | slip ' + num(a.buySlipBps, 2) + ' bps' },
      { name: 'Derivativos', score: a.derivativeDetail && Number.isFinite(a.derivativeDetail.takerRatio) && a.derivativeDetail.takerRatio > 1.08 ? 10 : a.derivativeDetail && Number.isFinite(a.derivativeDetail.takerRatio) && a.derivativeDetail.takerRatio < 0.92 ? -10 : 0, detail: a.derivativeDetail ? 'Taker ' + num(a.derivativeDetail.takerRatio, 2) + ' | OI ' + percent(a.derivativeDetail.oiChangePct, 2) : '--' },
      { name: 'Contexto', score: a.external && a.external.total > 6 ? 12 : a.external && a.external.total < -6 ? -12 : 0, detail: a.external ? 'Externo ' + signed(a.external.total) : '--' }
    ];
    var total = clamp(Math.round(checks.reduce(function (sum, item) { return sum + item.score; }, 0)), -100, 100);
    return { total: total, checks: checks };
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
    var external = a.external || scoreExternalContext(state.symbol);
    var technical = clamp(Math.round(a.trendScore * 0.55 + a.momScore * 0.75), -35, 35);
    var flow = clamp(Math.round(a.flowScore + a.bookScore), -25, 25);
    var derivativeDetail = 0;
    var detail = a.derivativeDetail || {};
    if (Number.isFinite(detail.oiChangePct)) derivativeDetail += detail.oiChangePct > 4 && a.close > a.vwap ? 3 : detail.oiChangePct > 4 && a.close < a.vwap ? -3 : detail.oiChangePct < -6 ? -2 : 0;
    if (Number.isFinite(detail.takerRatio)) derivativeDetail += detail.takerRatio > 1.08 ? 3 : detail.takerRatio < 0.92 ? -3 : 0;
    if (Number.isFinite(detail.longShortRatio)) derivativeDetail += detail.longShortRatio > 1.7 ? -3 : detail.longShortRatio < 0.65 ? -2 : 0;
    if (Number.isFinite(detail.fundingAvg)) derivativeDetail += detail.fundingAvg > 0.0003 ? -2 : detail.fundingAvg < -0.0001 ? 1 : 0;
    var derivatives = clamp(Math.round(a.derivScore * 1.7 + derivativeDetail), -18, 18);
    var chain = clamp(Math.round(a.chainScore), -10, 10);
    var macro = clamp(news.score, -22, 22);
    var contextScore = clamp(Math.round(external.total), -28, 28);
    var setup = setupQuality(a);
    var setupScore = clamp(Math.round(setup.total * 0.12), -12, 12);
    var risk = 0;
    var volumeRatio = Number.isFinite(a.avgVol) && a.avgVol ? a.lastVol / a.avgVol : 1;
    if (Number.isFinite(a.bb.latestUpper) && a.close > a.bb.latestUpper && a.rsi14 >= 68) risk -= 8;
    if (Number.isFinite(a.bb.latestLower) && a.close < a.bb.latestLower && a.rsi14 <= 35) risk -= 6;
    if (a.sweepDown && a.close > a.vwap) risk += 5;
    if (a.sweepUp) risk -= 5;
    if (volumeRatio > 1.45 && a.deltaSum > 0) risk += 4;
    if (volumeRatio > 1.45 && a.deltaSum < 0) risk -= 4;
    risk = clamp(risk, -12, 12);
    var total = clamp(Math.round(technical + flow + derivatives + chain + macro + contextScore + setupScore + risk), -100, 100);
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
      { tone: macro > 5 ? 'good' : macro < -5 ? 'bad' : 'neutral', text: macro > 5 ? 'Noticias e macro estao em modo mais favoravel para risco.' : macro < -5 ? 'Noticias e macro aumentam risco de volatilidade negativa.' : 'Noticias/macro sem impulso forte no momento.' },
      { tone: contextScore > 6 ? 'good' : contextScore < -6 ? 'bad' : 'neutral', text: contextScore > 6 ? 'Contexto gratuito confirma: sentimento, mercado global, ativo ou DeFi favorecem o setup.' : contextScore < -6 ? 'Contexto gratuito pesa contra: sentimento/global/DeFi reduzem a qualidade da entrada.' : 'Contexto gratuito esta misto ou neutro para este par.' },
      { tone: setupScore > 4 ? 'good' : setupScore < -4 ? 'bad' : 'neutral', text: setupScore > 4 ? 'Qualidade do setup esta acima da media: tendencia, fluxo, liquidez e contexto estao mais alinhados.' : setupScore < -4 ? 'Qualidade do setup esta fraca: ha divergencia entre criterios operacionais.' : 'Qualidade do setup ainda exige confirmacao adicional.' }
    ];
    if (risk !== 0) {
      reasons.push({ tone: risk > 0 ? 'good' : 'bad', text: risk > 0 ? 'Ajuste de risco melhora o setup por absorcao/volume.' : 'Ajuste de risco reduz o setup por esticamento, sweep contra ou volume vendedor.' });
    }
    return {
      total: total,
      decision: decision,
      tone: tone,
      news: news,
      external: external,
      setup: setup,
      reasons: reasons.slice(0, 6),
      components: [
        { name: 'Tecnica', score: technical, max: 35 },
        { name: 'Fluxo', score: flow, max: 25 },
        { name: 'Derivativos', score: derivatives, max: 18 },
        { name: 'On-chain', score: chain, max: 10 },
        { name: 'Noticias', score: macro, max: 22 },
        { name: 'Contexto', score: contextScore, max: 28 },
        { name: 'Setup', score: setupScore, max: 12 },
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
    text('entryScoreLine', 'Score ' + signed(c.total) + ' / 100 | ativo ' + Math.round(REFRESH_MS / 1000) + 's | radar ' + Math.round(BOARD_REFRESH_MS / 1000) + 's');
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
  function renderWrittenAnalysis(a) {
    var c = buildConfluence(a);
    var market = selectedMarket(state.symbol);
    var d = a.derivativeDetail || {};
    var volumeRatio = Number.isFinite(a.avgVol) && a.avgVol ? a.lastVol / a.avgVol : NaN;
    var quality = setupQuality(a);
    var technicalTone = c.components[0].score > 10 ? 'favoravel' : c.components[0].score < -10 ? 'desfavoravel' : 'mista';
    var flowTone = c.components[1].score > 7 ? 'confirmando compra' : c.components[1].score < -7 ? 'pressionando venda' : 'sem confirmacao forte';
    var derivativeTone = Number.isFinite(d.oiChangePct) ? (d.oiChangePct > 3 ? 'OI expandindo' : d.oiChangePct < -3 ? 'OI contraindo' : 'OI estavel') : 'OI historico indisponivel';
    var headline = (ASSET_NAMES[state.symbol] || state.symbol) + ': ' + c.decision + ' com score ' + signed(c.total);
    var body = 'No timeframe ' + state.interval + ', a leitura tecnica esta ' + technicalTone + ': estrutura ' + a.structure + ', preco ' + (a.close > a.vwap ? 'acima' : 'abaixo') + ' do VWAP, RSI em ' + num(a.rsi14, 1) + ', MACD ' + (a.macd.hist >= 0 ? 'positivo' : 'negativo') + ', ADX ' + num(a.adx.adx, 1) + ' e Supertrend em ' + a.supertrend.trend + '. ' +
      'O fluxo esta ' + flowTone + ', com delta taker de ' + num(a.deltaSum, 3) + ' ' + baseAsset(state.symbol) + ', CMF ' + num(a.cmf20, 2) + (Number.isFinite(volumeRatio) ? ' e volume em ' + num(volumeRatio, 2) + 'x a media recente. ' : '. ') +
      'A qualidade do setup soma ' + signed(quality.total) + ', com spread de ' + num(a.spreadBps, 2) + ' bps e slippage estimado de compra em ' + num(a.buySlipBps, 2) + ' bps. ' +
      'Nos derivativos, funding atual ' + (Number.isFinite(a.funding) ? percent(a.funding * 100, 4) : '--') + ', ' + derivativeTone + (Number.isFinite(d.longShortRatio) ? ' e long/short em ' + num(d.longShortRatio, 2) + 'x. ' : '. ') +
      'O contexto externo soma ' + signed(c.external.total) + ': sentimento ' + (state.external.fearGreed ? state.external.fearGreed.value + ' ' + state.external.fearGreed.label : 'indisponivel') + ', ativo ' + signed(c.external.asset) + ', global ' + signed(c.external.global) + ' e DeFi ' + signed(c.external.defi) + '. ' +
      'Operacionalmente, a zona de alta fica acima de ' + (a.resistances[0] ? money(a.resistances[0]) : '--') + '; perda de ' + (a.supports[0] ? money(a.supports[0]) : '--') + ' enfraquece o setup. ' +
      (market ? 'No dado fundamental de mercado, rank #' + market.market_cap_rank + ', market cap ' + compactUsd(+market.market_cap) + ', volume 24h ' + compactUsd(+market.total_volume) + ' e distancia do ATH ' + percent(+market.ath_change_percentage, 1) + '. ' : '') +
      'Isso e uma leitura analitica do painel, nao uma recomendacao automatica de compra ou venda.';
    text('analysisHeadline', headline);
    text('analysisBody', body);
    text('analysisQuality', 'RSI/ATR Wilder | BB SMA20 2 sigma | MACD 12/26/9');
    var checks = [
      { cls: c.components[0].score > 10 ? 'good' : c.components[0].score < -10 ? 'bad' : '', label: 'Tecnica', value: signed(c.components[0].score), text: 'Medias, RSI, MACD, VWAP e estrutura.' },
      { cls: c.components[1].score > 7 ? 'good' : c.components[1].score < -7 ? 'bad' : '', label: 'Fluxo', value: signed(c.components[1].score), text: 'Delta taker, volume relativo e book.' },
      { cls: c.components[2].score > 4 ? 'good' : c.components[2].score < -4 ? 'bad' : '', label: 'Derivativos', value: signed(c.components[2].score), text: 'Funding, basis, OI e long/short.' },
      { cls: c.components[4].score > 5 ? 'good' : c.components[4].score < -5 ? 'bad' : '', label: 'Noticias', value: signed(c.components[4].score), text: 'CryptoCompare e GDELT.' },
      { cls: c.components[5].score > 6 ? 'good' : c.components[5].score < -6 ? 'bad' : '', label: 'Contexto', value: signed(c.components[5].score), text: 'CoinGecko, DefiLlama, CoinPaprika e Fear & Greed.' },
      { cls: c.components[6].score > 4 ? 'good' : c.components[6].score < -4 ? 'bad' : '', label: 'Setup', value: signed(c.components[6].score), text: 'Tendencia, momentum, fluxo, volume, liquidez e contexto.' }
    ];
    var list = $('analysisChecklist');
    if (list) {
      list.innerHTML = checks.map(function (item) {
        return '<div class="check-row ' + item.cls + '"><div><strong>' + escapeHTML(item.label) + '</strong><br><span>' + escapeHTML(item.text) + '</span></div><span>' + escapeHTML(item.value) + '</span></div>';
      }).join('');
    }
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
  function reapplyExternalContext() {
    state.board.forEach(function (item) {
      if (item && item.analysis) applyExternalToAnalysis(item.symbol, item.analysis);
    });
    if (state.analysis) {
      applyExternalToAnalysis(state.symbol, state.analysis);
      renderExternalContext(state.analysis);
      renderConfluence(state.analysis);
      renderWrittenAnalysis(state.analysis);
      renderSetupQuality(state.analysis);
      updateScore(state.analysis);
    }
    renderBoard();
  }
  function refreshContextIfNeeded(force) {
    if (state.contextRefreshing) return;
    var needsNews = !!force || !state.newsFetchedAt || Date.now() - state.newsFetchedAt >= NEWS_REFRESH_MS;
    var needsExternal = !!force || !state.external || !state.external.fetchedAt || Date.now() - state.externalFetchedAt >= EXTERNAL_REFRESH_MS;
    if (!needsNews && !needsExternal) return;
    state.contextRefreshing = true;
    if (needsNews) text('newsStatus', 'Atualizando noticias e macro...');
    if (needsExternal) text('externalStatus', 'Atualizando contexto externo...');
    Promise.allSettled([
      needsNews ? loadNewsIfNeeded(true) : Promise.resolve(),
      needsExternal ? loadExternalContext(true) : Promise.resolve(state.external)
    ]).then(function (rows) {
      var external = value(rows[1]);
      if (external) state.external = external;
      reapplyExternalContext();
    }).catch(function () {
      if (needsExternal) text('externalStatus', 'Contexto externo indisponivel agora.');
    }).finally(function () {
      state.contextRefreshing = false;
    });
  }
  function refreshChainIfNeeded(force) {
    if (state.chainRefreshing) return;
    var needsChain = !!force || !state.chainFetchedAt || Date.now() - state.chainFetchedAt >= CHAIN_REFRESH_MS;
    if (!needsChain) return;
    state.chainRefreshing = true;
    loadChain().then(function (chain) {
      state.chain = chain || {};
      state.chainFetchedAt = Date.now();
      if (state.analysis) updateChain(state.chain);
      renderSourceHealth(state.external || {});
    }).catch(function () {
      renderSourceHealth(state.external || {});
    }).finally(function () {
      state.chainRefreshing = false;
    });
  }
  function refreshBoardIfNeeded(force) {
    var needsBoard = !!force || !state.board.length || state.boardInterval !== state.interval || Date.now() - state.boardFetchedAt >= BOARD_REFRESH_MS;
    if (!needsBoard || state.boardRefreshing) return;
    state.boardRefreshing = true;
    var intervalChoice = state.interval;
    (async function () {
      try {
        var symbolsParam = encodeURIComponent(JSON.stringify(ASSETS));
        var baseResults = await Promise.allSettled([
          fetchJSON('https://api.binance.com/api/v3/ticker/24hr?symbols=' + symbolsParam, 10000),
          fetchJSON('https://fapi.binance.com/fapi/v1/premiumIndex', 10000)
        ]);
        var tickerMap = tickerMapFromRows(value(baseResults[0]));
        var premiumMap = premiumMapFromRows(value(baseResults[1]));
        var boardResults = await Promise.allSettled(ASSETS.map(function (symbol) { return loadBoardAsset(symbol, tickerMap[symbol], premiumMap[symbol], intervalChoice); }));
        if (intervalChoice !== state.interval) return;
        state.board = boardResults.map(value).filter(Boolean);
        state.boardFetchedAt = Date.now();
        state.boardInterval = intervalChoice;
        renderBoard();
      } catch (error) {
        text('boardSummary', 'Radar multiativos indisponivel agora: ' + error.message);
      } finally {
        state.boardRefreshing = false;
      }
    })();
  }
  async function refresh(force) {
    if (state.refreshing) {
      if (force) state.pendingRefresh = true;
      return;
    }
    state.refreshing = true;
    state.symbol = normalizeSymbol($('symbolSelect').value);
    $('symbolSelect').value = state.symbol;
    state.interval = $('intervalSelect').value;
    if (ASSETS.indexOf(state.symbol) === -1) ASSETS.unshift(state.symbol);
    refreshChainIfNeeded(false);
    refreshContextIfNeeded(false);
    refreshBoardIfNeeded(!!force);
    text('statusText', 'Atualizando ativo selecionado em tempo real...');
    try {
      await refreshSelected(null, null, state.chain || {}, !!force);
      text('statusText', 'Live: ' + state.symbol + ' ' + Math.round(REFRESH_MS / 1000) + 's | ' + (state.boardRefreshing ? 'radar atualizando' : 'radar ' + Math.round(BOARD_REFRESH_MS / 1000) + 's') + ' | derivativos ' + Math.round(DERIVATIVES_REFRESH_MS / 1000) + 's | contexto 2min | noticias 5min');
    } catch (error) {
      text('statusText', 'Falha ao atualizar: ' + error.message);
    } finally {
      state.refreshing = false;
      if (state.pendingRefresh) {
        state.pendingRefresh = false;
        refresh(true);
      }
    }
  }
  function normalizeSymbol(value) {
    var clean = String(value || 'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean.endsWith('USDT')) clean += 'USDT';
    return clean || 'BTCUSDT';
  }
  async function loadBoardAsset(symbol, ticker, premium, intervalChoice) {
    var rows = await fetchJSON('https://api.binance.com/api/v3/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + (intervalChoice || state.interval) + '&limit=140', 10000);
    var candles = parseKlines(rows);
    if (!candles.length) return null;
    var analysis = applyExternalToAnalysis(symbol, buildCoreAnalysis(candles, ticker, premium, {}));
    return { symbol: symbol, ticker: ticker, premium: premium, candles: candles, analysis: analysis };
  }
  function futuresPeriod(interval) {
    return ['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'].indexOf(interval) !== -1 ? interval : '5m';
  }
  function normalizeDerivativeDetail(oiHist, fundingRows, longShortRows, takerRows) {
    var oiChangePct = NaN;
    if (Array.isArray(oiHist) && oiHist.length > 1) {
      var firstOi = +oiHist[0].sumOpenInterestValue || +oiHist[0].sumOpenInterest || 0;
      var lastOi = +oiHist[oiHist.length - 1].sumOpenInterestValue || +oiHist[oiHist.length - 1].sumOpenInterest || 0;
      oiChangePct = firstOi ? ((lastOi - firstOi) / firstOi) * 100 : NaN;
    }
    var fundingAvg = NaN;
    if (Array.isArray(fundingRows) && fundingRows.length) fundingAvg = avg(fundingRows.map(function (row) { return +row.fundingRate; }).filter(Number.isFinite));
    var latestLongShort = Array.isArray(longShortRows) && longShortRows.length ? longShortRows[longShortRows.length - 1] : null;
    var latestTaker = Array.isArray(takerRows) && takerRows.length ? takerRows[takerRows.length - 1] : null;
    return {
      oiChangePct: oiChangePct,
      fundingAvg: fundingAvg,
      longShortRatio: latestLongShort ? +latestLongShort.longShortRatio : NaN,
      longAccount: latestLongShort ? +latestLongShort.longAccount : NaN,
      shortAccount: latestLongShort ? +latestLongShort.shortAccount : NaN,
      takerRatio: latestTaker ? +latestTaker.buySellRatio : NaN,
      takerBuyVol: latestTaker ? +latestTaker.buyVol : NaN,
      takerSellVol: latestTaker ? +latestTaker.sellVol : NaN
    };
  }
  function hasDerivativeData(detail) {
    return !!detail && (Number.isFinite(detail.oiChangePct) || Number.isFinite(detail.fundingAvg) || Number.isFinite(detail.longShortRatio) || Number.isFinite(detail.takerRatio));
  }
  async function loadDerivativeDetail(symbol, period, force) {
    var key = symbol + ':' + period;
    var cached = state.derivativeCache[key];
    if (!force && cached && Date.now() - cached.fetchedAt < DERIVATIVES_REFRESH_MS) return cached.value;
    var s = encodeURIComponent(symbol);
    var rows = await Promise.allSettled([
      fetchJSON('https://fapi.binance.com/futures/data/openInterestHist?symbol=' + s + '&period=' + period + '&limit=30', 9000),
      fetchJSON('https://fapi.binance.com/fapi/v1/fundingRate?symbol=' + s + '&limit=12', 9000),
      fetchJSON('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=' + s + '&period=' + period + '&limit=30', 9000),
      fetchJSON('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=' + s + '&period=' + period + '&limit=30', 9000)
    ]);
    var detail = normalizeDerivativeDetail(value(rows[0]), value(rows[1]), value(rows[2]), value(rows[3]));
    detail.fetchedAt = Date.now();
    detail.period = period;
    if (!hasDerivativeData(detail) && cached) return cached.value;
    state.derivativeCache[key] = { value: detail, fetchedAt: detail.fetchedAt };
    return detail;
  }
  async function refreshSelected(ticker, premium, chain, force) {
    var s = encodeURIComponent(state.symbol);
    var p = futuresPeriod(state.interval);
    var results = await Promise.allSettled([
      fetchJSON('https://api.binance.com/api/v3/klines?symbol=' + s + '&interval=' + state.interval + '&limit=240', 10000),
      fetchJSON('https://api.binance.com/api/v3/depth?symbol=' + s + '&limit=100', 10000),
      fetchJSON('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + s, 9000),
      ticker ? Promise.resolve(ticker) : fetchJSON('https://api.binance.com/api/v3/ticker/24hr?symbol=' + s, 9000),
      premium ? Promise.resolve(premium) : fetchJSON('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + s, 9000),
      loadDerivativeDetail(state.symbol, p, !!force)
    ]);
    var candles = parseKlines(value(results[0]));
    if (!candles.length) throw new Error('Sem candles para ' + state.symbol);
    state.klines = candles;
    state.analysis = mergeSelected(candles, value(results[3]), value(results[1]), value(results[4]), value(results[2]), chain || {});
    state.analysis.derivativeDetail = value(results[5]) || {};
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
      var market = state.external && state.external.coinMarkets ? state.external.coinMarkets[contextFor(item.symbol).gecko] : null;
      var chain = findChainContext(item.symbol);
      var protocol = findProtocolContext(item.symbol);
      var contextName = protocol ? protocol.name : chain ? chain.name : (contextFor(item.symbol).kind || 'Global');
      var contextScore = a.external ? a.external.total : 0;
      var card = document.createElement('button');
      card.className = 'asset-card' + (item.symbol === state.symbol ? ' active' : '');
      card.type = 'button'; card.dataset.symbol = item.symbol;
      card.innerHTML = '<div class="asset-top"><div><span class="asset-symbol">' + baseAsset(item.symbol) + '</span><small>' + (ASSET_NAMES[item.symbol] || item.symbol) + '</small></div><span class="asset-score ' + scoreClass(a.bias) + '">' + a.score + '</span></div>' +
        '<div class="asset-row"><div><span>Preco</span><strong>' + money(a.close) + '</strong></div><div><span>24h</span><strong class="' + ((+t.priceChangePercent || 0) >= 0 ? 'up' : 'down') + '">' + percent(+t.priceChangePercent) + '</strong></div></div>' +
        sparkline(item.candles) +
        '<div class="asset-meta"><div><span>Bias</span><strong>' + a.bias + '</strong></div><div><span>RSI/MFI</span><strong>' + num(a.rsi14, 0) + ' / ' + num(a.mfi14, 0) + '</strong></div><div><span>Rank/MCap</span><strong>' + (market && market.market_cap_rank ? '#' + market.market_cap_rank + ' ' + compactUsd(+market.market_cap) : '--') + '</strong></div><div><span>7d/30d</span><strong>' + (market ? percent(+market.price_change_percentage_7d_in_currency, 1) + ' / ' + percent(+market.price_change_percentage_30d_in_currency, 1) : '--') + '</strong></div><div><span>Funding</span><strong>' + (Number.isFinite(a.funding) ? percent(a.funding * 100, 4) : '--') + '</strong></div><div><span>Contexto</span><strong>' + signed(contextScore) + '</strong></div></div>' +
        '<div class="asset-context"><span>' + escapeHTML(contextName) + '</span><strong>' + (a.supports[0] ? money(a.supports[0]) : '--') + ' / ' + (a.resistances[0] ? money(a.resistances[0]) : '--') + '</strong></div>';
      grid.appendChild(card);
    });
    renderOverviewDashboard();
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
    updateScore(a); updateBook(a); updateChain(chain); renderExternalContext(a); renderAdvancedIndicators(a); renderSetupQuality(a); renderLiquidity(a); renderDerivativesDetails(a); renderConfluence(a); renderWrittenAnalysis(a); drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); renderBoard();
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
    text('sentimentSignal', c.external.sentiment > 2 ? 'Apoia risco' : c.external.sentiment < -2 ? 'Pressiona' : 'Neutro');
    text('externalSignal', c.external.total > 6 ? 'Favoravel' : c.external.total < -6 ? 'Contra' : 'Misto');
    var top = a.resistances[0], base = a.supports[0];
    var plan = c.tone === 'long' ? 'Favorece continuacao se aceitar acima de ' + money(top) + '. Confirmar com volume/delta e evitar chase se RSI esticar.' : c.tone === 'avoid' ? 'Risco domina. Melhor esperar recuperacao de ' + money(base) + ' ou perda clara com reteste antes de agir.' : 'Faixa de decisao entre ' + money(base) + ' e ' + money(top) + '. Melhor sinal vem de rompimento com reteste e score externo sem divergencia.';
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
  function renderAdvancedIndicators(a) {
    text('adxLine', num(a.adx.adx, 1) + ' | +' + num(a.adx.plus, 1) + ' / -' + num(a.adx.minus, 1));
    text('supertrendLine', a.supertrend.trend + ' ' + money(a.supertrend.value));
    text('keltnerLine', money(a.keltner.lower) + ' / ' + money(a.keltner.upper));
    text('donchianLine', money(a.donchian.lower) + ' / ' + money(a.donchian.upper));
    text('bbStatsLine', num(a.bbPctB, 1) + '% | width ' + percent(a.bbWidth, 2).replace('+', ''));
    text('rocLine', percent(a.roc12, 2));
    text('obvLine', compactNumber(a.obv));
    text('cmfLine', num(a.cmf20, 3));
  }
  function renderSetupQuality(a) {
    var q = setupQuality(a);
    text('setupScoreLine', 'Score ' + signed(q.total));
    var node = $('setupChecklist');
    if (node) {
      node.innerHTML = q.checks.map(function (item) {
        var cls = item.score > 0 ? 'good' : item.score < 0 ? 'bad' : '';
        return '<div class="setup-row ' + cls + '"><div><strong>' + escapeHTML(item.name) + '</strong><span>' + escapeHTML(item.detail) + '</span></div><em>' + signed(item.score) + '</em></div>';
      }).join('');
    }
    var label = q.total >= 45 ? 'Setup forte, mas ainda exige gatilho e controle de risco.' : q.total >= 20 ? 'Setup construtivo, melhor com confirmacao de rompimento/reteste.' : q.total <= -25 ? 'Setup fraco; evitar entrada antecipada ate melhorar confluencia.' : 'Setup misto; decisao depende de gatilho claro no preco.';
    text('setupCaption', label);
  }
  function renderLiquidity(a) {
    text('spreadBpsLine', Number.isFinite(a.spreadBps) ? num(a.spreadBps, 2) + ' bps' : '--');
    text('micropriceLine', money(a.microprice));
    text('book01Line', a.book01 ? 'Bid ' + compactMoney(a.book01.bidNotional) + ' / Ask ' + compactMoney(a.book01.askNotional) : '--');
    text('book05Line', a.book05 ? 'Bid ' + compactMoney(a.book05.bidNotional) + ' / Ask ' + compactMoney(a.book05.askNotional) : '--');
    text('buySlipLine', Number.isFinite(a.buySlipBps) ? num(a.buySlipBps, 2) + ' bps em ' + compactMoney(a.slippageNotional) : '--');
    text('sellSlipLine', Number.isFinite(a.sellSlipBps) ? num(a.sellSlipBps, 2) + ' bps em ' + compactMoney(a.slippageNotional) : '--');
  }
  function renderExternalContext(a) {
    var ext = state.external || {};
    var ctx = contextFor(state.symbol);
    var market = selectedMarket(state.symbol);
    var chain = findChainContext(state.symbol);
    var protocol = findProtocolContext(state.symbol);
    var externalScore = a && a.external ? a.external : scoreExternalContext(state.symbol);
    text('fearGreedLine', ext.fearGreed ? ext.fearGreed.value + ' ' + ext.fearGreed.label : '--');
    text('globalRiskLine', 'Contexto ' + signed(externalScore.total));
    text('focusAssetKind', ctx.kind || 'Criptoativo');
    text('focusAssetName', (ASSET_NAMES[state.symbol] || baseAsset(state.symbol)) + ' / USDT');
    text('focusRank', market && market.market_cap_rank ? '#' + market.market_cap_rank : '--');
    text('focusNarrative', ctx.narrative || 'Ativo acompanhado por mercado, fluxo, noticias e contexto global.');
    text('focusMarketCap', market ? compactUsd(+market.market_cap) : '--');
    text('focusChange', market ? percent(+market.price_change_percentage_7d_in_currency, 2) + ' / ' + percent(+market.price_change_percentage_30d_in_currency, 2) : '--');
    text('focusVolume', market ? compactUsd(+market.total_volume) : '--');
    text('focusShortChange', market ? percent(+market.price_change_percentage_1h_in_currency, 2) + ' / ' + percent(+market.price_change_percentage_24h_in_currency, 2) : '--');
    text('focusAth', market && Number.isFinite(+market.ath_change_percentage) ? percent(+market.ath_change_percentage, 1) : '--');
    text('focusSupply', market ? compactNumber(+market.circulating_supply) + (market.max_supply ? ' / ' + compactNumber(+market.max_supply) : '') : '--');
    text('focusChain', chain ? chain.name : (ctx.chain || '--'));
    text('focusChainTvl', chain ? compactUsd(+chain.tvl) + ' TVL | 7d ' + percent(+chain.change_7d, 2) : 'Sem TVL direto');
    text('focusProtocol', protocol ? protocol.name : (ctx.protocol || '--'));
    text('focusProtocolTvl', protocol ? compactUsd(+protocol.tvl) + ' TVL | 7d ' + percent(+protocol.change_7d, 2) : 'Sem protocolo direto');
    renderGlobalContext(ext);
    renderSourceHealth(ext);
  }
  function renderGlobalContext(ext) {
    var global = ext.global || {};
    var paprika = ext.paprikaGlobal || {};
    var totalMcap = global.total_market_cap && global.total_market_cap.usd ? +global.total_market_cap.usd : +paprika.market_cap_usd;
    var totalVol = global.total_volume && global.total_volume.usd ? +global.total_volume.usd : +paprika.volume_24h_usd;
    var globalChange = Number.isFinite(+global.market_cap_change_percentage_24h_usd) ? +global.market_cap_change_percentage_24h_usd : +paprika.market_cap_change_24h;
    var btcDom = btcDominanceValue(ext);
    text('globalMarketCap', compactUsd(totalMcap));
    text('globalVolume', compactUsd(totalVol));
    text('btcDominance', Number.isFinite(btcDom) ? percent(btcDom, 2).replace('+', '') : '--');
    text('defiTvl', compactUsd(+ext.defiTvl));
    text('stablecoinCap', compactUsd(+ext.stablecoinCap));
    text('dexVolume', compactUsd(+ext.dexVolume));
    text('fees24h', compactUsd(+ext.fees24h));
    text('defiPerpsOi', compactUsd(+ext.perpsOpenInterest));
    var trending = (ext.trending || []).map(function (item) { return item.symbol ? item.symbol.toUpperCase() : item.name; }).filter(Boolean).slice(0, 5);
    text('trendingLine', (Number.isFinite(globalChange) ? 'Mcap 24h ' + percent(globalChange, 2) + '. ' : '') + (trending.length ? 'Trending: ' + trending.join(', ') : 'Trending indisponivel.'));
    text('externalStatus', ext.fetchedAt ? 'Atualizado ' + new Date(ext.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--');
    text('pairContextUpdated', ext.fetchedAt ? 'Contexto ' + Math.round(EXTERNAL_REFRESH_MS / 1000) + 's' : '--');
  }
  function renderDerivativesDetails(a) {
    var d = a.derivativeDetail || {};
    text('oiChangeLine', Number.isFinite(d.oiChangePct) ? percent(d.oiChangePct, 2) + ' no periodo' : '--');
    text('fundingAvgLine', Number.isFinite(d.fundingAvg) ? percent(d.fundingAvg * 100, 4) : '--');
    text('longShortLine', Number.isFinite(d.longShortRatio) ? num(d.longShortRatio, 2) + 'x | long ' + percent((d.longAccount || 0) * 100, 1).replace('+', '') : '--');
    text('takerRatioLine', Number.isFinite(d.takerRatio) ? num(d.takerRatio, 2) + 'x buy/sell' : '--');
    var detail = [];
    if (Number.isFinite(d.oiChangePct)) detail.push('OI ' + (d.oiChangePct >= 0 ? 'expandindo' : 'reduzindo'));
    if (Number.isFinite(d.longShortRatio)) detail.push(d.longShortRatio > 1.15 ? 'contas mais long' : d.longShortRatio < 0.85 ? 'contas mais short' : 'posicionamento equilibrado');
    if (Number.isFinite(d.takerRatio)) detail.push(d.takerRatio > 1.08 ? 'agressao compradora' : d.takerRatio < 0.92 ? 'agressao vendedora' : 'takers neutros');
    if (d.period) detail.push('periodo ' + d.period);
    if (d.fetchedAt) detail.push('cache ' + Math.round(DERIVATIVES_REFRESH_MS / 1000) + 's');
    text('derivativesCaption', detail.length ? detail.join(' | ') : 'Dados historicos de derivativos indisponiveis no momento.');
  }
  function renderOverviewDashboard() {
    if (!state.board.length) return;
    var rows = state.board.slice().sort(function (a, b) { return b.analysis.score - a.analysis.score; });
    var best = rows[0], worst = rows[rows.length - 1];
    var ext = state.external || {};
    var global = ext.global || {};
    var paprika = ext.paprikaGlobal || {};
    var totalMcap = global.total_market_cap && global.total_market_cap.usd ? +global.total_market_cap.usd : +paprika.market_cap_usd;
    var globalChange = Number.isFinite(+global.market_cap_change_percentage_24h_usd) ? +global.market_cap_change_percentage_24h_usd : +paprika.market_cap_change_24h;
    text('overviewBestAsset', best ? baseAsset(best.symbol) : '--');
    text('overviewBestScore', best ? 'Score ' + signed(best.analysis.score) + ' | ' + best.analysis.bias : '--');
    text('overviewRiskAsset', worst ? baseAsset(worst.symbol) : '--');
    text('overviewRiskScore', worst ? 'Score ' + signed(worst.analysis.score) + ' | ' + worst.analysis.bias : '--');
    text('overviewMarketCap', compactUsd(totalMcap));
    text('overviewMarketMove', Number.isFinite(globalChange) ? '24h ' + percent(globalChange, 2) : '--');
    text('overviewDefiTvl', compactUsd(+ext.defiTvl));
    text('overviewDexVolume', 'DEX 24h ' + compactUsd(+ext.dexVolume));
    text('overviewFearGreed', ext.fearGreed ? ext.fearGreed.value + ' ' + ext.fearGreed.label : '--');
    text('overviewContextScore', 'Contexto ' + (state.analysis && state.analysis.external ? signed(state.analysis.external.total) : '--'));
    text('overviewUpdated', ext.fetchedAt ? 'Atualizado ' + new Date(ext.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--');
    var bulls = rows.filter(function (x) { return x.analysis.score >= 35; }).length;
    var bears = rows.filter(function (x) { return x.analysis.score <= -35; }).length;
    text('overviewSummary', bulls + ' ativos com viés comprador, ' + bears + ' com pressão vendedora. Clique em um ativo para abrir a análise individual.');
    renderOverviewList('overviewLeaders', rows.slice(0, 5), true);
    renderOverviewList('overviewRisks', rows.slice(-5).reverse(), false);
    text('leadersCount', String(Math.min(5, rows.length)));
    text('risksCount', String(Math.min(5, rows.length)));
  }
  function renderOverviewList(id, rows, leaders) {
    var node = $(id); if (!node) return;
    node.innerHTML = rows.map(function (item) {
      var a = item.analysis;
      var desc = leaders ? a.bias + ' | RSI ' + num(a.rsi14, 0) + ' | contexto ' + signed(a.external ? a.external.total : 0) : 'Risco | RSI ' + num(a.rsi14, 0) + ' | contexto ' + signed(a.external ? a.external.total : 0);
      return '<div class="compact-row"><button type="button" data-symbol="' + escapeHTML(item.symbol) + '"><span class="token">' + escapeHTML(baseAsset(item.symbol)) + '</span><span class="desc">' + escapeHTML(desc) + '</span><span class="score">' + signed(a.score) + '</span></button></div>';
    }).join('');
  }
  function renderSourceHealth(ext) {
    var sources = [
      sourceRow('Binance spot', !!state.klines.length, state.interval + ' / candles'),
      sourceRow('Binance futuros', !!(state.analysis && state.analysis.oi), state.analysis && state.analysis.oi ? 'OI/funding' : 'aguardando'),
      sourceRow('mempool.space', !!(state.chain && state.chain.height), state.chain && state.chain.height ? 'BTC on-chain' : 'sem leitura'),
      sourceRow('CryptoCompare', state.news.some(function (item) { return item.type === 'crypto'; }), 'noticias crypto'),
      sourceRow('GDELT', state.news.some(function (item) { return item.type === 'macro'; }), 'macro/geopolitica')
    ].concat((ext && ext.sources) || []);
    var ok = sources.filter(function (item) { return item.ok; }).length;
    text('sourceCount', ok + '/' + sources.length + ' online');
    var list = $('dataSources');
    if (!list) return;
    list.innerHTML = sources.map(function (item) {
      var cls = item.ok ? 'ok' : 'warn';
      return '<div class="source-pill ' + cls + '"><strong>' + escapeHTML(item.name) + '</strong><span>' + escapeHTML(item.detail) + '</span></div>';
    }).join('');
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
    if (state.chart.ema9) drawLine(ctx, candles, emaSeries(closeSeries, 9), x, y, '#4fd3c4');
    if (state.chart.ema21) drawLine(ctx, candles, emaSeries(closeSeries, 21), x, y, '#55a7ff');
    if (state.chart.ema50) drawLine(ctx, candles, emaSeries(closeSeries, 50), x, y, '#f5b84b');
    var bb = bollinger(closeSeries, 20, 2);
    if (state.chart.bb) {
      drawLine(ctx, candles, bb.upper, x, y, 'rgba(169,139,255,.72)');
      drawLine(ctx, candles, bb.mid, x, y, 'rgba(169,139,255,.42)');
      drawLine(ctx, candles, bb.lower, x, y, 'rgba(169,139,255,.72)');
    }
    var a = state.analysis;
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#f4f0e8'; ctx.beginPath(); ctx.moveTo(pad.l, y(a.close)); ctx.lineTo(w - pad.r + 18, y(a.close)); ctx.stroke(); ctx.setLineDash([]);
    if (state.chart.levels) a.supports.concat(a.resistances).forEach(function (level) { ctx.strokeStyle = level < a.close ? 'rgba(34,199,131,.55)' : 'rgba(255,92,112,.55)'; ctx.beginPath(); ctx.moveTo(pad.l, y(level)); ctx.lineTo(w - pad.r + 18, y(level)); ctx.stroke(); });
    var maxVol = Math.max.apply(null, candles.map(function (q) { return q.volume; })) || 1, vh = 56, vy = h - 66;
    candles.forEach(function (bar, i) { var height = (bar.volume / maxVol) * vh; ctx.fillStyle = bar.close >= bar.open ? 'rgba(34,199,131,.28)' : 'rgba(255,92,112,.28)'; ctx.fillRect(x(i) - bw / 2, vy + vh - height, bw, height); });
    var legendX = pad.l;
    [
      { on: state.chart.ema9, label: 'EMA9', color: '#4fd3c4' },
      { on: state.chart.ema21, label: 'EMA21', color: '#55a7ff' },
      { on: state.chart.ema50, label: 'EMA50', color: '#f5b84b' },
      { on: state.chart.bb, label: 'BB20', color: '#a98bff' }
    ].forEach(function (item) {
      if (!item.on) return;
      ctx.fillStyle = '#9da7b3'; ctx.fillText(item.label, legendX, 18);
      ctx.fillStyle = item.color; ctx.fillRect(legendX + item.label.length * 7 + 8, 10, 16, 3);
      legendX += item.label.length * 7 + 42;
    });
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
    refresh(true);
  }
  function setSort(sort) {
    state.sort = sort;
    $('sortScoreButton').classList.toggle('active', sort === 'score');
    $('sortChangeButton').classList.toggle('active', sort === 'change');
    $('sortVolumeButton').classList.toggle('active', sort === 'volume');
    renderBoard();
  }
  function setView(view) {
    state.view = view === 'asset' ? 'asset' : 'dashboard';
    document.body.setAttribute('data-view', state.view);
    var dashboard = $('viewDashboardButton'), asset = $('viewAssetButton');
    if (dashboard) dashboard.classList.toggle('active', state.view === 'dashboard');
    if (asset) asset.classList.toggle('active', state.view === 'asset');
    setTimeout(function () { drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); }, 0);
  }
  function selectSymbol(symbol, openAsset) {
    state.symbol = normalizeSymbol(symbol);
    $('symbolSelect').value = state.symbol;
    if (openAsset) setView('asset');
    refresh(true);
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
    setView(state.view);
    $('viewDashboardButton').addEventListener('click', function () { setView('dashboard'); });
    $('viewAssetButton').addEventListener('click', function () { setView('asset'); });
    $('refreshButton').addEventListener('click', function () { refresh(true); });
    $('intervalSelect').addEventListener('change', function (e) { setIntervalChoice(e.target.value); });
    $('symbolSelect').addEventListener('change', function (e) { selectSymbol(e.target.value, true); });
    $('liveButton').addEventListener('click', function () { state.live = !state.live; $('liveButton').classList.toggle('is-on', state.live); $('liveButton').setAttribute('aria-pressed', String(state.live)); });
    $('timeTabs').addEventListener('click', function (e) { if (e.target.dataset.interval) setIntervalChoice(e.target.dataset.interval); });
    $('assetGrid').addEventListener('click', function (e) { var card = e.target.closest('.asset-card'); if (card) selectSymbol(card.dataset.symbol, true); });
    $('overviewLeaders').addEventListener('click', function (e) { var row = e.target.closest('[data-symbol]'); if (row) selectSymbol(row.dataset.symbol, true); });
    $('overviewRisks').addEventListener('click', function (e) { var row = e.target.closest('[data-symbol]'); if (row) selectSymbol(row.dataset.symbol, true); });
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
      if (state.analysis) {
        renderConfluence(state.analysis);
        renderWrittenAnalysis(state.analysis);
        updateScore(state.analysis);
      }
    });
    $('externalRefreshButton').addEventListener('click', async function () {
      text('externalStatus', 'Atualizando...');
      await loadExternalContext(true);
      reapplyExternalContext();
    });
    document.querySelectorAll('[data-overlay]').forEach(function (input) {
      input.addEventListener('change', function (e) {
        state.chart[e.target.dataset.overlay] = e.target.checked;
        drawPriceChart();
      });
    });
    window.addEventListener('resize', function () { drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); });
    state.timer = setInterval(function () { if (state.live) refresh(); }, REFRESH_MS);
  }
  bind(); refresh();
})();
