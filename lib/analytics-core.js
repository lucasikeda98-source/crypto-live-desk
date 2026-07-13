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

  /**
   * Magnitude-aware USD price formatting. Prices >= $1 use 2 decimals; sub-$1 prices (many alts /
   * low-cap tokens) use significant digits so e.g. $0.0000234 doesn't collapse to $0.
   */
  function formatUsd(value, significant) {
    var n = toFiniteNumber(value);
    if (n === null) return '--';
    if (Math.abs(n) < 1e-9) n = 0;
    var sig = numberOr(significant, 4);
    var abs = Math.abs(n);
    var formatter = abs !== 0 && abs < 1
      ? new Intl.NumberFormat('en-US', { maximumSignificantDigits: sig })
      : new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    return '$' + formatter.format(n);
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

  /** Classify an HTTP status for retry policy: rate limit (429/418) must never trigger host fallback. */
  function classifyHttpError(status) {
    var code = Number(status);
    if (code === 429 || code === 418) return 'rateLimit';
    if (code >= 500 && code <= 599) return 'server';
    if (code >= 400 && code <= 499) return 'client';
    return 'ok';
  }

  /** Retry-After header (delta-seconds or HTTP-date) -> milliseconds, never negative. */
  function parseRetryAfter(value, now) {
    if (value === null || value === undefined || value === '') return 0;
    var reference = toFiniteNumber(now);
    if (reference === null) reference = Date.now();
    var seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    var when = Date.parse(value);
    if (Number.isFinite(when)) return Math.max(0, when - reference);
    return 0;
  }

  /**
   * Per-source circuit breaker with exponential backoff. On a rate-limit strike a source is
   * blocked until now + max(exponential backoff, Retry-After); success resets the streak.
   */
  function createSourceThrottle(options) {
    options = options || {};
    var baseCooldownMs = numberOr(options.baseCooldownMs, 1000);
    var maxCooldownMs = numberOr(options.maxCooldownMs, 120000);
    var sources = {};
    function entry(source) {
      var key = source || 'default';
      if (!sources[key]) sources[key] = { blockedUntil: 0, strikes: 0 };
      return sources[key];
    }
    return {
      retryAt: function (source) { return entry(source).blockedUntil; },
      isBlocked: function (source, now) {
        var reference = toFiniteNumber(now);
        if (reference === null) reference = Date.now();
        return entry(source).blockedUntil > reference;
      },
      penalize: function (source, retryAfterMs, now) {
        var reference = toFiniteNumber(now);
        if (reference === null) reference = Date.now();
        var e = entry(source);
        e.strikes += 1;
        var backoff = Math.min(maxCooldownMs, baseCooldownMs * Math.pow(2, e.strikes - 1));
        var wait = Math.max(backoff, nonNegative(retryAfterMs));
        e.blockedUntil = reference + wait;
        return wait;
      },
      succeed: function (source) { var e = entry(source); e.strikes = 0; e.blockedUntil = 0; }
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

  /**
   * Funding contribution (contrarian, Binance mechanics).
   * Funding is the perpetual rate per settlement period (decimal, e.g. 0.0001 = 0,01%/8h).
   * Binance neutral baseline is ~+0,01%/8h, so the neutral band is asymmetric [-0,01%, +0,03%].
   * Extremes are contrarian: heavy longs (funding high) = squeeze risk; heavy shorts (funding
   * negative) = short-squeeze fuel. Monotonic non-increasing in funding.
   */
  function calculateFundingContribution(funding) {
    var value = toFiniteNumber(funding);
    if (value === null) return 0;
    if (value > 0.0005) return -6;   // > +0,05%/8h: longs sobrecomprados, risco de long squeeze
    if (value > 0.0003) return -2;   // +0,03% a +0,05%: elevado, cautela
    if (value >= -0.0001) return 0;  // -0,01% a +0,03%: normal em bull / equilibrio
    if (value >= -0.0005) return 2;  // -0,01% a -0,05%: shorts dominantes, combustivel de squeeze
    return 4;                        // < -0,05%: shorts lotados extremo
  }

  /**
   * Multi-timeframe aggregation. Weighted average of per-TF scores (score/50, higher TFs weigh
   * more), scaled to the +/-24 setup cap. Alignment counts ONLY the timeframes aligned WITH the
   * tentative bias direction — max(positive, negative) was direction-blind and could report the
   * OPPOSITE majority as confirmation exactly at trend turns.
   */
  var MTF_WEIGHTS = { '1s': 0.02, '1m': 0.04, '3m': 0.05, '5m': 0.06, '15m': 0.10, '30m': 0.12, '1h': 0.16, '2h': 0.18, '4h': 0.22, '6h': 0.23, '8h': 0.24, '12h': 0.25, '1d': 0.28, '3d': 0.30, '1w': 0.34, '1M': 0.36 };
  function aggregateMultiTimeframe(rows) {
    var list = Array.isArray(rows) ? rows : [];
    var weighted = 0, weightTotal = 0, positive = 0, negative = 0;
    list.forEach(function (row) {
      var weight = MTF_WEIGHTS[row.interval] || 0.1;
      weighted += (numberOr(row.score, 0) / 50) * weight;
      weightTotal += weight;
      if (row.score >= 12) positive++; else if (row.score <= -12) negative++;
    });
    var normalized = weightTotal ? weighted / weightTotal : 0;
    var tentative = normalized >= 0.18 ? 'Alta' : normalized <= -0.18 ? 'Baixa' : 'Misto';
    var aligned = tentative === 'Alta' ? positive : tentative === 'Baixa' ? negative : Math.max(positive, negative);
    var alignment = list.length ? aligned / list.length : 0;
    var bias = tentative !== 'Misto' && alignment >= 0.5 ? tentative : 'Misto';
    var cap = RULESET.setupCaps.multiTimeframe;
    var score = Math.round(Math.max(-cap, Math.min(cap, normalized * cap)));
    return { raw: normalized, score: score, alignment: alignment, positive: positive, negative: negative, bias: bias };
  }

  /**
   * Percentile rank (midrank: strictly-below + half the ties) of a value within its own history,
   * 0-100. Midrank is essential here: exchange metrics quantize and pin (funding stuck at the
   * 0.0001 baseline for weeks), and a <=-count would read a value equal to the mode as p~100 —
   * maximum-extreme for perfectly typical data. Returns null when the series is shorter than
   * minSamples (default 30) so callers fall back to fixed thresholds instead of noise.
   */
  function percentileRank(series, value, minSamples) {
    var rows = Array.isArray(series) ? series.filter(isFiniteNumber) : [];
    var v = toFiniteNumber(value);
    var min = numberOr(minSamples, 30);
    if (v === null || rows.length < min) return null;
    var below = 0, equal = 0;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i] < v) below++;
      else if (rows[i] === v) equal++;
    }
    return ((below + equal / 2) / rows.length) * 100;
  }

  /**
   * Extreme-percentile contribution. Only the tails score (p>90 crowded, p<10 depleted) and the
   * magnitude ramps CONTINUOUSLY from 0 at the tail threshold to maxScore at the extreme —
   * a step at p=90 would flap the score by ~0.8*max as a metric oscillates around the cutoff.
   * follow=false reads the metric contrarian (positioning: crowded = against), follow=true reads
   * it with the flow (smart money / aggressive taker).
   */
  function percentileExtremeContribution(p, maxScore, follow) {
    var value = toFiniteNumber(p);
    if (value === null) return 0;
    var max = nonNegative(maxScore);
    if (value > 90) {
      var upper = max * (value - 90) / 10;
      return follow ? upper : -upper;
    }
    if (value < 10) {
      var lower = max * (10 - value) / 10;
      return follow ? -lower : lower;
    }
    return 0;
  }

  /** Weighted median: sorts by value and returns the first value whose cumulative weight crosses half. */
  function weightedMedian(values, weights) {
    var rows = [];
    var list = Array.isArray(values) ? values : [];
    var weightList = Array.isArray(weights) ? weights : [];
    for (var i = 0; i < list.length; i++) {
      var value = toFiniteNumber(list[i]);
      var weight = nonNegative(weightList[i]);
      if (value !== null && weight > 0) rows.push({ value: value, weight: weight });
    }
    if (!rows.length) return NaN;
    rows.sort(function (a, b) { return a.value - b.value; });
    var total = rows.reduce(function (sum, row) { return sum + row.weight; }, 0);
    var cumulative = 0;
    for (var j = 0; j < rows.length; j++) {
      cumulative += rows[j].weight;
      if (cumulative >= total / 2) return rows[j].value;
    }
    return rows[rows.length - 1].value;
  }

  /** On-balance volume as a series aligned to the candles (the app only kept the last value). */
  function obvSeries(candles) {
    var rows = Array.isArray(candles) ? candles : [];
    var out = [];
    var total = 0;
    for (var i = 0; i < rows.length; i++) {
      if (i > 0) {
        var current = toFiniteNumber(rows[i].close);
        var prior = toFiniteNumber(rows[i - 1].close);
        var volume = numberOr(rows[i].volume, 0);
        if (current !== null && prior !== null) {
          if (current > prior) total += volume;
          else if (current < prior) total -= volume;
        }
      }
      out.push(total);
    }
    return out;
  }

  /**
   * CHoCH/BOS from confirmed pivots. In an uptrend (HH/HL) a close through the last confirmed
   * higher-low flips structure (CHoCH, -6) while a close above the last pivot high is trend
   * continuation (BOS, +4); mirrored in a downtrend. Pivots are only "confirmed" two bars after
   * they print (pivot detection needs two future bars), so a close at bar j may only react to
   * pivots with time <= candles[j-2].time — no look-ahead. Scans the last 5 closes and reports
   * the most recent crossing (close beyond the level with the prior close still inside).
   */
  function detectStructureShift(candles, pivotHighs, pivotLows) {
    var rows = Array.isArray(candles) ? candles : [];
    var highs = Array.isArray(pivotHighs) ? pivotHighs : [];
    var lows = Array.isArray(pivotLows) ? pivotLows : [];
    var none = { event: null, direction: null, score: 0, brokenLevel: null, barsAgo: null };
    if (rows.length < 5 || highs.length < 2 || lows.length < 2) return none;
    function lastTwoConfirmed(pivotList, asOfTime) {
      var confirmed = [];
      for (var i = pivotList.length - 1; i >= 0 && confirmed.length < 2; i--) {
        if (pivotList[i].time <= asOfTime) confirmed.unshift(pivotList[i]);
      }
      return confirmed.length === 2 ? confirmed : null;
    }
    var maxLookback = Math.min(5, rows.length - 2);
    for (var back = 0; back < maxLookback; back++) {
      var j = rows.length - 1 - back;
      if (j < 2) break;
      var confirmTime = rows[j - 2].time;
      var close = toFiniteNumber(rows[j].close);
      var prevClose = toFiniteNumber(rows[j - 1].close);
      if (close === null || prevClose === null) continue;
      // The trend is classified with the pivots CONFIRMED AS OF the scanned bar. Using the final
      // pivot array would let the pivot printed BY the break itself flip the trend label two bars
      // later and retroactively suppress (or re-grade) the very CHoCH being reported.
      var confirmedHighs = lastTwoConfirmed(highs, confirmTime);
      var confirmedLows = lastTwoConfirmed(lows, confirmTime);
      if (!confirmedHighs || !confirmedLows) continue;
      var uptrend = confirmedHighs[1].price > confirmedHighs[0].price && confirmedLows[1].price > confirmedLows[0].price;
      var downtrend = confirmedHighs[1].price < confirmedHighs[0].price && confirmedLows[1].price < confirmedLows[0].price;
      if (!uptrend && !downtrend) continue;
      var supportPivot = confirmedLows[1];
      var resistancePivot = confirmedHighs[1];
      if (uptrend && close < supportPivot.price && prevClose >= supportPivot.price) {
        return { event: 'CHoCH', direction: 'bear', score: -6, brokenLevel: supportPivot.price, barsAgo: back };
      }
      if (uptrend && close > resistancePivot.price && prevClose <= resistancePivot.price) {
        return { event: 'BOS', direction: 'bull', score: 4, brokenLevel: resistancePivot.price, barsAgo: back };
      }
      if (downtrend && close > resistancePivot.price && prevClose <= resistancePivot.price) {
        return { event: 'CHoCH', direction: 'bull', score: 6, brokenLevel: resistancePivot.price, barsAgo: back };
      }
      if (downtrend && close < supportPivot.price && prevClose >= supportPivot.price) {
        return { event: 'BOS', direction: 'bear', score: -4, brokenLevel: supportPivot.price, barsAgo: back };
      }
    }
    return none;
  }

  /**
   * Divergence between price and an indicator on the last two pivots: price higher-high with
   * indicator lower-high = bearish; price lower-low with indicator higher-low = bullish.
   * The indicator series must be aligned to the candles by index; pivots map via their time.
   */
  function detectDivergence(candles, indicatorSeries, pivotHighs, pivotLows) {
    var rows = Array.isArray(candles) ? candles : [];
    var indicator = Array.isArray(indicatorSeries) ? indicatorSeries : [];
    function indexOfTime(time) {
      for (var i = rows.length - 1; i >= 0; i--) if (rows[i].time === time) return i;
      return -1;
    }
    function pair(pivotList) {
      var list = Array.isArray(pivotList) ? pivotList.slice(-2) : [];
      if (list.length < 2) return null;
      var i1 = indexOfTime(list[0].time);
      var i2 = indexOfTime(list[1].time);
      if (i1 < 0 || i2 < 0) return null;
      var v1 = toFiniteNumber(indicator[i1]);
      var v2 = toFiniteNumber(indicator[i2]);
      if (v1 === null || v2 === null) return null;
      return { p1: list[0].price, p2: list[1].price, v1: v1, v2: v2 };
    }
    var highPair = pair(pivotHighs);
    var lowPair = pair(pivotLows);
    return {
      bearish: !!(highPair && highPair.p2 > highPair.p1 && highPair.v2 < highPair.v1),
      bullish: !!(lowPair && lowPair.p2 < lowPair.p1 && lowPair.v2 > lowPair.v1)
    };
  }

  /**
   * Volume climax: last closed bar with volume above mean+3sigma of the prior 60 bars, range
   * above 2x ATR, closing in the OPPOSITE third of its range after an extended leg (>2x ATR over
   * ~10 bars). That combination is exhaustion — a warning against the trend, not confirmation.
   */
  function detectVolumeClimax(candles, atrValue) {
    var rows = Array.isArray(candles) ? candles : [];
    var atr = toFiniteNumber(atrValue);
    var none = { climax: false, direction: null };
    if (rows.length < 40 || atr === null || atr <= 0) return none;
    var lastBar = rows[rows.length - 1];
    var history = rows.slice(-61, -1);
    var volumes = history.map(function (row) { return numberOr(row.volume, 0); });
    var mean = volumes.reduce(function (total, value) { return total + value; }, 0) / volumes.length;
    var variance = volumes.reduce(function (total, value) { return total + Math.pow(value - mean, 2); }, 0) / volumes.length;
    var sigma = Math.sqrt(variance);
    var lastVolume = numberOr(lastBar.volume, 0);
    // Both conditions: 3-sigma AND 1.5x the mean. With a flat volume history sigma degenerates
    // to 0 and "mean + 3*sigma" alone would flag a +0.01% volume tick as a climax.
    if (!(lastVolume > mean + 3 * sigma) || !(lastVolume > mean * 1.5)) return none;
    var range = numberOr(lastBar.high, 0) - numberOr(lastBar.low, 0);
    if (!(range > 2 * atr)) return none;
    var prevClose = toFiniteNumber(rows[rows.length - 2] && rows[rows.length - 2].close);
    var legStartRow = rows[rows.length - 12];
    var legStart = toFiniteNumber(legStartRow && legStartRow.close);
    if (prevClose === null || legStart === null) return none;
    var leg = prevClose - legStart;
    if (Math.abs(leg) < 2 * atr) return none;
    var position = range > 0 ? (numberOr(lastBar.close, 0) - numberOr(lastBar.low, 0)) / range : 0.5;
    if (leg > 0 && position <= 1 / 3) return { climax: true, direction: 'exhaustion-top' };
    if (leg < 0 && position >= 2 / 3) return { climax: true, direction: 'exhaustion-bottom' };
    return none;
  }

  /**
   * TTM-style squeeze: Bollinger(20,2) fully inside Keltner(20, 2xATR) with the BB bandwidth in
   * the bottom quintile of its own trailing history = compression armed. Release = squeeze turned
   * off within the last 6 bars; direction comes from the release bar's body and only SCORES when
   * the aggregate taker delta agrees (an unconfirmed release is a flag, not a signal).
   */
  function detectSqueeze(candles, options) {
    options = options || {};
    var rows = Array.isArray(candles) ? candles : [];
    var none = { on: false, released: null, score: 0, bandwidthPercentile: null };
    var period = 20;
    if (rows.length < period + 30) return none;
    // Only the last ~170 bars matter (20 warmup + 120 bandwidth trailing + release scan);
    // computing the full history is wasted work on long series.
    if (rows.length > 170) rows = rows.slice(-170);
    var closes = rows.map(function (row) { return numberOr(row.close, 0); });
    // Per-bar SMA/stdev (BB), EMA + mean true range (Keltner) and bandwidth series.
    var emaValue = null;
    var emaK = 2 / (period + 1);
    var squeezeOn = [];
    var bandwidths = [];
    for (var i = 0; i < rows.length; i++) {
      emaValue = emaValue === null ? closes[i] : closes[i] * emaK + emaValue * (1 - emaK);
      if (i < period) { squeezeOn.push(false); bandwidths.push(null); continue; }
      var window = closes.slice(i - period + 1, i + 1);
      var mean = window.reduce(function (total, value) { return total + value; }, 0) / period;
      var variance = window.reduce(function (total, value) { return total + Math.pow(value - mean, 2); }, 0) / period;
      var sd = Math.sqrt(variance);
      var bbUpper = mean + 2 * sd;
      var bbLower = mean - 2 * sd;
      var trSum = 0;
      for (var t = i - period + 1; t <= i; t++) {
        var high = numberOr(rows[t].high, closes[t]);
        var low = numberOr(rows[t].low, closes[t]);
        var prevClose = t > 0 ? closes[t - 1] : closes[t];
        trSum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      }
      var atrMean = trSum / period;
      var kcUpper = emaValue + 2 * atrMean;
      var kcLower = emaValue - 2 * atrMean;
      var bandwidth = mean ? ((bbUpper - bbLower) / mean) * 100 : null;
      bandwidths.push(bandwidth);
      var trailing = bandwidths.slice(Math.max(0, i - 119), i + 1).filter(isFiniteNumber);
      var bwPercentile = percentileRank(trailing, bandwidth, 30);
      squeezeOn.push(bbUpper < kcUpper && bbLower > kcLower && bwPercentile !== null && bwPercentile < 20);
    }
    var lastIndex = rows.length - 1;
    var lastBandwidthPercentile = percentileRank(bandwidths.slice(Math.max(0, lastIndex - 119)).filter(isFiniteNumber), bandwidths[lastIndex], 30);
    if (squeezeOn[lastIndex]) return { on: true, released: null, score: 0, bandwidthPercentile: lastBandwidthPercentile };
    // Look for the most recent on->off transition within the last 6 bars.
    for (var back = 1; back <= 6 && lastIndex - back >= 0; back++) {
      if (squeezeOn[lastIndex - back]) {
        var releaseBar = rows[lastIndex - back + 1];
        var body = numberOr(releaseBar.close, 0) - numberOr(releaseBar.open, releaseBar.close);
        var direction = body > 0 ? 'bull' : body < 0 ? 'bear' : null;
        // Doji release bar: direction unknown — report the state (percentile included), no score.
        if (!direction) return { on: false, released: null, score: 0, bandwidthPercentile: lastBandwidthPercentile };
        var deltaSum = toFiniteNumber(options.deltaSum);
        var confirmed = deltaSum !== null && ((direction === 'bull' && deltaSum > 0) || (direction === 'bear' && deltaSum < 0));
        return { on: false, released: direction, score: confirmed ? (direction === 'bull' ? 6 : -6) : 0, bandwidthPercentile: lastBandwidthPercentile };
      }
    }
    return { on: false, released: null, score: 0, bandwidthPercentile: lastBandwidthPercentile };
  }

  /**
   * Perp carry regime. fundingAvg is per 8h settlement -> x3 x365 x100 = annualized %.
   * Absolute anchor complementing the funding percentile: >30% a.a. is euphoria whatever the
   * asset's history says; persistent backwardation is squeeze fuel. Delta-neutral regime =
   * carry ~0 with OI at its own p80+ -> the OI is hedged basis-trade inventory, so directional
   * buildup readings must be muted.
   */
  function calculateCarryRegime(input) {
    input = input || {};
    var fundingAvg = toFiniteNumber(input.fundingAvg);
    var oiPercentile = toFiniteNumber(input.oiPercentile);
    if (fundingAvg === null) return { annualizedCarryPct: null, carryScore: 0, deltaNeutral: false, muteBuildup: false };
    var annualized = fundingAvg * 3 * 365 * 100;
    var carryScore = annualized > 30 ? -3 : annualized > 15 ? -2 : annualized < -10 ? 2 : 0;
    var deltaNeutral = Math.abs(annualized) < 5 && oiPercentile !== null && oiPercentile > 80;
    return { annualizedCarryPct: annualized, carryScore: carryScore, deltaNeutral: deltaNeutral, muteBuildup: deltaNeutral };
  }

  /**
   * Trap engine. A sweep through a prior extreme (depth >= 0.3 ATR) that RECLAIMS back inside
   * (>= 0.25 ATR beyond the level) with the taker delta flipping sides is a trap: the stop-hunt
   * fuel now powers the other direction. OI flush (<-2%) or a liquidation spike on the swept
   * side upgrades it. Emits the score AND a veto against entering in the trapped direction for
   * the next bars — "Bull trap" and "Entrada favoravel" must never coexist.
   */
  function detectTrap(candles, context) {
    context = context || {};
    var rows = Array.isArray(candles) ? candles : [];
    var none = { trap: null, score: 0, vetoDirection: null, vetoBars: 0, level: null, confirmed: false };
    var atr = toFiniteNumber(context.atr);
    if (rows.length < 4 || atr === null || atr <= 0) return none;
    var priorLow = toFiniteNumber(context.priorLow);
    var priorHigh = toFiniteNumber(context.priorHigh);
    var oiChangePct = toFiniteNumber(context.oiChangePct);
    var liquidationBias = context.liquidationBias || null;
    var recent = rows.slice(-5);
    var lastClose = toFiniteNumber(recent[recent.length - 1].close);
    if (lastClose === null) return none;
    function barDelta(bar) {
      var volume = toFiniteNumber(bar.volume);
      var takerBuy = toFiniteNumber(bar.takerBuy);
      return volume !== null && takerBuy !== null ? 2 * takerBuy - volume : null;
    }
    function evaluate(direction) {
      var level = direction === 'bull' ? priorLow : priorHigh;
      if (level === null) return null;
      var sweepIndex = -1;
      var extreme = direction === 'bull' ? Infinity : -Infinity;
      for (var i = 0; i < recent.length - 1; i++) {
        var value = toFiniteNumber(direction === 'bull' ? recent[i].low : recent[i].high);
        if (value === null) continue;
        if (direction === 'bull' ? (value < level && value < extreme) : (value > level && value > extreme)) {
          extreme = value;
          sweepIndex = i;
        }
      }
      if (sweepIndex < 0) return null;
      var depthAtr = Math.abs(level - extreme) / atr;
      var reclaimed = direction === 'bull' ? lastClose >= level + 0.25 * atr : lastClose <= level - 0.25 * atr;
      if (depthAtr < 0.3 || !reclaimed) return null;
      var sweepDelta = barDelta(recent[sweepIndex]);
      var afterDelta = 0;
      var hasAfter = false;
      for (var k = sweepIndex + 1; k < recent.length; k++) {
        var deltaValue = barDelta(recent[k]);
        if (deltaValue !== null) { afterDelta += deltaValue; hasAfter = true; }
      }
      var takerFlip = sweepDelta !== null && hasAfter
        && (direction === 'bull' ? (sweepDelta < 0 && afterDelta > 0) : (sweepDelta > 0 && afterDelta < 0));
      var confirmed = (oiChangePct !== null && oiChangePct < -2)
        || (direction === 'bull' ? liquidationBias === 'sell' : liquidationBias === 'buy');
      if (!takerFlip && !confirmed) return null;
      var magnitude = takerFlip && confirmed ? 8 : 6;
      return {
        trap: direction,
        score: direction === 'bull' ? magnitude : -magnitude,
        vetoDirection: direction === 'bull' ? 'short' : 'long',
        vetoBars: 6,
        level: level,
        confirmed: confirmed,
        sweepIndex: sweepIndex
      };
    }
    // Both extremes swept in the same window (choppy range double-sweep): the MOST RECENT sweep
    // wins — the market's last stop-hunt is the operative one. Equal recency is ambiguous chop:
    // no trap, no veto.
    var bullTrap = evaluate('bull');
    var bearTrap = evaluate('bear');
    if (bullTrap && bearTrap) {
      if (bullTrap.sweepIndex === bearTrap.sweepIndex) return none;
      return bullTrap.sweepIndex > bearTrap.sweepIndex ? bullTrap : bearTrap;
    }
    return bullTrap || bearTrap || none;
  }

  // ===== Signal engine v2 (Ciclo C) =====

  var SIGNAL_ENTRY_THRESHOLD = 42;
  var SIGNAL_EXIT_SCORE = 10;
  var SIGNAL_MIN_RR = 1;

  function namedTrigger(snapshot, side) {
    var trap = snapshot.trap || {};
    var squeeze = snapshot.squeeze || {};
    var shift = snapshot.structureShift || {};
    if (side === 'long') {
      if (trap.trap === 'bull') return 'trap-reclaim';
      if (squeeze.released === 'bull' && squeeze.score > 0) return 'squeeze-release';
      if (shift.event === 'CHoCH' && shift.direction === 'bull') return 'choch';
      if (shift.event === 'BOS' && shift.direction === 'bull') return 'bos';
      return null;
    }
    if (trap.trap === 'bear') return 'trap-reclaim';
    if (squeeze.released === 'bear' && squeeze.score < 0) return 'squeeze-release';
    if (shift.event === 'CHoCH' && shift.direction === 'bear') return 'choch';
    if (shift.event === 'BOS' && shift.direction === 'bear') return 'bos';
    return null;
  }

  function structuralLevels(snapshot, side) {
    var close = toFiniteNumber(snapshot.close);
    var atr = toFiniteNumber(snapshot.atr);
    if (close === null || atr === null || atr <= 0) return null;
    var supports = Array.isArray(snapshot.supports) ? snapshot.supports.filter(isFiniteNumber) : [];
    var resistances = Array.isArray(snapshot.resistances) ? snapshot.resistances.filter(isFiniteNumber) : [];
    if (side === 'long') {
      // Stop BEHIND the swing (structural), not a naked ATR multiple; target at the first level
      // with at least 1 ATR of room, else 2xATR.
      var stop = supports.length ? supports[0] - 0.15 * atr : close - 1.5 * atr;
      var target = null;
      for (var i = 0; i < resistances.length; i++) if (resistances[i] >= close + atr) { target = resistances[i]; break; }
      if (target === null) target = close + 2 * atr;
      if (!(stop < close && target > close)) return null;
      return { stop: stop, target: target, rr: (target - close) / (close - stop) };
    }
    var shortStop = resistances.length ? resistances[0] + 0.15 * atr : close + 1.5 * atr;
    var shortTarget = null;
    for (var j = 0; j < supports.length; j++) if (supports[j] <= close - atr) { shortTarget = supports[j]; break; }
    if (shortTarget === null) shortTarget = close - 2 * atr;
    if (!(shortStop > close && shortTarget < close)) return null;
    return { stop: shortStop, target: shortTarget, rr: (close - shortTarget) / (shortStop - close) };
  }

  function buildTradeRecord(state, snapshot, exitPrice, exitReason, barsHeld, maePct, mfePct) {
    var entry = state.entryPrice;
    var pnlPct = state.side === 'long' ? ((exitPrice - entry) / entry) * 100 : ((entry - exitPrice) / entry) * 100;
    var riskPct = state.side === 'long' ? ((entry - state.stopPrice) / entry) * 100 : ((state.stopPrice - entry) / entry) * 100;
    return {
      symbol: state.symbol,
      interval: state.interval,
      side: state.side,
      entryPrice: entry,
      exitPrice: exitPrice,
      stopPrice: state.stopPrice,
      targetPrice: state.targetPrice,
      entryTime: state.entryTime,
      exitTime: snapshot.closeTime,
      entryScore: state.entryScore,
      exitScore: toFiniteNumber(snapshot.total),
      trigger: state.trigger,
      regime: state.regime,
      durationBars: barsHeld,
      maePct: maePct,
      mfePct: mfePct,
      pnlPct: pnlPct,
      rMultiple: riskPct > 0 ? pnlPct / riskPct : NaN,
      exitReason: exitReason,
      entrySnapshotId: state.entrySnapshotId,
      exitSnapshotId: snapshot.inputSnapshotId || null
    };
  }

  /**
   * Signal state machine (pure reducer): FLAT -> ACTIVE -> closed. Entry demands ALL of: score
   * past the threshold, a NAMED trigger (trap reclaim, confirmed squeeze release, CHoCH, BOS),
   * the HTF gate available and not against, no post-trap veto, and structural R:R >= 1. Exits by
   * priority: structural stop, target, reversal (CHoCH against + divergence against), score
   * deterioration, time by regime. Returns { state, event } — event is an entry marker or the
   * closed trade record.
   */
  function evaluateSignalTransition(state, snapshot) {
    snapshot = snapshot || {};
    var gates = snapshot.gates || {};
    var total = toFiniteNumber(snapshot.total);
    if (!state || state.phase !== 'ACTIVE') {
      if (total === null) return { state: null, event: null };
      var side = total >= SIGNAL_ENTRY_THRESHOLD ? 'long' : total <= -SIGNAL_ENTRY_THRESHOLD ? 'short' : null;
      if (!side) return { state: null, event: null };
      if (!gates.htfAvailable) return { state: null, event: null };
      if (side === 'long' && (gates.htfVetoLong || gates.trapVeto === 'long')) return { state: null, event: null };
      if (side === 'short' && (gates.htfVetoShort || gates.trapVeto === 'short')) return { state: null, event: null };
      var trigger = namedTrigger(snapshot, side);
      if (!trigger) return { state: null, event: null };
      var levels = structuralLevels(snapshot, side);
      if (!levels || levels.rr < SIGNAL_MIN_RR) return { state: null, event: null };
      var active = {
        phase: 'ACTIVE',
        side: side,
        symbol: snapshot.symbol,
        interval: snapshot.interval,
        entryPrice: toFiniteNumber(snapshot.close),
        stopPrice: levels.stop,
        targetPrice: levels.target,
        entryTime: snapshot.closeTime,
        entryScore: total,
        trigger: trigger,
        regime: snapshot.regime || '--',
        maxBars: /tendencia/i.test(String(snapshot.regime || '')) ? 30 : 12,
        barsHeld: 0,
        maePct: 0,
        mfePct: 0,
        lastCloseTime: toFiniteNumber(snapshot.closeTime),
        entrySnapshotId: snapshot.inputSnapshotId || null
      };
      return { state: active, event: { type: 'entry', state: active } };
    }
    // Idempotent per candle: the eval marker lives IN the persisted state, so a page reload that
    // replays the same closed candle cannot double-count barsHeld/MAE/MFE.
    var candleTime = toFiniteNumber(snapshot.closeTime);
    if (candleTime !== null && isFiniteNumber(state.lastCloseTime) && candleTime <= state.lastCloseTime) {
      return { state: state, event: null };
    }
    // ACTIVE: update path metrics on the new closed candle, then check exits by priority.
    var high = toFiniteNumber(snapshot.high);
    var low = toFiniteNumber(snapshot.low);
    var close = toFiniteNumber(snapshot.close);
    var barsHeld = state.barsHeld + 1;
    var entry = state.entryPrice;
    var mfePct = state.mfePct;
    var maePct = state.maePct;
    if (state.side === 'long') {
      if (high !== null) mfePct = Math.max(mfePct, ((high - entry) / entry) * 100);
      if (low !== null) maePct = Math.min(maePct, ((low - entry) / entry) * 100);
    } else {
      if (low !== null) mfePct = Math.max(mfePct, ((entry - low) / entry) * 100);
      if (high !== null) maePct = Math.min(maePct, ((entry - high) / entry) * 100);
    }
    function exit(price, reason) {
      return { state: null, event: { type: 'exit', record: buildTradeRecord(state, snapshot, price, reason, barsHeld, maePct, mfePct) } };
    }
    var stopHit = state.side === 'long' ? (low !== null && low <= state.stopPrice) : (high !== null && high >= state.stopPrice);
    if (stopHit) {
      // Conservative: stop first when stop and target print in the same candle; gap through the
      // stop fills at the close, not at the level.
      var stopFill = state.side === 'long'
        ? (close !== null && close < state.stopPrice ? close : state.stopPrice)
        : (close !== null && close > state.stopPrice ? close : state.stopPrice);
      return exit(stopFill, 'stop');
    }
    var targetHit = state.side === 'long' ? (high !== null && high >= state.targetPrice) : (low !== null && low <= state.targetPrice);
    if (targetHit) return exit(state.targetPrice, 'target');
    var shift = snapshot.structureShift || {};
    var divergence = snapshot.divergence || {};
    var reversal = state.side === 'long'
      ? (shift.event === 'CHoCH' && shift.direction === 'bear' && divergence.bearish)
      : (shift.event === 'CHoCH' && shift.direction === 'bull' && divergence.bullish);
    if (reversal && close !== null) return exit(close, 'reversal');
    var deteriorated = total !== null && (state.side === 'long' ? total <= SIGNAL_EXIT_SCORE : total >= -SIGNAL_EXIT_SCORE);
    if (deteriorated && close !== null) return exit(close, 'deterioration');
    if (barsHeld >= state.maxBars && close !== null) return exit(close, 'time');
    var nextState = Object.assign({}, state, { barsHeld: barsHeld, maePct: maePct, mfePct: mfePct, lastCloseTime: candleTime });
    return { state: nextState, event: null };
  }

  /** Hit tables by regime x trigger x |entryScore| band. Cells under 20 samples are base-rate only. */
  function summarizeTradeJournal(records) {
    var rows = Array.isArray(records) ? records.filter(function (row) { return row && isFiniteNumber(toFiniteNumber(row.pnlPct)); }) : [];
    var byKey = {};
    rows.forEach(function (row) {
      var score = Math.abs(numberOr(row.entryScore, 0));
      var band = score >= 80 ? '80+' : score >= 60 ? '60-79' : '42-59';
      var key = (row.regime || '--') + '|' + (row.trigger || '--') + '|' + band;
      if (!byKey[key]) byKey[key] = { regime: row.regime || '--', trigger: row.trigger || '--', band: band, count: 0, wins: 0, rSum: 0, rCount: 0 };
      var cell = byKey[key];
      cell.count += 1;
      if (+row.pnlPct > 0) cell.wins += 1;
      var r = toFiniteNumber(row.rMultiple);
      if (r !== null) { cell.rSum += r; cell.rCount += 1; }
    });
    var cells = Object.keys(byKey).map(function (key) {
      var cell = byKey[key];
      return {
        regime: cell.regime,
        trigger: cell.trigger,
        band: cell.band,
        count: cell.count,
        hitRate: Math.round((cell.wins / cell.count) * 100),
        avgR: cell.rCount ? cell.rSum / cell.rCount : NaN,
        sufficient: cell.count >= 20
      };
    }).sort(function (a, b) { return b.count - a.count; });
    return { cells: cells, total: rows.length };
  }

  /**
   * Base/alternative/range scenarios anchored on structure: triggers are level breaks, targets
   * the next level (or 2xATR), invalidation the STRUCTURAL level (CHoCH), never an arbitrary %.
   */
  function buildScenarios(input) {
    input = input || {};
    var close = toFiniteNumber(input.close);
    var atr = toFiniteNumber(input.atr);
    var supports = Array.isArray(input.supports) ? input.supports.filter(isFiniteNumber) : [];
    var resistances = Array.isArray(input.resistances) ? input.resistances.filter(isFiniteNumber) : [];
    if (close === null || atr === null) return [];
    var invalidation = toFiniteNumber(input.structuralInvalidation);
    var bearBase = input.bias === 'Vendedor';
    var longScenario = {
      direction: 'long',
      trigger: resistances[0] !== undefined ? resistances[0] : close + atr,
      target: resistances[1] !== undefined ? resistances[1] : (resistances[0] !== undefined ? resistances[0] : close) + 2 * atr,
      invalidation: invalidation !== null ? invalidation : (supports[0] !== undefined ? supports[0] : close - 2 * atr)
    };
    var shortScenario = {
      direction: 'short',
      trigger: supports[0] !== undefined ? supports[0] : close - atr,
      target: supports[1] !== undefined ? supports[1] : (supports[0] !== undefined ? supports[0] : close) - 2 * atr,
      invalidation: invalidation !== null && bearBase ? invalidation : (resistances[0] !== undefined ? resistances[0] : close + 2 * atr)
    };
    var base = bearBase ? shortScenario : longScenario;
    var alternative = bearBase ? longScenario : shortScenario;
    return [
      Object.assign({ name: 'base' }, base),
      Object.assign({ name: 'alternativo' }, alternative),
      { name: 'range', lower: supports[0] !== undefined ? supports[0] : close - atr, upper: resistances[0] !== undefined ? resistances[0] : close + atr, direction: 'neutral' }
    ];
  }

  /**
   * Detector lag study over daily candles: for each REAL swing top/bottom (pivot that is the
   * extreme of +/-10 bars), measure how many bars until a CHoCH fired against the old trend.
   * Answers "quantos dias atrasado o desk fica numa virada" with the asset's own history.
   */
  function backtestDetectorLag(candles) {
    var rows = Array.isArray(candles) ? candles : [];
    var result = { tops: { count: 0, detected: 0, medianLagBars: NaN }, bottoms: { count: 0, detected: 0, medianLagBars: NaN } };
    if (rows.length < 60) return result;
    var pivotHighs = [], pivotLows = [];
    for (var i = 2; i < rows.length - 2; i++) {
      var bar = rows[i];
      if (bar.high > rows[i - 1].high && bar.high > rows[i - 2].high && bar.high > rows[i + 1].high && bar.high > rows[i + 2].high) pivotHighs.push({ price: bar.high, time: bar.time, index: i });
      if (bar.low < rows[i - 1].low && bar.low < rows[i - 2].low && bar.low < rows[i + 1].low && bar.low < rows[i + 2].low) pivotLows.push({ price: bar.low, time: bar.time, index: i });
    }
    function isRealExtreme(pivot, list, kind) {
      var from = Math.max(0, pivot.index - 10);
      var to = Math.min(rows.length - 1, pivot.index + 10);
      for (var k = from; k <= to; k++) {
        if (kind === 'top' && rows[k].high > pivot.price) return false;
        if (kind === 'bottom' && rows[k].low < pivot.price) return false;
      }
      return true;
    }
    function study(pivotList, kind) {
      var lags = [];
      var count = 0;
      pivotList.forEach(function (pivot) {
        if (!isRealExtreme(pivot, pivotList, kind)) return;
        count += 1;
        for (var j = pivot.index + 1; j <= Math.min(pivot.index + 15, rows.length - 1); j++) {
          var shift = detectStructureShift(rows.slice(0, j + 1), pivotHighs, pivotLows);
          var fired = kind === 'top'
            ? (shift.event === 'CHoCH' && shift.direction === 'bear')
            : (shift.event === 'CHoCH' && shift.direction === 'bull');
          if (fired) {
            var eventIndex = j - (shift.barsAgo || 0);
            var lag = eventIndex - pivot.index;
            if (lag >= 1) { lags.push(lag); break; }
          }
        }
      });
      var sorted = lags.slice().sort(function (a, b) { return a - b; });
      return { count: count, detected: lags.length, medianLagBars: sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN };
    }
    result.tops = study(pivotHighs, 'top');
    result.bottoms = study(pivotLows, 'bottom');
    return result;
  }

  /**
   * OIxprice quadrant — single table used by every scorer so OI and price are read in the
   * same window (no more roc12-vs-futures mismatch, no unconditional penalty for OI contraction).
   *   OI up + price up   -> Long buildup  (+3, healthy trend)
   *   OI up + price down -> Short buildup (-3, healthy downtrend)
   *   OI down + price up -> Short covering (+2, fragile rally, NOT bearish)
   *   OI down + price dn -> Long liquidation (-4, capitulation)
   * priceChangePct only needs a sign; oiThreshold defaults to 3 (% over the OI window).
   */
  function calculateOiPriceQuadrant(oiChangePct, priceChangePct, oiThreshold) {
    var oi = toFiniteNumber(oiChangePct);
    var price = toFiniteNumber(priceChangePct);
    var threshold = toFiniteNumber(oiThreshold);
    if (threshold === null) threshold = 3;
    var neutral = { score: 0, phase: 'OI neutro' };
    if (oi === null || price === null) return neutral;
    if (oi > threshold && price > 0) return { score: 3, phase: 'Long buildup' };
    if (oi > threshold && price < 0) return { score: -3, phase: 'Short buildup' };
    if (oi < -threshold && price > 0) return { score: 2, phase: 'Short covering' };
    if (oi < -threshold && price < 0) return { score: -4, phase: 'Long liquidation' };
    return neutral;
  }

  function calculateDerivativeDetailContribution(input) {
    input = input || {};
    var asOf = toFiniteNumber(input.asOf);
    if (asOf === null) asOf = Date.now();
    var detail = resolveDatasetFreshness(input.detail, asOf).eligibleForScore ? input.detail : {};
    var options = resolveDatasetFreshness(input.options, asOf).eligibleForScore ? input.options : {};
    var close = toFiniteNumber(input.close);
    var vwap = toFiniteNumber(input.vwap);
    // Price direction matched to the OI window when available; otherwise fall back to the
    // sign of price-vs-VWAP so OI contraction is never scored blind to price.
    var oiPriceChangePct = toFiniteNumber(input.oiPriceChangePct);
    if (oiPriceChangePct === null && close !== null && vwap !== null) oiPriceChangePct = close - vwap;
    var score = 0;
    // In a delta-neutral regime (carry ~0 with OI at its own extreme) the OI is hedged
    // basis-trade inventory, so the directional OIxprice quadrant must not score.
    if (!input.muteOiQuadrant && isFiniteNumber(detail.oiChangePct) && isDatasetMetricEligible(detail, 'oiChangePct', asOf)) {
      score += calculateOiPriceQuadrant(detail.oiChangePct, oiPriceChangePct).score;
    }
    // Percentiles vs the asset's own history replace the fixed thresholds when the series is
    // long enough (percentileRank returns null otherwise) — a desk reads positioning relative
    // to the asset's own regime, not one global cutoff for BTC and a 50-cent alt alike.
    var percentiles = input.percentiles || {};
    if (isFiniteNumber(detail.takerRatio) && isDatasetMetricEligible(detail, 'takerRatio', asOf)) {
      var takerPct = toFiniteNumber(percentiles.taker);
      score += takerPct !== null ? percentileExtremeContribution(takerPct, 4, true)
        : detail.takerRatio > 1.08 ? 3 : detail.takerRatio < 0.92 ? -3 : 0;
    }
    // globalLongShortAccountRatio = varejo: contrarian (lotado = combustivel contra).
    if (isFiniteNumber(detail.longShortRatio) && isDatasetMetricEligible(detail, 'longShortRatio', asOf)) {
      var retailPct = toFiniteNumber(percentiles.longShort);
      score += retailPct !== null ? percentileExtremeContribution(retailPct, 3, false)
        : detail.longShortRatio > 1.7 ? -1 : detail.longShortRatio < 0.65 ? 1 : 0;
    }
    // topLongShortPositionRatio = smart money: seguir (long positivo, short negativo).
    if (isFiniteNumber(detail.topPositionRatio) && isDatasetMetricEligible(detail, 'topPositionRatio', asOf)) {
      var topPct = toFiniteNumber(percentiles.topPosition);
      score += topPct !== null ? percentileExtremeContribution(topPct, 3, true)
        : detail.topPositionRatio > 1.8 ? 2 : detail.topPositionRatio < 0.65 ? -2 : 0;
    }
    if (isFiniteNumber(detail.fundingAvg) && isDatasetMetricEligible(detail, 'fundingAvg', asOf)) {
      var fundingPct = toFiniteNumber(percentiles.funding);
      score += fundingPct !== null ? percentileExtremeContribution(fundingPct, 6, false)
        : detail.fundingAvg > 0.0003 ? -2 : detail.fundingAvg < -0.0001 ? 1 : 0;
    }
    if (options.market && isFiniteNumber(toFiniteNumber(options.market.putCallOi))) {
      // Deribit crypto options are structurally call-dominant (P/C OI baseline ~0.55, historical
      // range ~0.4-0.8) — the old equity-style band (<0.7 -> +1) fired every day as a permanent
      // bullish bias. Neutral band [0.45, 1.0]: only genuine extremes vs the venue baseline score.
      score += +options.market.putCallOi > 1.0 ? -2 : +options.market.putCallOi < 0.45 ? 1 : 0;
    }
    if (options.dvol && isFiniteNumber(toFiniteNumber(options.dvol.change7d))) {
      // Direction-aware: rising IV alongside a rising spot is call-buying in a rally (positive
      // spot-vol correlation is common in crypto uplegs), not fear — only score the stress read
      // when price is NOT rising with it. Falling IV (vol crush) stays constructive.
      var priceChange7d = toFiniteNumber(input.priceChange7dPct);
      var dvolChange = +options.dvol.change7d;
      score += dvolChange > 12 ? (priceChange7d !== null && priceChange7d > 0 ? 0 : -2)
        : dvolChange < -12 ? 1 : 0;
    }
    return score;
  }

  /**
   * Model ruleset registry: weights, caps and thresholds for 1.0.0-preview.6.
   * rulesetVersion must be bumped whenever any scoring rule changes (including the semantics
   * encoded in the contribution functions above) so rulesetHash distinguishes model revisions.
   */
  var RULESET = {
    modelId: 'crypto-live-desk-analytics',
    rulesetVersion: '1.0.0-preview.6',
    radarWeights: { technical: 30, flow: 15, derivatives: 10, fundamental: 15, macroNews: 10, history: 15, momentum24h: 5 },
    // multiTimeframe 24->16: o MTF virou gate (1d+1w vetam entradas) e o agregado exclui o TF
    // do grafico, entao o peso de score cai para reduzir o triple-counting de tendencia.
    // risk 10->14: risco agora carrega trap/climax/liquidacoes com mais alcance.
    setupCaps: { technical: 20, multiTimeframe: 16, smartFlow: 18, derivatives: 12, chainFundamental: 10, newsMacro: 10, history: 12, risk: 14 },
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
    var multiply = typeof Math.imul === 'function'
      ? function (value) { return Math.imul(value, 0x01000193) >>> 0; }
      : function (value) { return ((value >>> 16) * 0x01000193 * 65536 + (value & 0xffff) * 0x01000193) >>> 0; };
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = multiply(hash);
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
        if (!protocol) return false;
        if (requireTvl && !(numberOr(protocol.tvl, 0) >= floor)) return false;
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

  var SIGNAL_HORIZONS = { r1h: 3600000, r24h: 86400000, r7d: 604800000 };

  /** Price outcomes at fixed horizons after the signal candle close. */
  function evaluateSignalOutcome(record, candles) {
    var basePrice = toFiniteNumber(record && record.price);
    var baseTime = toFiniteNumber(record && record.signalCloseTime);
    if (basePrice === null || basePrice <= 0 || baseTime === null) return null;
    var rows = (Array.isArray(candles) ? candles : []).filter(function (candle) {
      return candle && isFiniteNumber(toFiniteNumber(candle.closeTime)) && isFiniteNumber(toFiniteNumber(candle.close));
    });
    var outcome = {};
    Object.keys(SIGNAL_HORIZONS).forEach(function (name) {
      var target = baseTime + SIGNAL_HORIZONS[name];
      var match = null;
      rows.forEach(function (candle) {
        if (candle.closeTime >= target && (match === null || candle.closeTime < match.closeTime)) match = candle;
      });
      outcome[name] = match ? ((+match.close - basePrice) / basePrice) * 100 : null;
    });
    return outcome;
  }

  /**
   * A record stays pending while any horizon whose deadline already elapsed
   * is still unevaluated — an early evaluation must never freeze the record.
   */
  function signalOutcomePending(record, asOf) {
    var baseTime = toFiniteNumber(record && record.signalCloseTime);
    if (baseTime === null) return false;
    var now = toFiniteNumber(asOf);
    if (now === null) now = Date.now();
    var outcome = record.outcome || {};
    return Object.keys(SIGNAL_HORIZONS).some(function (name) {
      var elapsed = baseTime + SIGNAL_HORIZONS[name] <= now;
      return elapsed && !isFiniteNumber(toFiniteNumber(outcome[name]));
    });
  }

  /** Merges a fresh evaluation into an existing one without erasing filled horizons. */
  function mergeSignalOutcome(existing, fresh) {
    var merged = {};
    Object.keys(SIGNAL_HORIZONS).forEach(function (name) {
      var freshValue = fresh ? toFiniteNumber(fresh[name]) : null;
      var existingValue = existing ? toFiniteNumber(existing[name]) : null;
      merged[name] = freshValue !== null ? freshValue : existingValue;
    });
    return merged;
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
   * never on level, so a persistent condition alerts once. Score alerts
   * fire on ENTERING a zone (up through +42/+60, down through -45) by
   * design; decay out of a zone is visible in the panel but not alerted.
   * Snapshots from different symbols or timeframes are never compared.
   */
  function evaluateAlertTransitions(previous, current, config) {
    var rules = config || {};
    var alerts = [];
    if (!previous || !current || previous.symbol !== current.symbol) return alerts;
    if (previous.interval !== current.interval) return alerts;
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
    mergeSignalOutcome: mergeSignalOutcome,
    signalOutcomePending: signalOutcomePending,
    pearsonCorrelation: pearsonCorrelation,
    relativeStrength: relativeStrength,
    shouldRecordSignal: shouldRecordSignal,
    summarizeSignalJournal: summarizeSignalJournal,
    aggregateMultiTimeframe: aggregateMultiTimeframe,
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
    calculateFundingContribution: calculateFundingContribution,
    calculateOiPriceQuadrant: calculateOiPriceQuadrant,
    percentileRank: percentileRank,
    percentileExtremeContribution: percentileExtremeContribution,
    obvSeries: obvSeries,
    weightedMedian: weightedMedian,
    detectStructureShift: detectStructureShift,
    detectDivergence: detectDivergence,
    detectVolumeClimax: detectVolumeClimax,
    detectSqueeze: detectSqueeze,
    calculateCarryRegime: calculateCarryRegime,
    detectTrap: detectTrap,
    evaluateSignalTransition: evaluateSignalTransition,
    summarizeTradeJournal: summarizeTradeJournal,
    buildScenarios: buildScenarios,
    backtestDetectorLag: backtestDetectorLag,
    classifyFreshness: classifyFreshness,
    resolveDatasetFreshness: resolveDatasetFreshness,
    calculatePosition: calculatePosition,
    createRequestGate: createRequestGate,
    classifyHttpError: classifyHttpError,
    parseRetryAfter: parseRetryAfter,
    createSourceThrottle: createSourceThrottle,
    filterFreshByTimestamp: filterFreshByTimestamp,
    isCandleClosed: isCandleClosed,
    isDatasetMetricEligible: isDatasetMetricEligible,
    normalizeKlines: normalizeKlines,
    normalizeTradFiChart: normalizeTradFiChart,
    normalizeTradFiRows: normalizeTradFiRows,
    percentageChange: percentageChange,
    formatUsd: formatUsd,
    rsi: rsi,
    rsiSeries: rsiSeries,
    resolveOptionsScope: resolveOptionsScope,
    selectClosedCandles: selectClosedCandles,
    toFiniteNumber: toFiniteNumber
  };

  return typeof Object.freeze === 'function' ? Object.freeze(api) : api;
}));
