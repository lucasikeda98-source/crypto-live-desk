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
    var deltaRows = source.slice(-40).filter(function (candle) {
      return candle && isFiniteNumber(candle.volume) && isFiniteNumber(candle.takerBuy);
    });
    var deltas = deltaRows.map(function (candle) {
      return candle.takerBuy - Math.max(0, candle.volume - candle.takerBuy);
    });
    var deltaSum = deltas.length ? deltas.reduce(function (sum, value) { return sum + value; }, 0) : NaN;
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

  var api = {
    adx: adx,
    bitcoinMempoolContext: bitcoinMempoolContext,
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
