(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CryptoAnalyticsCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function isFiniteNumber(value) {
    return typeof value === 'number' && Number.isFinite(value);
  }

  function toFiniteNumber(value) {
    if (value === null || value === undefined || typeof value === 'boolean') return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    var number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function numberOr(value, fallback) {
    var number = toFiniteNumber(value);
    return number === null ? fallback : number;
  }

  function nonNegative(value, fallback) {
    return Math.max(0, numberOr(value, fallback === undefined ? 0 : fallback));
  }

  function average(values) {
    if (!values.length) return NaN;
    return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
  }

  function lastFinite(values) {
    for (var index = values.length - 1; index >= 0; index -= 1) {
      if (isFiniteNumber(values[index])) return values[index];
    }
    return NaN;
  }

  /**
   * Calculates a position using the calculator's percentage inputs.
   * fundingPayment is signed from the position holder's perspective:
   * positive means paid, negative means received.
   */
  function calculatePosition(input) {
    input = input || {};
    var mode = input.mode === 'futures' ? 'futures' : 'spot';
    var side = mode === 'spot' ? 'long' : (input.side === 'short' ? 'short' : 'long');
    var currentQty = nonNegative(input.currentQty);
    var currentPrice = nonNegative(input.currentPrice);
    var addMultiple = nonNegative(input.addMultiple);
    var addPrice = nonNegative(input.addPrice);
    var entryFeeRate = nonNegative(input.entryFeePct) / 100;
    var exitFeeRate = nonNegative(input.exitFeePct) / 100;
    var leverage = Math.max(1, numberOr(input.leverage, 1));
    var fundingRate = numberOr(input.fundingRatePct, 0) / 100;
    var fundingPeriods = nonNegative(input.fundingPeriods);
    var maintenanceRate = nonNegative(input.maintenancePct) / 100;

    var addQty = currentQty * addMultiple;
    var quantity = currentQty + addQty;
    var notional = (currentQty * currentPrice) + (addQty * addPrice);
    var executionAverage = quantity ? notional / quantity : NaN;
    var entryFees = notional * entryFeeRate;
    var fundingPayment = mode === 'futures'
      ? notional * fundingRate * fundingPeriods * (side === 'long' ? 1 : -1)
      : 0;
    var averageWithEntryFee = quantity
      ? (side === 'long' ? notional + entryFees : notional - entryFees) / quantity
      : NaN;
    var breakEven = NaN;
    if (quantity) {
      if (side === 'long' && exitFeeRate < 1) {
        breakEven = (notional + entryFees + fundingPayment) / (quantity * (1 - exitFeeRate));
      } else if (side === 'short') {
        breakEven = (notional - entryFees - fundingPayment) / (quantity * (1 + exitFeeRate));
      }
    }
    var exitFees = isFiniteNumber(breakEven) ? quantity * breakEven * exitFeeRate : NaN;
    var tradingFees = isFiniteNumber(exitFees) ? entryFees + exitFees : NaN;
    var totalCosts = isFiniteNumber(tradingFees) ? tradingFees + fundingPayment : NaN;
    var margin = mode === 'futures' ? notional / leverage : notional;
    var liquidationPrice = mode === 'futures' && isFiniteNumber(executionAverage)
      ? executionAverage * (side === 'long'
        ? 1 - (1 / leverage) + maintenanceRate
        : 1 + (1 / leverage) - maintenanceRate)
      : NaN;

    return {
      mode: mode,
      side: side,
      currentQty: currentQty,
      addQty: addQty,
      quantity: quantity,
      notional: notional,
      executionAverage: executionAverage,
      entryFees: entryFees,
      exitFees: exitFees,
      tradingFees: tradingFees,
      fundingPayment: fundingPayment,
      totalCosts: totalCosts,
      averageWithEntryFee: averageWithEntryFee,
      breakEven: breakEven,
      margin: margin,
      liquidationPrice: liquidationPrice
    };
  }

  function percentageChange(latest, prior) {
    var latestValue = toFiniteNumber(latest);
    var priorValue = toFiniteNumber(prior);
    if (latestValue === null || priorValue === null || priorValue === 0) return null;
    return ((latestValue - priorValue) / priorValue) * 100;
  }

  function chartResult(payload) {
    return payload && payload.chart && payload.chart.result && payload.chart.result[0];
  }

  /** Normalizes Yahoo-style chart data without coercing null quotes to zero. */
  function normalizeTradFiRows(payload) {
    var chart = chartResult(payload);
    var timestamps = chart && Array.isArray(chart.timestamp) ? chart.timestamp : [];
    var quote = chart && chart.indicators && chart.indicators.quote
      && chart.indicators.quote[0] || {};

    return timestamps.map(function (rawTimestamp, index) {
      var timestamp = toFiniteNumber(rawTimestamp);
      var close = toFiniteNumber(quote.close && quote.close[index]);
      if (timestamp === null || close === null) return null;
      return {
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        observedAt: timestamp * 1000,
        open: toFiniteNumber(quote.open && quote.open[index]),
        high: toFiniteNumber(quote.high && quote.high[index]),
        low: toFiniteNumber(quote.low && quote.low[index]),
        close: close,
        volume: toFiniteNumber(quote.volume && quote.volume[index])
      };
    }).filter(function (row) { return row !== null; });
  }

  /** Builds the normalized asset returned by the TradFi adapter. */
  function normalizeTradFiChart(payload, meta) {
    var rows = normalizeTradFiRows(payload);
    var latest = rows[rows.length - 1];
    if (!latest) throw new RangeError('Sem cotacao valida para ' + ((meta && meta.symbol) || 'ativo'));
    return Object.assign({}, meta || {}, {
      date: latest.date,
      observedAt: latest.observedAt,
      close: latest.close,
      volume: latest.volume,
      change1d: percentageChange(latest.close, rows.length >= 2 ? rows[rows.length - 2].close : null),
      change5d: percentageChange(latest.close, rows.length >= 6 ? rows[rows.length - 6].close : null),
      change20d: percentageChange(latest.close, rows.length >= 21 ? rows[rows.length - 21].close : null)
    });
  }

  function normalizeKlines(rows) {
    return (Array.isArray(rows) ? rows : []).map(function (row) {
      if (!Array.isArray(row)) return null;
      var candle = {
        time: toFiniteNumber(row[0]),
        open: toFiniteNumber(row[1]),
        high: toFiniteNumber(row[2]),
        low: toFiniteNumber(row[3]),
        close: toFiniteNumber(row[4]),
        volume: toFiniteNumber(row[5]),
        closeTime: toFiniteNumber(row[6]),
        quote: toFiniteNumber(row[7]),
        trades: toFiniteNumber(row[8]),
        takerBuy: toFiniteNumber(row[9])
      };
      return candle.time === null || candle.open === null || candle.high === null
        || candle.low === null || candle.close === null ? null : candle;
    }).filter(function (candle) { return candle !== null; });
  }

  function isCandleClosed(candle, asOf) {
    var closeTime = candle && toFiniteNumber(candle.closeTime);
    var now = toFiniteNumber(asOf);
    if (now === null) now = Date.now();
    return closeTime !== null && closeTime <= now;
  }

  /** Only these candles may feed confirmed indicators and signals. */
  function selectClosedCandles(candles, asOf) {
    var source = Array.isArray(candles) ? candles : [];
    return source.filter(function (candle) { return isCandleClosed(candle, asOf); });
  }

  function rsiFromAverages(avgGain, avgLoss) {
    if (avgGain === 0 && avgLoss === 0) return 50;
    if (avgLoss === 0) return 100;
    if (avgGain === 0) return 0;
    return 100 - (100 / (1 + (avgGain / avgLoss)));
  }

  /** Wilder RSI series; the first value is emitted at index period. */
  function rsiSeries(values, period) {
    var length = Array.isArray(values) ? values.length : 0;
    var output = Array.from({ length: length }, function () { return null; });
    period = Math.floor(numberOr(period, 14));
    if (period < 1) throw new RangeError('RSI period must be at least 1');
    if (length <= period) return output;

    var numbers = values.map(function (value) {
      var number = toFiniteNumber(value);
      if (number === null) throw new TypeError('RSI values must be finite numbers');
      return number;
    });
    var avgGain = 0;
    var avgLoss = 0;
    var index;
    for (index = 1; index <= period; index += 1) {
      var difference = numbers[index] - numbers[index - 1];
      if (difference > 0) avgGain += difference;
      else avgLoss -= difference;
    }
    avgGain /= period;
    avgLoss /= period;
    output[period] = rsiFromAverages(avgGain, avgLoss);

    for (index = period + 1; index < numbers.length; index += 1) {
      var change = numbers[index] - numbers[index - 1];
      var gain = change > 0 ? change : 0;
      var loss = change < 0 ? -change : 0;
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
      output[index] = rsiFromAverages(avgGain, avgLoss);
    }
    return output;
  }

  function rsi(values, period) {
    return lastFinite(rsiSeries(values, period));
  }

  function finiteCandle(candle) {
    return candle && isFiniteNumber(candle.high) && isFiniteNumber(candle.low)
      && isFiniteNumber(candle.close);
  }

  function directionalIndex(trSmooth, plusSmooth, minusSmooth) {
    var plus = trSmooth ? (plusSmooth / trSmooth) * 100 : 0;
    var minus = trSmooth ? (minusSmooth / trSmooth) * 100 : 0;
    var denominator = plus + minus;
    return {
      plus: plus,
      minus: minus,
      dx: denominator ? (Math.abs(plus - minus) / denominator) * 100 : 0
    };
  }

  /** Wilder ADX. The first ADX requires exactly 2 * period candles. */
  function adx(candles, period) {
    var empty = { adx: NaN, plus: NaN, minus: NaN };
    period = Math.floor(numberOr(period, 14));
    if (period < 1) throw new RangeError('ADX period must be at least 1');
    if (!Array.isArray(candles) || candles.length <= period) return empty;
    if (!candles.every(finiteCandle)) throw new TypeError('ADX candles require finite high, low and close');

    var trueRanges = [];
    var plusDm = [];
    var minusDm = [];
    for (var index = 1; index < candles.length; index += 1) {
      var candle = candles[index];
      var previous = candles[index - 1];
      var upMove = candle.high - previous.high;
      var downMove = previous.low - candle.low;
      trueRanges.push(Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - previous.close),
        Math.abs(candle.low - previous.close)
      ));
      plusDm.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDm.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    var trSmooth = trueRanges.slice(0, period).reduce(function (sum, value) { return sum + value; }, 0);
    var plusSmooth = plusDm.slice(0, period).reduce(function (sum, value) { return sum + value; }, 0);
    var minusSmooth = minusDm.slice(0, period).reduce(function (sum, value) { return sum + value; }, 0);
    var current = directionalIndex(trSmooth, plusSmooth, minusSmooth);
    var dxValues = [current.dx];

    for (index = period; index < trueRanges.length; index += 1) {
      trSmooth = trSmooth - (trSmooth / period) + trueRanges[index];
      plusSmooth = plusSmooth - (plusSmooth / period) + plusDm[index];
      minusSmooth = minusSmooth - (minusSmooth / period) + minusDm[index];
      current = directionalIndex(trSmooth, plusSmooth, minusSmooth);
      dxValues.push(current.dx);
    }

    if (dxValues.length < period) return { adx: NaN, plus: current.plus, minus: current.minus };
    var adxValue = average(dxValues.slice(0, period));
    for (index = period; index < dxValues.length; index += 1) {
      adxValue = ((adxValue * (period - 1)) + dxValues[index]) / period;
    }
    return { adx: adxValue, plus: current.plus, minus: current.minus };
  }

  function baseAsset(symbol) {
    return String(symbol || '').toUpperCase().replace(/USDT$/, '');
  }

  function resolveOptionsScope(symbol) {
    var asset = baseAsset(symbol);
    var nativeCurrencies = ['BTC', 'ETH', 'SOL'];
    var currency = nativeCurrencies.indexOf(asset) !== -1 ? asset : 'BTC';
    var isProxy = currency !== asset;
    return {
      asset: asset,
      currency: currency,
      isProxy: isProxy,
      scope: isProxy ? 'proxy_info' : 'symbol',
      eligibleForScore: !isProxy
    };
  }

  function bitcoinMempoolContext(symbol, fastestFee) {
    var asset = baseAsset(symbol);
    var fee = toFiniteNumber(fastestFee);
    var isProxy = asset !== 'BTC';
    var eligibleForScore = !isProxy && fee !== null;
    var score = eligibleForScore ? (fee > 80 ? -8 : fee < 20 ? 5 : 0) : 0;
    return {
      asset: asset,
      fastestFee: fee,
      isProxy: isProxy,
      scope: isProxy ? 'proxy_info' : 'symbol',
      eligibleForScore: eligibleForScore,
      score: score
    };
  }

  function createRequestGate() {
    var current = 0;
    return {
      begin: function () { current += 1; return current; },
      invalidate: function () { current += 1; return current; },
      isCurrent: function (requestId) { return requestId === current; },
      current: function () { return current; }
    };
  }

  function calculateDataConfidence(components) {
    var rows = Array.isArray(components) ? components : [];
    var totalWeight = 0;
    var coveredWeight = 0;
    rows.forEach(function (component) {
      var weight = nonNegative(component && component.weight);
      var quality = numberOr(component && component.quality, 0);
      quality = Math.max(0, Math.min(1, quality));
      totalWeight += weight;
      coveredWeight += weight * quality;
    });
    return totalWeight ? Math.round((coveredWeight / totalWeight) * 100) : 0;
  }

  function calculateCandleFlow(candles, cmfValue) {
    var source = Array.isArray(candles) ? candles : [];
    var window = source.slice(-40);
    var deltaRows = window.filter(function (candle) {
      return candle && isFiniteNumber(candle.volume) && isFiniteNumber(candle.takerBuy);
    });
    var coverage = window.length ? deltaRows.length / window.length : 0;
    var deltaEligible = coverage >= RULESET.flowMinCoverage && deltaRows.length > 0;
    var deltas = deltaRows.map(function (candle) {
      return candle.takerBuy - Math.max(0, candle.volume - candle.takerBuy);
    });
    var deltaSum = deltaEligible ? deltas.reduce(function (sum, value) { return sum + value; }, 0) : NaN;
    var priorVolumes = source.slice(-25, -1).map(function (candle) { return candle && candle.volume; }).filter(isFiniteNumber);
    var latest = source[source.length - 1];
    var lastVolume = latest && isFiniteNumber(latest.volume) ? latest.volume : NaN;
    var averageVolume = priorVolumes.length ? average(priorVolumes) : NaN;
    var cmf = toFiniteNumber(cmfValue);
    var score = 0;
    var available = false;
    if (isFiniteNumber(deltaSum)) {
      score += deltaSum > 0 ? 9 : deltaSum < 0 ? -9 : 0;
      available = true;
    }
    if (isFiniteNumber(lastVolume) && isFiniteNumber(averageVolume) && averageVolume > 0) {
      if (lastVolume > averageVolume * 1.35) score += 5;
      available = true;
    }
    if (cmf !== null) {
      score += cmf > 0.08 ? 4 : cmf < -0.08 ? -4 : 0;
      available = true;
    }
    return {
      available: available,
      score: score,
      coverage: coverage,
      deltaSum: deltaSum,
      averageVolume: averageVolume,
      lastVolume: lastVolume
    };
  }

  function classifyFreshness(fetchedAt, staleAfterMs, asOf, clockSkewToleranceMs) {
    var fetched = toFiniteNumber(fetchedAt);
    var ttl = toFiniteNumber(staleAfterMs);
    var now = toFiniteNumber(asOf);
    var tolerance = toFiniteNumber(clockSkewToleranceMs);
    if (now === null) now = Date.now();
    if (tolerance === null) tolerance = 60000;
    if (fetched === null) return { status: 'missing', ageMs: null, staleAfterMs: ttl, eligibleForScore: false };
    if (ttl === null || ttl < 0) return { status: 'invalid', ageMs: Math.max(0, now - fetched), staleAfterMs: ttl, eligibleForScore: false };
    var signedAge = now - fetched;
    if (signedAge < -tolerance) return { status: 'invalid', ageMs: signedAge, staleAfterMs: ttl, eligibleForScore: false };
    var ageMs = Math.max(0, signedAge);
    var status = ageMs <= ttl ? 'fresh' : 'stale';
    return { status: status, ageMs: ageMs, staleAfterMs: ttl, eligibleForScore: status === 'fresh' };
  }

  function filterFreshByTimestamp(rows, key, staleAfterMs, asOf) {
    return (Array.isArray(rows) ? rows : []).filter(function (row) {
      return classifyFreshness(row && row[key], staleAfterMs, asOf).eligibleForScore;
    });
  }

  function resolveDatasetFreshness(dataset, asOf) {
    if (!dataset) return { status: 'missing', ageMs: null, staleAfterMs: null, eligibleForScore: false };
    var freshness = classifyFreshness(dataset.observedAt, dataset.staleAfterMs, asOf);
    var storedStatus = dataset.dataStatus;
    var blockedByStatus = storedStatus === 'stale' || storedStatus === 'missing' || storedStatus === 'invalid' || storedStatus === 'error';
    var blockedByScope = dataset.eligibleForScore === false || dataset.eligibilityBlocked === true || dataset.scope === 'proxy_info';
    if (blockedByStatus) freshness.status = storedStatus;
    freshness.eligibleForScore = freshness.eligibleForScore && !blockedByStatus && !blockedByScope;
    if (blockedByScope && freshness.status === 'fresh') freshness.status = 'informational';
    return freshness;
  }

  function isDatasetMetricEligible(dataset, metricName, asOf) {
    if (!resolveDatasetFreshness(dataset, asOf).eligibleForScore) return false;
    var observedMap = dataset.metricObservedAt || {};
    var staleMap = dataset.metricStaleAfterMs || {};
    var observedAt = toFiniteNumber(observedMap[metricName]);
    var staleAfterMs = toFiniteNumber(staleMap[metricName]);
    if (observedAt === null) observedAt = toFiniteNumber(dataset.observedAt);
    if (staleAfterMs === null) staleAfterMs = toFiniteNumber(dataset.staleAfterMs);
    return classifyFreshness(observedAt, staleAfterMs, asOf).eligibleForScore;
  }

  function calculateDerivativeDetailContribution(input) {
    input = input || {};
    var asOf = toFiniteNumber(input.asOf);
    if (asOf === null) asOf = Date.now();
    var detail = resolveDatasetFreshness(input.detail, asOf).eligibleForScore ? input.detail : {};
    var options = resolveDatasetFreshness(input.options, asOf).eligibleForScore ? input.options : {};
    var close = toFiniteNumber(input.close);
    var vwap = toFiniteNumber(input.vwap);
    var score = 0;
    if (isFiniteNumber(detail.oiChangePct) && isDatasetMetricEligible(detail, 'oiChangePct', asOf)) {
      score += detail.oiChangePct > 4 && close !== null && vwap !== null && close > vwap ? 3
        : detail.oiChangePct > 4 && close !== null && vwap !== null && close < vwap ? -3
          : detail.oiChangePct < -6 ? -2 : 0;
    }
    if (isFiniteNumber(detail.takerRatio) && isDatasetMetricEligible(detail, 'takerRatio', asOf)) score += detail.takerRatio > 1.08 ? 3 : detail.takerRatio < 0.92 ? -3 : 0;
    if (isFiniteNumber(detail.longShortRatio) && isDatasetMetricEligible(detail, 'longShortRatio', asOf)) score += detail.longShortRatio > 1.7 ? -3 : detail.longShortRatio < 0.65 ? -2 : 0;
    if (isFiniteNumber(detail.topPositionRatio) && isDatasetMetricEligible(detail, 'topPositionRatio', asOf)) score += detail.topPositionRatio > 1.8 ? -2 : detail.topPositionRatio < 0.65 ? -1 : 0;
    if (isFiniteNumber(detail.fundingAvg) && isDatasetMetricEligible(detail, 'fundingAvg', asOf)) score += detail.fundingAvg > 0.0003 ? -2 : detail.fundingAvg < -0.0001 ? 1 : 0;
    if (options.market && isFiniteNumber(toFiniteNumber(options.market.putCallOi))) {
      score += +options.market.putCallOi > 1.35 ? -2 : +options.market.putCallOi < 0.7 ? 1 : 0;
    }
    if (options.dvol && isFiniteNumber(toFiniteNumber(options.dvol.change7d))) {
      score += +options.dvol.change7d > 12 ? -2 : +options.dvol.change7d < -12 ? 1 : 0;
    }
    return score;
  }

  /** Model ruleset registry: weights, caps and thresholds for 1.0.0-preview.2. */
  var RULESET = {
    modelId: 'crypto-live-desk-analytics',
    radarWeights: { technical: 30, flow: 15, derivatives: 10, fundamental: 15, macroNews: 10, history: 15, momentum24h: 5 },
    setupCaps: { technical: 20, multiTimeframe: 24, smartFlow: 18, derivatives: 12, chainFundamental: 10, newsMacro: 10, history: 12, risk: 10 },
    radarBias: { bull: 35, bear: -35 },
    newsRelevance: { assetSpecific: 1.35, macro: 0.75, crypto: 0.9, generic: 0.55 },
    flowMinCoverage: 0.5,
    netflowMinCoverageDays: 5,
    protocolMinTvl: 1000000,
    clockSkewToleranceMs: 60000
  };

  /** Deterministic FNV-1a hash of the ruleset; changes whenever rules change. */
  function rulesetHash(ruleset) {
    var text = JSON.stringify(ruleset === undefined ? RULESET : ruleset);
    var hash = 0x811c9dc5;
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = (hash * 0x01000193) >>> 0;
    }
    return ('0000000' + hash.toString(16)).slice(-8);
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Word-boundary matcher for keyword phrases; internal spaces match any whitespace. */
  function keywordPattern(phrase) {
    var body = String(phrase).trim().split(/\s+/).map(escapeRegExp).join('\\s+');
    return new RegExp('\\b' + body + '\\b', 'i');
  }

  /** Counts positive minus negative keyword hits using word boundaries. */
  function newsKeywordScore(text, positiveWords, negativeWords) {
    var value = String(text || '');
    var raw = 0;
    (positiveWords || []).forEach(function (word) { if (keywordPattern(word).test(value)) raw += 1; });
    (negativeWords || []).forEach(function (word) { if (keywordPattern(word).test(value)) raw -= 1; });
    return raw;
  }

  /**
   * Relevance of a news item for an asset. Tickers only match as an exact
   * uppercase token in the raw text (so "sui" never matches "lawsuit" and
   * "near"/"op" prose does not count); full asset names match case-insensitively.
   */
  function newsAssetRelevance(rawText, asset, assetName, type) {
    var relevance = type === 'macro' ? RULESET.newsRelevance.macro : RULESET.newsRelevance.generic;
    var raw = String(rawText || '');
    var ticker = String(asset || '').toUpperCase();
    var tickerHit = ticker && new RegExp('\\b' + escapeRegExp(ticker) + '\\b').test(raw);
    var nameHit = assetName && keywordPattern(assetName).test(raw);
    if (tickerHit || nameHit) return RULESET.newsRelevance.assetSpecific;
    if (/\b(bitcoin|crypto|etf)\b/i.test(raw)) return Math.max(relevance, RULESET.newsRelevance.crypto);
    return relevance;
  }

  /**
   * Picks a DeFiLlama protocol for an asset. An explicit mapping matches by
   * name regardless of TVL; fallback identity matches (gecko id, ticker,
   * asset name) additionally require a minimum TVL so homonymous $0-TVL
   * protocols never provide context.
   */
  function findProtocolMatch(protocols, explicitKeys, fallbackKeys, minTvl) {
    var rows = Array.isArray(protocols) ? protocols : [];
    var floor = numberOr(minTvl, RULESET.protocolMinTvl);
    var normalize = function (value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var keysOf = function (protocol) {
      return [protocol.slug, protocol.name, protocol.symbol, protocol.gecko_id].map(normalize);
    };
    var matchBy = function (keys, requireTvl) {
      var wanted = (keys || []).map(normalize).filter(Boolean);
      if (!wanted.length) return null;
      return rows.find(function (protocol) {
        if (requireTvl && !(numberOr(protocol && protocol.tvl, 0) >= floor)) return false;
        var protocolKeys = keysOf(protocol);
        return wanted.some(function (key) { return protocolKeys.indexOf(key) !== -1; });
      }) || null;
    };
    return matchBy(explicitKeys, false) || matchBy(fallbackKeys, true);
  }

  /** Ichimoku with the standard 26-period displacement for the current kumo. */
  function ichimokuState(candles) {
    var source = Array.isArray(candles) ? candles.filter(finiteCandle) : [];
    function midpointAt(period, endExclusive) {
      var start = endExclusive - period;
      if (start < 0) return NaN;
      var rows = source.slice(start, endExclusive);
      if (rows.length < period) return NaN;
      var high = -Infinity, low = Infinity;
      rows.forEach(function (candle) {
        if (candle.high > high) high = candle.high;
        if (candle.low < low) low = candle.low;
      });
      return (high + low) / 2;
    }
    var length = source.length;
    var conversion = midpointAt(9, length);
    var base = midpointAt(26, length);
    var displacedEnd = length - 26;
    var spanA = displacedEnd >= 0 ? (midpointAt(9, displacedEnd) + midpointAt(26, displacedEnd)) / 2 : NaN;
    var spanB = displacedEnd >= 0 ? midpointAt(52, displacedEnd) : NaN;
    var close = length ? source[length - 1].close : NaN;
    var cloudTop = Math.max(spanA, spanB);
    var cloudBottom = Math.min(spanA, spanB);
    var stateName = 'Nuvem';
    if (!isFiniteNumber(spanA) || !isFiniteNumber(spanB) || !isFiniteNumber(close)) stateName = 'Sem dados';
    else if (close > cloudTop && conversion > base) stateName = 'Alta';
    else if (close < cloudBottom && conversion < base) stateName = 'Baixa';
    return { conversion: conversion, base: base, spanA: spanA, spanB: spanB, state: stateName };
  }

  /**
   * Resolves the observation timestamp for freshness checks. Future
   * timestamps beyond the skew tolerance clamp to fetchedAt so a clock
   * difference can never mark live data invalid; missing timestamps fall
   * back to fetchedAt with provenance 'fetched'.
   */
  function resolveObservedAt(dataTimestamp, fetchedAt, maxSkewMs) {
    var fetched = toFiniteNumber(fetchedAt);
    var data = toFiniteNumber(dataTimestamp);
    var skew = numberOr(maxSkewMs, RULESET.clockSkewToleranceMs);
    if (fetched === null) fetched = data;
    if (data === null) return { observedAt: fetched, provenance: 'fetched' };
    if (fetched !== null && data > fetched + skew) return { observedAt: fetched, provenance: 'clamped' };
    return { observedAt: data, provenance: 'data' };
  }

  /**
   * Aggregates weighted radar parts. With no available weight the result is
   * null/unavailable instead of a fabricated neutral zero. Data confidence is
   * graded: each part contributes weight x quality (0-1), not a binary flag.
   */
  function aggregateRadarParts(parts) {
    var rows = Array.isArray(parts) ? parts : [];
    var availableRows = rows.filter(function (part) { return part && part.available === true && isFiniteNumber(part.value); });
    var availableWeight = availableRows.reduce(function (sum, part) { return sum + nonNegative(part.weight); }, 0);
    var confidenceComponents = rows.map(function (part) {
      var quality = part && part.available === true ? Math.max(0, Math.min(1, numberOr(part.quality, 1))) : 0;
      return { weight: nonNegative(part && part.weight), quality: quality };
    });
    var dataConfidence = calculateDataConfidence(confidenceComponents);
    if (!availableWeight) {
      return { score: null, bias: 'Indisponivel', availableWeight: 0, dataConfidence: 0, dataStatus: 'unavailable', contributions: rows.map(function (part) { return { name: part && part.name, contribution: 0, available: false }; }) };
    }
    var rawScore = availableRows.reduce(function (sum, part) { return sum + part.value * part.weight; }, 0) / availableWeight;
    var score = Math.round(Math.max(-100, Math.min(100, rawScore)));
    var contributions = rows.map(function (part) {
      var available = part && part.available === true && isFiniteNumber(part.value);
      return {
        name: part && part.name,
        available: available,
        contribution: available ? (part.value * part.weight) / availableWeight : 0
      };
    });
    var totalWeight = rows.reduce(function (sum, part) { return sum + nonNegative(part && part.weight); }, 0);
    var dataStatus = dataConfidence < 40 ? 'insufficient' : availableWeight >= totalWeight ? 'complete' : 'partial';
    return { score: score, rawScore: rawScore, bias: score >= RULESET.radarBias.bull ? 'Comprador' : score <= RULESET.radarBias.bear ? 'Vendedor' : 'Neutro', availableWeight: availableWeight, dataConfidence: dataConfidence, dataStatus: dataStatus, contributions: contributions };
  }

  /** Pairs two candle arrays by timestamp and returns aligned close returns. */
  function alignedReturns(candlesA, candlesB, timeKey) {
    var key = timeKey || 'time';
    var mapB = {};
    (Array.isArray(candlesB) ? candlesB : []).forEach(function (candle) {
      if (candle && isFiniteNumber(toFiniteNumber(candle.close))) mapB[candle[key]] = +candle.close;
    });
    var pairs = [];
    (Array.isArray(candlesA) ? candlesA : []).forEach(function (candle) {
      if (candle && isFiniteNumber(toFiniteNumber(candle.close)) && mapB[candle[key]] !== undefined) {
        pairs.push([+candle.close, mapB[candle[key]]]);
      }
    });
    var returnsA = [], returnsB = [];
    for (var index = 1; index < pairs.length; index += 1) {
      if (pairs[index - 1][0] > 0 && pairs[index - 1][1] > 0) {
        returnsA.push(pairs[index][0] / pairs[index - 1][0] - 1);
        returnsB.push(pairs[index][1] / pairs[index - 1][1] - 1);
      }
    }
    return { returnsA: returnsA, returnsB: returnsB, samples: returnsA.length };
  }

  function pearsonCorrelation(seriesA, seriesB) {
    var length = Math.min(seriesA ? seriesA.length : 0, seriesB ? seriesB.length : 0);
    if (length < 3) return NaN;
    var meanA = average(seriesA.slice(0, length));
    var meanB = average(seriesB.slice(0, length));
    var covariance = 0, varianceA = 0, varianceB = 0;
    for (var index = 0; index < length; index += 1) {
      var deltaA = seriesA[index] - meanA;
      var deltaB = seriesB[index] - meanB;
      covariance += deltaA * deltaB;
      varianceA += deltaA * deltaA;
      varianceB += deltaB * deltaB;
    }
    var denominator = Math.sqrt(varianceA * varianceB);
    return denominator ? covariance / denominator : NaN;
  }

  function betaCoefficient(assetReturns, benchmarkReturns) {
    var length = Math.min(assetReturns ? assetReturns.length : 0, benchmarkReturns ? benchmarkReturns.length : 0);
    if (length < 3) return NaN;
    var meanAsset = average(assetReturns.slice(0, length));
    var meanBench = average(benchmarkReturns.slice(0, length));
    var covariance = 0, varianceBench = 0;
    for (var index = 0; index < length; index += 1) {
      covariance += (assetReturns[index] - meanAsset) * (benchmarkReturns[index] - meanBench);
      varianceBench += Math.pow(benchmarkReturns[index] - meanBench, 2);
    }
    return varianceBench ? covariance / varianceBench : NaN;
  }

  /** Cumulative return difference (asset minus benchmark) over the last N aligned periods. */
  function relativeStrength(assetReturns, benchmarkReturns, periods) {
    var span = Math.floor(numberOr(periods, 20));
    var length = Math.min(assetReturns ? assetReturns.length : 0, benchmarkReturns ? benchmarkReturns.length : 0);
    if (length < span || span < 1) return NaN;
    var accumulate = function (rows) {
      return rows.slice(rows.length - span).reduce(function (total, value) { return total * (1 + value); }, 1) - 1;
    };
    return (accumulate(assetReturns) - accumulate(benchmarkReturns)) * 100;
  }

  /** A signal is recorded once per confirmed closed candle per symbol+interval. */
  function shouldRecordSignal(lastRecord, candidate) {
    if (!candidate || !isFiniteNumber(toFiniteNumber(candidate.signalCloseTime))) return false;
    if (!lastRecord) return true;
    return lastRecord.symbol !== candidate.symbol
      || lastRecord.interval !== candidate.interval
      || lastRecord.signalCloseTime !== candidate.signalCloseTime;
  }

  /** Price outcomes at fixed horizons after the signal candle close. */
  function evaluateSignalOutcome(record, candles) {
    var basePrice = toFiniteNumber(record && record.price);
    var baseTime = toFiniteNumber(record && record.signalCloseTime);
    if (basePrice === null || basePrice <= 0 || baseTime === null) return null;
    var horizons = { r1h: 3600000, r24h: 86400000, r7d: 604800000 };
    var rows = (Array.isArray(candles) ? candles : []).filter(function (candle) {
      return candle && isFiniteNumber(toFiniteNumber(candle.closeTime)) && isFiniteNumber(toFiniteNumber(candle.close));
    });
    var outcome = {};
    Object.keys(horizons).forEach(function (name) {
      var target = baseTime + horizons[name];
      var match = null;
      rows.forEach(function (candle) {
        if (candle.closeTime >= target && (match === null || candle.closeTime < match.closeTime)) match = candle;
      });
      outcome[name] = match ? ((+match.close - basePrice) / basePrice) * 100 : null;
    });
    return outcome;
  }

  /** Aggregates journal hit-rates per score band; a hit is a positive 24h return for positive scores and vice versa. */
  function summarizeSignalJournal(records) {
    var bands = [
      { name: '>= +60', min: 60, max: 101 },
      { name: '+42 a +59', min: 42, max: 60 },
      { name: '+20 a +41', min: 20, max: 42 },
      { name: '-19 a +19', min: -19, max: 20 },
      { name: '<= -20', min: -101, max: -19 }
    ];
    return bands.map(function (band) {
      var rows = (Array.isArray(records) ? records : []).filter(function (record) {
        var score = toFiniteNumber(record && record.setupScore);
        return score !== null && score >= band.min && score < band.max;
      });
      var evaluated = rows.filter(function (record) { return record.outcome && isFiniteNumber(toFiniteNumber(record.outcome.r24h)); });
      var hits = evaluated.filter(function (record) {
        var score = +record.setupScore;
        var result = +record.outcome.r24h;
        return score >= 20 ? result > 0 : score <= -20 ? result < 0 : Math.abs(result) < 1.5;
      });
      return {
        band: band.name,
        total: rows.length,
        evaluated: evaluated.length,
        hits: hits.length,
        hitRate: evaluated.length ? (hits.length / evaluated.length) * 100 : null,
        median24h: evaluated.length ? median(evaluated.map(function (record) { return +record.outcome.r24h; })) : null
      };
    });
  }

  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    if (!sorted.length) return NaN;
    var middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  /**
   * Alert rules fire only on state TRANSITIONS between two evaluations,
   * never on level, so a persistent condition alerts once.
   */
  function evaluateAlertTransitions(previous, current, config) {
    var rules = config || {};
    var alerts = [];
    if (!previous || !current || previous.symbol !== current.symbol) return alerts;
    var prevScore = toFiniteNumber(previous.setupScore);
    var currScore = toFiniteNumber(current.setupScore);
    if (rules.scoreCross !== false && prevScore !== null && currScore !== null) {
      [{ level: 60, label: 'entrada favoravel' }, { level: 42, label: 'entrada com confirmacao' }, { level: -45, label: 'venda domina' }].forEach(function (threshold) {
        var crossedUp = prevScore < threshold.level && currScore >= threshold.level && threshold.level > 0;
        var crossedDown = prevScore > threshold.level && currScore <= threshold.level && threshold.level < 0;
        if (crossedUp || crossedDown) alerts.push({ id: 'score-' + threshold.level, message: current.symbol + ': Setup Score cruzou ' + (threshold.level > 0 ? '+' : '') + threshold.level + ' (' + threshold.label + ') em ' + currScore });
      });
    }
    if (rules.biasChange !== false && previous.bias && current.bias && previous.bias !== current.bias) {
      alerts.push({ id: 'bias', message: current.symbol + ': vies do radar mudou de ' + previous.bias + ' para ' + current.bias });
    }
    if (rules.regimeChange !== false && previous.regime && current.regime && previous.regime !== current.regime) {
      alerts.push({ id: 'regime', message: current.symbol + ': regime mudou de ' + previous.regime + ' para ' + current.regime });
    }
    var prevFunding = toFiniteNumber(previous.funding);
    var currFunding = toFiniteNumber(current.funding);
    var fundingLimit = numberOr(rules.fundingLimit, 0.0005);
    if (rules.fundingExtreme !== false && prevFunding !== null && currFunding !== null) {
      if (Math.abs(prevFunding) < fundingLimit && Math.abs(currFunding) >= fundingLimit) {
        alerts.push({ id: 'funding', message: current.symbol + ': funding extremo ' + (currFunding * 100).toFixed(4) + '%' });
      }
    }
    var prevLiq = numberOr(previous.liquidation15m, 0);
    var currLiq = numberOr(current.liquidation15m, 0);
    var liqLimit = numberOr(rules.liquidationLimit, 2000000);
    if (rules.liquidationSpike !== false && prevLiq < liqLimit && currLiq >= liqLimit) {
      alerts.push({ id: 'liquidation', message: current.symbol + ': pico de liquidacoes em 15m (US$ ' + Math.round(currLiq / 1e6) + 'M)' });
    }
    return alerts;
  }

  /** Assembles the exportable analytic snapshot from already-computed results. */
  function buildAnalyticsExport(input) {
    input = input || {};
    var snapshot = input.snapshot || {};
    var confluence = input.confluence || null;
    var radar = input.radar || null;
    return {
      exportedAt: numberOr(input.exportedAt, null),
      modelId: RULESET.modelId,
      modelVersion: input.modelVersion || snapshot.modelVersion || null,
      rulesetHash: input.rulesetHash || snapshot.rulesetHash || null,
      symbol: snapshot.symbol || input.symbol || null,
      interval: snapshot.interval || input.interval || null,
      inputSnapshotId: snapshot.inputSnapshotId || null,
      calculatedAt: snapshot.calculatedAt || null,
      revision: snapshot.revision || null,
      signalCloseTime: snapshot.signalCloseTime || null,
      setup: confluence ? {
        score: confluence.total,
        decision: confluence.decision,
        dataConfidence: confluence.dataConfidence,
        dataStatus: confluence.dataStatus,
        components: (confluence.components || []).map(function (component) {
          return {
            name: component.name,
            ruleId: component.ruleId,
            contribution: component.contribution,
            cap: component.max,
            status: component.status,
            scope: component.scope,
            isProxy: component.isProxy,
            sources: component.sources,
            reason: component.reason
          };
        })
      } : null,
      radar: radar ? {
        score: radar.score,
        bias: radar.bias,
        dataConfidence: radar.dataConfidence,
        dataStatus: radar.dataStatus,
        components: (radar.components || []).map(function (part) {
          return { name: part.name, ruleId: part.ruleId, contribution: part.contribution, weight: part.weight, quality: part.quality, status: part.status, scope: part.scope, reason: part.reason };
        })
      } : null,
      datasets: input.datasets || null,
      disclaimer: 'Scores medem confluencia direcional e cobertura de dados; nao representam probabilidade nem recomendacao.'
    };
  }

  var api = {
    RULESET: RULESET,
    adx: adx,
    alignedReturns: alignedReturns,
    betaCoefficient: betaCoefficient,
    buildAnalyticsExport: buildAnalyticsExport,
    evaluateAlertTransitions: evaluateAlertTransitions,
    evaluateSignalOutcome: evaluateSignalOutcome,
    pearsonCorrelation: pearsonCorrelation,
    relativeStrength: relativeStrength,
    shouldRecordSignal: shouldRecordSignal,
    summarizeSignalJournal: summarizeSignalJournal,
    aggregateRadarParts: aggregateRadarParts,
    bitcoinMempoolContext: bitcoinMempoolContext,
    escapeRegExp: escapeRegExp,
    findProtocolMatch: findProtocolMatch,
    ichimokuState: ichimokuState,
    keywordPattern: keywordPattern,
    newsAssetRelevance: newsAssetRelevance,
    newsKeywordScore: newsKeywordScore,
    resolveObservedAt: resolveObservedAt,
    rulesetHash: rulesetHash,
    calculateCandleFlow: calculateCandleFlow,
    calculateDataConfidence: calculateDataConfidence,
    calculateDerivativeDetailContribution: calculateDerivativeDetailContribution,
    classifyFreshness: classifyFreshness,
    resolveDatasetFreshness: resolveDatasetFreshness,
    calculatePosition: calculatePosition,
    createRequestGate: createRequestGate,
    filterFreshByTimestamp: filterFreshByTimestamp,
    isCandleClosed: isCandleClosed,
    isDatasetMetricEligible: isDatasetMetricEligible,
    normalizeKlines: normalizeKlines,
    normalizeTradFiChart: normalizeTradFiChart,
    normalizeTradFiRows: normalizeTradFiRows,
    percentageChange: percentageChange,
    rsi: rsi,
    rsiSeries: rsiSeries,
    resolveOptionsScope: resolveOptionsScope,
    selectClosedCandles: selectClosedCandles,
    toFiniteNumber: toFiniteNumber
  };

  return typeof Object.freeze === 'function' ? Object.freeze(api) : api;
}));
