(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CryptoAnalyticsCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function analyticsCoreFactory() {
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

  function toTimestampMs(value) {
    if (value === null || value === undefined || typeof value === 'boolean') return null;
    if (value instanceof Date) {
      var dateValue = value.getTime();
      return Number.isFinite(dateValue) ? dateValue : null;
    }
    if (typeof value === 'string' && value.trim() === '') return null;
    var numeric = toFiniteNumber(value);
    if (numeric !== null) return Math.abs(numeric) < 100000000000 ? numeric * 1000 : numeric;
    var parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  /** Return the newest valid row without assuming upstream array order. */
  function latestTimestampedRow(rows, keys, asOf, clockSkewToleranceMs) {
    var fields = Array.isArray(keys) && keys.length ? keys : ['observedAt', 'date', 'time', 'timestamp'];
    var reference = toFiniteNumber(asOf);
    var tolerance = toFiniteNumber(clockSkewToleranceMs);
    if (tolerance === null) tolerance = RULESET && RULESET.clockSkewToleranceMs || 60000;
    var latest = null;
    var latestTime = -Infinity;
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || typeof row !== 'object') return;
      var timestamp = null;
      for (var index = 0; index < fields.length; index += 1) {
        timestamp = toTimestampMs(row[fields[index]]);
        if (timestamp !== null) break;
      }
      var validTimestamp = timestamp !== null && timestamp >= 0
        && (reference === null || timestamp <= reference + tolerance);
      if (validTimestamp && timestamp > latestTime) {
        latest = row;
        latestTime = timestamp;
      }
    });
    return latest;
  }

  function utcDateKey(value) {
    var timestamp = toTimestampMs(value);
    if (timestamp === null) return null;
    var date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return null;
    return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0') + '-' + String(date.getUTCDate()).padStart(2, '0');
  }

  function observedFixedHoliday(year, month, day) {
    var date = new Date(Date.UTC(year, month, day));
    var weekday = date.getUTCDay();
    if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
    else if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
    return utcDateKey(date);
  }

  function nthWeekdayOfMonth(year, month, weekday, occurrence) {
    var date = new Date(Date.UTC(year, month, 1));
    var offset = (weekday - date.getUTCDay() + 7) % 7;
    date.setUTCDate(1 + offset + (occurrence - 1) * 7);
    return utcDateKey(date);
  }

  function lastWeekdayOfMonth(year, month, weekday) {
    var date = new Date(Date.UTC(year, month + 1, 0));
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - weekday + 7) % 7));
    return utcDateKey(date);
  }

  function easterSundayUtc(year) {
    var a = year % 19;
    var b = Math.floor(year / 100);
    var c = year % 100;
    var d = Math.floor(b / 4);
    var e = b % 4;
    var f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4);
    var k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  }

  function usEquityHolidayKeys(year) {
    var keys = [
      observedFixedHoliday(year, 0, 1),
      nthWeekdayOfMonth(year, 0, 1, 3),
      nthWeekdayOfMonth(year, 1, 1, 3),
      lastWeekdayOfMonth(year, 4, 1),
      observedFixedHoliday(year, 5, 19),
      observedFixedHoliday(year, 6, 4),
      nthWeekdayOfMonth(year, 8, 1, 1),
      nthWeekdayOfMonth(year, 10, 4, 4),
      observedFixedHoliday(year, 11, 25)
    ];
    var goodFriday = easterSundayUtc(year);
    goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
    keys.push(utcDateKey(goodFriday));
    return keys;
  }

  /** US ETF flow rows use calendar dates and frequently emit zero placeholders on market closures. */
  function isUsEquityTradingDay(value) {
    var key = utcDateKey(value);
    if (!key) return false;
    var date = new Date(key + 'T00:00:00Z');
    var weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) return false;
    var year = date.getUTCFullYear();
    var holidays = usEquityHolidayKeys(year - 1).concat(usEquityHolidayKeys(year), usEquityHolidayKeys(year + 1));
    return holidays.indexOf(key) === -1;
  }

  function classifyEtfFlowObservation(row, flowValue) {
    var source = row && typeof row === 'object' ? row : {};
    var value = toFiniteNumber(flowValue);
    var dateValue = source.date || source.day || source.timestamp || source.time;
    var dateKey = utcDateKey(dateValue);
    if (value === null) return { reported: false, reason: 'invalid-flow', date: dateKey };
    if (typeof source.reported === 'boolean') return { reported: source.reported, reason: 'provider-reported-flag', date: dateKey };
    if (typeof source.isReported === 'boolean') return { reported: source.isReported, reason: 'provider-is-reported-flag', date: dateKey };
    if (typeof source.marketOpen === 'boolean') return { reported: source.marketOpen, reason: 'provider-market-open-flag', date: dateKey };
    var status = String(source.reportStatus || source.status || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['reported', 'final', 'published'].indexOf(status) !== -1) return { reported: true, reason: 'provider-status-' + status, date: dateKey };
    if (['not_reported', 'closed', 'holiday', 'weekend', 'pending'].indexOf(status) !== -1) return { reported: false, reason: 'provider-status-' + status, date: dateKey };
    if (value !== 0) return { reported: true, reason: 'nonzero-observation', date: dateKey };
    if (!dateKey) return { reported: false, reason: 'invalid-date', date: null };
    return isUsEquityTradingDay(dateKey)
      ? { reported: true, reason: 'trading-day-zero', date: dateKey }
      : { reported: false, reason: 'market-closed-placeholder', date: dateKey };
  }

  function numberOr(value, fallback) {
    var number = toFiniteNumber(value);
    return number === null ? fallback : number;
  }

  function nonNegative(value, fallback) {
    return Math.max(0, numberOr(value, fallback === undefined ? 0 : fallback));
  }

  function boundedWeight(value) {
    // Weights are relative. Capping hostile magnitudes preserves their dominance without allowing
    // additions or multiplications to overflow to Infinity/NaN.
    return Math.min(1e6, nonNegative(value));
  }

  function average(values) {
    if (!values.length) return NaN;
    var maxAbs = 0;
    for (var index = 0; index < values.length; index += 1) {
      if (!isFiniteNumber(values[index])) return NaN;
      maxAbs = Math.max(maxAbs, Math.abs(values[index]));
    }
    if (!maxAbs) return 0;
    var scaled = values.reduce(function (sum, value) { return sum + value / maxAbs; }, 0) / values.length;
    var mean = Math.max(-1, Math.min(1, scaled)) * maxAbs;
    return isFiniteNumber(mean) ? mean : NaN;
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
    var currentQty = Math.min(1e15, nonNegative(input.currentQty));
    var currentPrice = Math.min(1e15, nonNegative(input.currentPrice));
    var addMultiple = Math.min(1e6, nonNegative(input.addMultiple));
    var addPrice = Math.min(1e15, nonNegative(input.addPrice));
    // Mirror the calculator's declared operating bounds in the pure core as well. HTML min/max
    // attributes are presentation hints, not a trustworthy validation boundary (values can be
    // pasted or supplied programmatically).
    var entryFeeRate = Math.min(0.99, nonNegative(input.entryFeePct) / 100);
    var exitFeeRate = Math.min(0.99, nonNegative(input.exitFeePct) / 100);
    var leverage = Math.min(125, Math.max(1, numberOr(input.leverage, 1)));
    var fundingRate = Math.max(-1, Math.min(1, numberOr(input.fundingRatePct, 0) / 100));
    var fundingPeriods = Math.min(1e6, Math.floor(nonNegative(input.fundingPeriods)));
    var maintenanceRate = Math.min(0.99, nonNegative(input.maintenancePct) / 100);

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
      leverage: leverage,
      entryFeePct: entryFeeRate * 100,
      exitFeePct: exitFeeRate * 100,
      fundingPeriods: fundingPeriods,
      maintenancePct: maintenanceRate * 100,
      currentQty: currentQty,
      currentPrice: currentPrice,
      addMultiple: addMultiple,
      addPrice: addPrice,
      fundingRatePct: fundingRate * 100,
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

  /** Directional medium-term market context; size/rank alone must not create bullish points. */
  function calculateMarketTrendContext(market) {
    var row = market || {};
    var change7d = toFiniteNumber(row.price_change_percentage_7d_in_currency);
    var change30d = toFiniteNumber(row.price_change_percentage_30d_in_currency);
    var available = change7d !== null || change30d !== null;
    var raw = (change7d !== null ? change7d * 0.45 : 0) + (change30d !== null ? change30d * 0.15 : 0);
    return {
      available: available,
      score: available ? Math.max(-12, Math.min(12, Math.round(raw))) : 0,
      quality: ((change7d !== null ? 1 : 0) + (change30d !== null ? 1 : 0)) / 2,
      change7d: change7d,
      change30d: change30d
    };
  }

  function realizedVolatility(values, period, periodsPerYear) {
    var window = Math.max(1, Math.floor(numberOr(period, 30)));
    var annualPeriods = toFiniteNumber(periodsPerYear);
    var rows = (Array.isArray(values) ? values : []).slice(-(window + 1)).map(toFiniteNumber);
    if (rows.length !== window + 1 || annualPeriods === null || annualPeriods <= 0) return NaN;
    var returns = [];
    for (var index = 1; index < rows.length; index += 1) {
      if (rows[index - 1] === null || rows[index] === null || rows[index - 1] <= 0 || rows[index] <= 0) return NaN;
      returns.push(Math.log(rows[index] / rows[index - 1]));
    }
    var mean = average(returns);
    var variance = average(returns.map(function (value) { return Math.pow(value - mean, 2); }));
    return Math.sqrt(variance) * Math.sqrt(annualPeriods) * 100;
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
  function normalizeTradFiRows(payload, asOf) {
    var chart = chartResult(payload);
    var timestamps = chart && Array.isArray(chart.timestamp) ? chart.timestamp : [];
    var quote = chart && chart.indicators && chart.indicators.quote
      && chart.indicators.quote[0] || {};
    var referenceTime = toFiniteNumber(asOf);
    if (referenceTime === null) referenceTime = Date.now();

    var byTimestamp = new Map();
    timestamps.forEach(function (rawTimestamp, index) {
      var timestamp = toFiniteNumber(rawTimestamp);
      var close = toFiniteNumber(quote.close && quote.close[index]);
      if (timestamp === null || timestamp < 0 || close === null || close <= 0) return;
      var observedAt = timestamp * 1000;
      if (!Number.isFinite(observedAt) || observedAt > 8640000000000000
        || observedAt > referenceTime + RULESET.clockSkewToleranceMs) return;
      var observedDate = new Date(observedAt);
      if (!Number.isFinite(observedDate.getTime())) return;
      var volume = toFiniteNumber(quote.volume && quote.volume[index]);
      var row = {
        date: observedDate.toISOString().slice(0, 10),
        observedAt: observedAt,
        open: toFiniteNumber(quote.open && quote.open[index]),
        high: toFiniteNumber(quote.high && quote.high[index]),
        low: toFiniteNumber(quote.low && quote.low[index]),
        close: close,
        volume: volume !== null && volume >= 0 ? volume : null
      };
      // Upstream retries may reorder or duplicate chart points. Keep the last valid payload for
      // an instant, then make the consumer-facing series deterministic and chronological.
      byTimestamp.set(timestamp, row);
    });
    return Array.from(byTimestamp.values()).sort(function (a, b) { return a.observedAt - b.observedAt; });
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
    var byOpenTime = new Map();
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
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
      var prices = [candle.open, candle.high, candle.low, candle.close];
      var invalidPrice = prices.some(function (value) { return value === null || value <= 0; });
      var invalidRange = !invalidPrice && (candle.high < Math.max(candle.open, candle.close)
        || candle.low > Math.min(candle.open, candle.close) || candle.high < candle.low);
      var invalidTiming = candle.time === null || candle.time < 0
        || (candle.closeTime !== null && (candle.closeTime < 0 || candle.closeTime < candle.time));
      var invalidVolume = (candle.volume !== null && candle.volume < 0)
        || (candle.quote !== null && candle.quote < 0)
        || (candle.trades !== null && candle.trades < 0)
        || (candle.takerBuy !== null && candle.takerBuy < 0)
        || (candle.volume !== null && candle.takerBuy !== null && candle.takerBuy > candle.volume);
      if (invalidPrice || invalidRange || invalidTiming || invalidVolume) return;
      // Duplicate open times are not independent observations. Keep the last valid payload and
      // return a deterministic chronological series even if an upstream retries or reorders rows.
      byOpenTime.set(candle.time, candle);
    });
    return Array.from(byOpenTime.values()).sort(function (a, b) { return a.time - b.time; });
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

  /**
   * Price return over an externally timestamped window. The series must actually cover the
   * window start; silently substituting the oldest available candle would compare different
   * horizons (notably 1s/1m price data against Binance's minimum 5m OI history).
   */
  function priceChangeOverWindow(candles, startTimestamp, endTimestamp) {
    var start = toFiniteNumber(startTimestamp);
    var end = toFiniteNumber(endTimestamp);
    if (!Array.isArray(candles) || candles.length < 2 || start === null || end === null || end <= start) return NaN;
    var valid = [];
    candles.forEach(function (candle) {
      var time = toFiniteNumber(candle && (candle.closeTime !== undefined ? candle.closeTime : candle.time));
      var close = toFiniteNumber(candle && candle.close);
      if (time === null || close === null || close <= 0) return;
      valid.push({ time: time, close: close });
    });
    valid.sort(function (a, b) { return a.time - b.time; });
    var unique = [];
    valid.forEach(function (row) {
      if (unique.length && unique[unique.length - 1].time === row.time) unique[unique.length - 1] = row;
      else unique.push(row);
    });
    if (unique.length < 2) return NaN;
    var steps = [];
    for (var index = 1; index < unique.length; index += 1) {
      var step = unique[index].time - unique[index - 1].time;
      if (step > 0) steps.push(step);
    }
    var typicalStep = median(steps);
    if (!isFiniteNumber(typicalStep) || typicalStep <= 0) return NaN;
    var tolerance = typicalStep * 1.5;
    var startCandle = null;
    var endCandle = null;
    unique.forEach(function (row) {
      var time = row.time;
      var close = row.close;
      if (time <= start && (!startCandle || time > startCandle.time)) startCandle = { time: time, close: close };
      if (time <= end && (!endCandle || time > endCandle.time)) endCandle = { time: time, close: close };
    });
    if (!startCandle || !endCandle || endCandle.time <= startCandle.time) return NaN;
    if (start - startCandle.time > tolerance || end - endCandle.time > tolerance) return NaN;
    var change = ((endCandle.close - startCandle.close) / startCandle.close) * 100;
    // Invariante "nunca Infinity": entradas extremas (close ~1e308) estouram o produto.
    return isFiniteNumber(change) ? change : NaN;
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

  /**
   * Shared client request budget. It bounds simultaneous work and starts per rolling window,
   * while keeping each source below its own slice so one provider cannot starve the others.
   */
  function createRequestBudget(options) {
    options = options || {};
    var maxConcurrent = Math.max(1, Math.floor(numberOr(options.maxConcurrent, 8)));
    var maxStartsPerWindow = Math.max(1, Math.floor(numberOr(options.maxStartsPerWindow, 120)));
    var maxStartsPerSource = Math.max(1, Math.floor(numberOr(options.maxStartsPerSource, 45)));
    var windowMs = Math.max(1, numberOr(options.windowMs, 60000));
    var maxQueue = Math.max(1, Math.floor(numberOr(options.maxQueue, 160)));
    var clock = typeof options.clock === 'function' ? options.clock : Date.now;
    var schedule = typeof options.schedule === 'function' ? options.schedule : function (callback, delayMs) { return setTimeout(callback, delayMs); };
    var cancelSchedule = typeof options.cancelSchedule === 'function' ? options.cancelSchedule : function (id) { clearTimeout(id); };
    var active = 0, sequence = 0, timer = null;
    var queue = [], starts = [], sourceStarts = Object.create(null);

    function sourceKey(value) { return String(value || 'unclassified'); }
    function prune(now) {
      var cutoff = now - windowMs;
      while (starts.length && starts[0] <= cutoff) starts.shift();
      Object.keys(sourceStarts).forEach(function (key) {
        var rows = sourceStarts[key];
        while (rows.length && rows[0] <= cutoff) rows.shift();
        if (!rows.length) delete sourceStarts[key];
      });
    }
    function sourceRows(key) {
      if (!sourceStarts[key]) sourceStarts[key] = [];
      return sourceStarts[key];
    }
    function scheduleDrain(waitMs) {
      if (timer !== null) return;
      timer = schedule(function () { timer = null; drain(); }, Math.max(1, Math.ceil(waitMs)));
    }
    function waitForCapacity(now) {
      var waits = [];
      if (starts.length >= maxStartsPerWindow) waits.push(starts[0] + windowMs - now);
      queue.forEach(function (item) {
        var rows = sourceStarts[item.source] || [];
        if (rows.length >= maxStartsPerSource) waits.push(rows[0] + windowMs - now);
      });
      return waits.length ? Math.max(1, Math.min.apply(null, waits)) : 1;
    }
    function start(item, now) {
      active += 1;
      starts.push(now);
      sourceRows(item.source).push(now);
      Promise.resolve().then(item.task).then(item.resolve, item.reject).finally(function () {
        active -= 1;
        drain();
      });
    }
    function drain() {
      if (timer !== null) { cancelSchedule(timer); timer = null; }
      var now = clock();
      prune(now);
      while (active < maxConcurrent && queue.length) {
        if (starts.length >= maxStartsPerWindow) { scheduleDrain(waitForCapacity(now)); return; }
        var eligibleIndex = -1;
        for (var index = 0; index < queue.length; index += 1) {
          if ((sourceStarts[queue[index].source] || []).length < maxStartsPerSource) { eligibleIndex = index; break; }
        }
        if (eligibleIndex === -1) { scheduleDrain(waitForCapacity(now)); return; }
        start(queue.splice(eligibleIndex, 1)[0], now);
      }
    }
    function run(task, metadata) {
      if (typeof task !== 'function') return Promise.reject(new TypeError('request task must be a function'));
      if (queue.length >= maxQueue) {
        var overflow = new Error('global request budget queue full');
        overflow.category = 'budget';
        overflow.throttled = true;
        return Promise.reject(overflow);
      }
      metadata = metadata || {};
      return new Promise(function (resolve, reject) {
        queue.push({ task: task, resolve: resolve, reject: reject, source: sourceKey(metadata.source), priority: numberOr(metadata.priority, 0), sequence: sequence++ });
        queue.sort(function (a, b) { return b.priority - a.priority || a.sequence - b.sequence; });
        drain();
      });
    }
    function stats() {
      var now = clock();
      prune(now);
      var bySource = {};
      Object.keys(sourceStarts).forEach(function (key) { bySource[key] = sourceStarts[key].length; });
      return { active: active, queued: queue.length, startsInWindow: starts.length, startsBySource: bySource, maxConcurrent: maxConcurrent, maxStartsPerWindow: maxStartsPerWindow, maxStartsPerSource: maxStartsPerSource, windowMs: windowMs };
    }
    return { run: run, stats: stats };
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
    // Null-prototype registry: arbitrary source labels such as "__proto__" must remain ordinary
    // independent keys instead of resolving to Object.prototype.
    var sources = Object.create(null);
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
      var weight = boundedWeight(component && component.weight);
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
   * Coverage honesto de derivativos (UX-001/REV-CC-01): status POR METRICA em vez de um OR
   * com rotulo estatico. `scoreable` e o objeto ja filtrado por elegibilidade (so metricas
   * vivas sao finitas). Estado: 'ok' quando as 4 metricas centrais (OI, funding, L/S, taker)
   * estao vivas; 'partial' quando pelo menos uma metrica esta viva; 'none' caso contrario.
   */
  var DERIVATIVE_COVERAGE_METRICS = [
    { key: 'oiChangePct', label: 'OI', core: true },
    { key: 'fundingAvg', label: 'funding', core: true },
    { key: 'longShortRatio', label: 'L/S', core: true },
    { key: 'takerRatio', label: 'taker', core: true },
    { key: 'topPositionRatio', label: 'top traders', core: false },
    { key: 'basisRate', label: 'basis', core: false }
  ];

  /**
   * Identidade do snapshot de inputs (ANL-001/REV-CC-01). Extraida do app para ser testavel:
   * mesmo estado de inputs -> mesmo id; qualquer input que dirige score (incluindo book e
   * liquidacoes via inputComponents) diferente -> id diferente. Tempo de calculo fica fora.
   */
  function datasetInputStamp(dataset) {
    if (!dataset) return 'na';
    var observed = toTimestampMs(dataset.observedAt);
    if (isFiniteNumber(observed)) return String(observed);
    var fetched = toTimestampMs(dataset.fetchedAt);
    return isFiniteNumber(fetched) ? 'f' + fetched : 'na';
  }

  function buildInputSnapshotId(spec) {
    var source = spec && typeof spec === 'object' ? spec : {};
    var historyObserved = source.history ? toTimestampMs(source.history.observedAt) : null;
    return [
      source.modelVersion,
      source.rulesetHash,
      source.symbol,
      source.interval,
      source.signalCloseTime || 0,
      'drv' + datasetInputStamp(source.derivativeDetail),
      'cm' + datasetInputStamp(source.coinMetrics),
      'opt' + datasetInputStamp(source.options),
      'etf' + datasetInputStamp(source.institutional),
      'ext' + (source.externalFetchedAt || 'na'),
      'news' + (source.newsFetchedAt || 'na'),
      'mode' + source.newsMode,
      'override' + (source.newsOverrideAt || 'na'),
      'mtf' + (source.mtfStamp || 'na'),
      'hist' + (isFiniteNumber(historyObserved) ? historyObserved : 'na'),
      'inputs' + stableHash(source.inputComponents)
    ].join(':');
  }

  /**
   * Formatacao de timestamp com fuso EXPLICITO (UX-005/REV-CC-01). Todos os timestamps
   * exibidos devem passar por aqui com o mesmo timeZone do rotulo do header; sem isso a
   * virada de dia perto da meia-noite fica ambigua entre UTC e o fuso local.
   */
  function formatDisplayTimestamp(value, timeZone, style) {
    var ms = toFiniteNumber(value);
    if (ms === null) return '--';
    var styles = {
      time: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
      short: { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' },
      date: { day: '2-digit', month: '2-digit', year: 'numeric' },
      full: { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }
    };
    var options = styles[style] || styles.full;
    try {
      if (timeZone) options = Object.assign({ timeZone: timeZone }, options);
      return new Intl.DateTimeFormat('pt-BR', options).format(new Date(ms));
    } catch (error) {
      // timeZone invalido: melhor exibir no fuso local do que quebrar o render.
      return new Intl.DateTimeFormat('pt-BR', styles[style] || styles.full).format(new Date(ms));
    }
  }

  function derivativeCoverage(scoreable) {
    var source = scoreable && typeof scoreable === 'object' ? scoreable : {};
    var live = DERIVATIVE_COVERAGE_METRICS.filter(function (metric) { return isFiniteNumber(source[metric.key]); });
    var missing = DERIVATIVE_COVERAGE_METRICS.filter(function (metric) { return !isFiniteNumber(source[metric.key]); });
    var coreLive = DERIVATIVE_COVERAGE_METRICS.filter(function (metric) { return metric.core; })
      .every(function (metric) { return isFiniteNumber(source[metric.key]); });
    var state = coreLive ? 'ok' : live.length ? 'partial' : 'none';
    var label = state === 'none'
      ? 'sem leitura'
      : live.map(function (metric) { return metric.label; }).join(', ');
    if (state === 'partial') label += ' | faltam: ' + missing.filter(function (metric) { return metric.core; }).map(function (metric) { return metric.label; }).join(', ');
    return { state: state, label: label, liveMetrics: live.map(function (metric) { return metric.key; }), missingMetrics: missing.map(function (metric) { return metric.key; }) };
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
   * more), scaled to the configured setup cap. Alignment counts ONLY the timeframes aligned WITH the
   * tentative bias direction — max(positive, negative) was direction-blind and could report the
   * OPPOSITE majority as confirmation exactly at trend turns.
   */
  var MTF_WEIGHTS = { '1s': 0.02, '1m': 0.04, '3m': 0.05, '5m': 0.06, '15m': 0.10, '30m': 0.12, '1h': 0.16, '2h': 0.18, '4h': 0.22, '6h': 0.23, '8h': 0.24, '12h': 0.25, '1d': 0.28, '3d': 0.30, '1w': 0.34, '1M': 0.36 };
  function aggregateMultiTimeframe(rows) {
    var canonical = new Map();
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (!row || !Object.prototype.hasOwnProperty.call(MTF_WEIGHTS, row.interval)) return;
      var score = toFiniteNumber(row.score);
      if (score === null) return;
      canonical.set(row.interval, { interval: row.interval, score: Math.max(-50, Math.min(50, score)) });
    });
    var list = Array.from(canonical.values());
    var weighted = 0, weightTotal = 0, positive = 0, negative = 0;
    list.forEach(function (row) {
      var weight = MTF_WEIGHTS[row.interval];
      weighted += (row.score / 50) * weight;
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
    var maxWeight = rows.reduce(function (maximum, row) { return Math.max(maximum, row.weight); }, 0);
    rows.forEach(function (row) { row.normalizedWeight = row.weight / maxWeight; });
    var total = rows.reduce(function (sum, row) { return sum + row.normalizedWeight; }, 0);
    var cumulative = 0;
    for (var j = 0; j < rows.length; j++) {
      cumulative += rows[j].normalizedWeight;
      if (cumulative >= total / 2) return rows[j].value;
    }
    return rows[rows.length - 1].value;
  }

  function findOpenFairValueGap(candles, lookback) {
    var rows = (Array.isArray(candles) ? candles : []).filter(finiteCandle).slice(-Math.max(3, numberOr(lookback, 60)));
    for (var index = rows.length - 1; index >= 2; index -= 1) {
      var older = rows[index - 2];
      var created = rows[index];
      var gap = null;
      if (created.low > older.high) gap = { type: 'bullish', low: older.high, high: created.low, time: created.time };
      else if (created.high < older.low) gap = { type: 'bearish', low: created.high, high: older.low, time: created.time };
      if (!gap) continue;
      var later = rows.slice(index + 1);
      var filled = gap.type === 'bullish'
        ? later.some(function (candle) { return candle.low <= gap.low; })
        : later.some(function (candle) { return candle.high >= gap.high; });
      if (!filled) return gap;
    }
    return null;
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
    var mean = average(volumes);
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
      if (i < period - 1) { squeezeOn.push(false); bandwidths.push(null); continue; }
      var window = closes.slice(i - period + 1, i + 1);
      var mean = average(window);
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

  function normalizeSignalMachineState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    var lastCloseTime = toFiniteNumber(value.lastCloseTime);
    if (value.phase === 'FLAT') return lastCloseTime === null ? null : { phase: 'FLAT', lastCloseTime: lastCloseTime };
    if (value.phase !== 'ACTIVE' || (value.side !== 'long' && value.side !== 'short')) return null;
    var numericFields = ['entryPrice', 'stopPrice', 'targetPrice', 'entryTime', 'entryScore', 'maxBars', 'barsHeld', 'maePct', 'mfePct', 'lastCloseTime'];
    var numeric = {};
    for (var index = 0; index < numericFields.length; index += 1) {
      var field = numericFields[index];
      numeric[field] = toFiniteNumber(value[field]);
      if (numeric[field] === null) return null;
    }
    if (typeof value.symbol !== 'string' || !value.symbol || typeof value.interval !== 'string' || !value.interval) return null;
    if (numeric.entryPrice <= 0 || numeric.stopPrice <= 0 || numeric.targetPrice <= 0 || numeric.maxBars <= 0 || numeric.barsHeld < 0) return null;
    if (value.side === 'long' && !(numeric.stopPrice < numeric.entryPrice && numeric.targetPrice > numeric.entryPrice)) return null;
    if (value.side === 'short' && !(numeric.stopPrice > numeric.entryPrice && numeric.targetPrice < numeric.entryPrice)) return null;
    return Object.assign({}, value, numeric, { phase: 'ACTIVE', side: value.side });
  }

  function normalizeSignalMachineMap(value) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var output = Object.create(null);
    Object.keys(source).forEach(function (key) {
      var normalized = normalizeSignalMachineState(source[key]);
      if (normalized) output[key] = normalized;
    });
    return output;
  }

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
      var longRr = (target - close) / (close - stop);
      if (!(stop > 0 && stop < close && target > close) || !isFiniteNumber(stop) || !isFiniteNumber(target) || !isFiniteNumber(longRr)) return null;
      return { stop: stop, target: target, rr: longRr };
    }
    var shortStop = resistances.length ? resistances[0] + 0.15 * atr : close + 1.5 * atr;
    var shortTarget = null;
    for (var j = 0; j < supports.length; j++) if (supports[j] <= close - atr) { shortTarget = supports[j]; break; }
    if (shortTarget === null) shortTarget = close - 2 * atr;
    var shortRr = (close - shortTarget) / (shortStop - close);
    if (!(shortStop > close && shortTarget > 0 && shortTarget < close) || !isFiniteNumber(shortStop) || !isFiniteNumber(shortTarget) || !isFiniteNumber(shortRr)) return null;
    return { stop: shortStop, target: shortTarget, rr: shortRr };
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
    var open = toFiniteNumber(snapshot.open);
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
      // Conservative: stop first when stop and target print in the same candle. A gap through the
      // stop fills at the opening print; intrabar touches fill at the stop level.
      var stopFill = state.side === 'long'
        ? (open !== null && open < state.stopPrice ? open : state.stopPrice)
        : (open !== null && open > state.stopPrice ? open : state.stopPrice);
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

  /** Canonical timeframe coverage ignores duplicates and extra/local rows. */
  function timeframeCoverage(rows, expectedIntervals) {
    var expected = Array.isArray(expectedIntervals) ? expectedIntervals : [];
    var seen = new Set((Array.isArray(rows) ? rows : []).map(function (row) { return row && row.interval; }).filter(Boolean));
    var available = expected.filter(function (interval) { return seen.has(interval); });
    return {
      available: available.length,
      expected: expected.length,
      ratio: expected.length ? available.length / expected.length : 0,
      missing: expected.filter(function (interval) { return !seen.has(interval); })
    };
  }

  /** Pure setup decision ladder shared by UI and tests. HTF availability gates every entry. */
  function setupDecision(input) {
    input = input || {};
    var total = numberOr(input.total, 0);
    var quality = numberOr(input.quality, 0);
    var multiScore = numberOr(input.multiScore, 0);
    var alignment = numberOr(input.alignment, 0);
    var bias = input.multiBias || 'Misto';
    var htfAvailable = input.htfAvailable === true;
    var htfVetoLong = input.htfVetoLong === true;
    var htfVetoShort = input.htfVetoShort === true;
    var trapVeto = input.trapVeto || null;
    var trapBarsLeft = Math.max(0, Math.floor(numberOr(input.trapBarsLeft, 0)));
    var result = { decision: 'Sem entrada clara', tone: 'wait' };

    if (total >= 60 && bias === 'Alta' && alignment >= 0.6 && quality >= 63 && htfAvailable && !htfVetoLong) result = { decision: 'Entrada favoravel', tone: 'long' };
    else if (total <= -60 && bias === 'Baixa' && alignment >= 0.6 && quality >= 63 && htfAvailable && !htfVetoShort) result = { decision: 'Entrada vendedora favoravel', tone: 'short' };
    else if (total >= 42 && htfAvailable && multiScore >= 0 && !htfVetoLong) result = { decision: 'Entrada com confirmacao', tone: 'long' };
    else if (total <= -42 && htfAvailable && multiScore <= 0 && !htfVetoShort) result = { decision: 'Entrada vendedora com confirmacao', tone: 'short' };
    else if (total >= 42 && !htfAvailable) result = { decision: 'Gate HTF: 1d+1w indisponiveis', tone: 'wait' };
    else if (total <= -42 && !htfAvailable) result = { decision: 'Gate HTF: 1d+1w indisponiveis', tone: 'wait' };
    else if (total >= 42 && htfVetoLong) result = { decision: 'Gate HTF: 1d+1w baixistas vetam long', tone: 'wait' };
    else if (total <= -42 && htfVetoShort) result = { decision: 'Gate HTF: 1d+1w altistas vetam short', tone: 'wait' };
    else if (total >= 20) result = { decision: 'Aguardar pullback', tone: 'wait' };
    else if (total <= -20) result = { decision: 'Cautela', tone: 'avoid' };

    if (result.tone === 'long' && trapVeto === 'long') result = { decision: 'Veto pos-trap: aguardar ' + trapBarsLeft + ' barra(s)', tone: 'wait' };
    if (result.tone === 'short' && trapVeto === 'short') result = { decision: 'Veto pos-trap: aguardar ' + trapBarsLeft + ' barra(s)', tone: 'wait' };
    if (quality < 40) result = { decision: 'Dados insuficientes', tone: 'wait' };
    return result;
  }

  function calculateDerivativeDetailContribution(input) {
    input = input || {};
    var asOf = toFiniteNumber(input.asOf);
    if (asOf === null) asOf = Date.now();
    var detail = resolveDatasetFreshness(input.detail, asOf).eligibleForScore ? input.detail : {};
    var options = resolveDatasetFreshness(input.options, asOf).eligibleForScore ? input.options : {};
    // Price direction must match the OI window. If the candle series does not cover that start
    // (for example 500 x 1s versus 30 x 5m OI), the quadrant is intentionally unavailable.
    var oiPriceChangePct = toFiniteNumber(input.oiPriceChangePct);
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

  var SOURCE_REGISTRY_VERSION = '1.0.0-preview.7-codex.2';
  function sourceRecord(sourceId, provider, endpoint, metrics, unit, validator, scope, observedAtPolicy, staleAfterMs, primary, fallbacks, provenanceFactor, cachePolicy, unavailablePolicy, scoreEligible) {
    return {
      sourceId: sourceId,
      provider: provider,
      endpoint: endpoint,
      metrics: metrics,
      unit: unit,
      validator: validator,
      scope: scope,
      observedAtPolicy: observedAtPolicy,
      staleAfterMs: staleAfterMs,
      primary: primary,
      fallbacks: fallbacks,
      provenanceFactor: provenanceFactor,
      cachePolicy: cachePolicy,
      unavailablePolicy: unavailablePolicy,
      scoreEligible: scoreEligible
    };
  }

  /** Normative source contract for every live, historical and manual input consumed by the desk. */
  var SOURCE_REGISTRY = {
    'binance-spot-klines': sourceRecord('binance-spot-klines', 'Binance Spot', 'https://data-api.binance.vision/api/v3/klines', ['open', 'high', 'low', 'close', 'volume', 'takerBuy', 'trades'], 'quote asset / base asset / count', 'normalizeKlines', 'symbol+timeframe', 'exchange closeTime of the last closed candle', 600000, true, ['https://api.binance.com/api/v3/klines'], 1, 'no-store; in-memory snapshot', 'component missing; never fabricate candles', true),
    'binance-spot-ticker': sourceRecord('binance-spot-ticker', 'Binance Spot', 'https://data-api.binance.vision/api/v3/ticker/24hr', ['lastPrice', 'priceChangePercent', 'quoteVolume'], 'USDT / percent / USDT', 'strictFiniteMarketRow', 'symbol', 'provider closeTime when present; otherwise fetchedAt marked as proxy', 120000, true, ['https://api.binance.com/api/v3/ticker/24hr'], 0.95, 'no-store; board cache 60s', 'market row unavailable', true),
    'binance-spot-depth': sourceRecord('binance-spot-depth', 'Binance Spot', 'https://data-api.binance.vision/api/v3/depth', ['bidQty', 'askQty', 'spreadBps', 'slippageBps', 'bookImbalance'], 'base asset / basis points / ratio', 'normalizeOrderBook', 'symbol', 'fetchedAt marked as order-book snapshot', 60000, true, ['https://api.binance.com/api/v3/depth'], 0.9, 'no-store; selected-symbol memory only', 'flow coverage reduced', true),
    'binance-futures': sourceRecord('binance-futures', 'Binance Futures', 'https://fapi.binance.com/fapi/v1 and /futures/data', ['funding', 'basis', 'openInterest', 'longShortRatio', 'takerRatio'], 'rate / percent / contracts / ratio', 'normalizeDerivativeDetail', 'symbol+timeframe', 'maximum valid upstream timestamp per subseries', 90000, true, [], 0.95, 'no-store; selected-symbol memory 15s', 'derivatives component partial or missing', true),
    'deribit-options': sourceRecord('deribit-options', 'Deribit', '/api/options -> https://www.deribit.com/api/v2/public', ['dvol', 'putCallOi', 'putCallVolume', 'atmIv', 'expectedMove'], 'IV percent / contracts / percent', 'normalizeOptionsPayload', 'BTC or ETH currency', 'upstream timestamp; fetchedAt never substitutes missing observation', 300000, true, [], 0.95, 'server 30s; client 60s', 'options subcomponent unavailable with partial errors', true),
    'coinmetrics-community': sourceRecord('coinmetrics-community', 'Coin Metrics Community', 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics', ['AdrActCnt', 'TxCnt', 'TxTfrValAdjUSD', 'FeeTotUSD', 'SplyAct1yrPct', 'exchangeFlow'], 'count / USD / percent', 'normalizeCoinMetrics', 'native asset', 'provider time field', 172800000, true, [], 1, 'no-store; asset memory 15m', 'on-chain coverage reduced', true),
    'defillama': sourceRecord('defillama', 'DefiLlama', 'https://api.llama.fi and https://stablecoins.llama.fi', ['chainTvl', 'protocolTvl', 'stablecoinSupply', 'dexVolume', 'fees', 'openInterest'], 'USD', 'normalizeDefiLlamaContext', 'chain+protocol+market', 'upstream timestamp when available; otherwise fetchedAt explicitly proxied', 600000, true, [], 0.85, 'server/client short cache', 'fundamental context partial', true),
    'mempool-space': sourceRecord('mempool-space', 'mempool.space', 'https://mempool.space/api', ['recommendedFees', 'mempoolBytes', 'mempoolTransactions', 'tipHeight'], 'sat/vB / bytes / count / block', 'bitcoinMempoolContext', 'Bitcoin network', 'fetchedAt marked as proxy snapshot', 300000, false, [], 0.65, 'no-store; selected asset memory', 'Bitcoin proxy omitted', true),
    'coingecko-market': sourceRecord('coingecko-market', 'CoinGecko', '/api/market -> https://api.coingecko.com/api/v3', ['globalMarketCap', 'btcDominance', 'assetPrice', 'assetReturns', 'trending'], 'USD / percent', 'normalizeCoinGeckoMarket', 'market+asset', 'provider last_updated per asset/global response', 600000, true, ['coinpaprika-market'], 0.95, 'server cache 60s; client 120s', 'market response may be partial', true),
    'coinpaprika-market': sourceRecord('coinpaprika-market', 'CoinPaprika', '/api/market and /v1/global', ['assetPrice', 'assetReturns', 'marketCap', 'btcDominance'], 'USD / percent', 'normalizeCoinPaprikaMarket', 'market+asset', 'provider last_updated', 600000, false, [], 0.85, 'server cache 60s; client 120s', 'used only as declared market fallback', true),
    'alternative-me': sourceRecord('alternative-me', 'Alternative.me', 'https://api.alternative.me/fng', ['fearGreedValue'], 'index 0-100', 'normalizeFearGreed', 'crypto market', 'provider timestamp', 86400000, true, [], 0.8, 'client context cache 120s', 'sentiment input unavailable', true),
    'us-treasury-yields': sourceRecord('us-treasury-yields', 'US Treasury', '/api/macro -> home.treasury.gov XML', ['yield2y', 'yield10y', 'yield30y', 'curve10y2y'], 'percent / percentage points', 'parseTreasuryXml', 'US macro', 'record date from official curve', 345600000, true, [], 1, 'server cache 1h; client 120s', 'macro rates partial', true),
    'cboe-vix': sourceRecord('cboe-vix', 'Cboe', '/api/macro -> cdn.cboe.com VIX_History.csv', ['vixClose', 'vixChange'], 'index points / percent', 'parseVixCsv', 'US macro', 'official row date', 345600000, true, [], 1, 'server cache 1h; client 120s', 'volatility input unavailable', true),
    'tradfi-yahoo': sourceRecord('tradfi-yahoo', 'Yahoo Finance', '/api/tradfi -> query1.finance.yahoo.com/v8/finance/chart', ['close', 'dailyReturn', 'relativeReturn'], 'USD / percent', 'normalizeYahooChart', 'declared TradFi symbol', 'provider chart timestamp', 345600000, false, [], 0.75, 'server cache 15m; client 120s', 'TradFi context omitted', true),
    'rss-news': sourceRecord('rss-news', 'Google News, CoinDesk and Decrypt RSS', '/api/news -> declared RSS allowlist', ['headline', 'publishedAt', 'keywordSentiment', 'assetRelevance'], 'text / timestamp / score', 'parseAndSanitizeRss', 'market+asset', 'RSS publication timestamp; future items rejected', 129600000, true, [], 0.8, 'server cache 5m; client 5m', 'automatic news score uses only remaining fresh sources', true),
    'manual-user-session': sourceRecord('manual-user-session', 'Local authenticated operator context', 'browser session form', ['newsMacroOverride', 'author', 'reason', 'overrideAt'], 'categorical / text / timestamp', 'requireManualOverrideAuditFields', 'current browser session', 'explicit application timestamp', 0, false, [], 0.6, 'snapshot/export only; not persisted silently', 'manual mode cannot activate', true),
    'cryptoetf-public': sourceRecord('cryptoetf-public', 'CryptoETF public MCP', '/api/institutional -> https://mcp.cryptoetf.today/api/mcp', ['dailyNetFlow', 'reported', 'reportReason'], 'USD millions / boolean / categorical', 'normalizeEtfFlows', 'BTC or ETH fund complex', 'provider date plus reported flag/session calendar', 345600000, true, [], 0.9, 'server cache 5m; client 5m', 'ETF term excluded from score', true),
    'binance-daily-history': sourceRecord('binance-daily-history', 'Binance Spot', 'https://data-api.binance.vision/api/v3/klines?interval=1d', ['regimeFeatures', 'forwardReturns', 'similarSamples'], 'normalized score / percent / count', 'buildHistoricalProfile', 'symbol', 'last closed daily candle', 172800000, true, ['https://api.binance.com/api/v3/klines?interval=1d'], 0.9, 'versioned localStorage; refresh 6h', 'history component unavailable, never neutralized as evidence', true),
    'binance-liquidations': sourceRecord('binance-liquidations', 'Binance Futures WebSocket', 'wss://fstream.binance.com/ws/!forceOrder@arr', ['liquidationSide', 'notional', 'eventTime'], 'categorical / USDT / timestamp', 'normalizeLiquidationEvent', 'selected symbol', 'exchange event time', 60000, true, [], 0.95, 'rolling in-memory window', 'risk term omitted', true),
    'binance-aggtrades': sourceRecord('binance-aggtrades', 'Binance Spot', '/api/market-microstructure -> /api/v3/aggTrades', ['tradePrice', 'tradeQty', 'buyerMaker', 'tradeTime'], 'USDT / base asset / boolean / timestamp', 'normalizeAggTrades', 'symbol', 'exchange trade time', 60000, true, [], 0.9, 'server request snapshot; client 15s', 'microstructure panel partial', false),
    'cross-venue-quotes': sourceRecord('cross-venue-quotes', 'Binance, Coinbase, Bybit and OKX', '/api/market-microstructure', ['bid', 'ask', 'mid', 'venueSpread', 'usdtUsdBasis'], 'USD or USDT / basis points', 'normalizeVenueQuotes', 'symbol+venue', 'observedAt per venue; fetchedAt marked separately', 60000, true, [], 0.75, 'server request snapshot; client 15s', 'informational panel partial', false),
    'cftc-legacy': sourceRecord('cftc-legacy', 'CFTC Public Reporting', '/api/institutional -> publicreporting.cftc.gov/resource/6dca-aqww.json', ['dealerLong', 'dealerShort', 'assetManagerLong', 'leveragedFundsLong'], 'contracts', 'normalizeCftcLegacy', 'CME Bitcoin futures', 'official report date', 1209600000, false, [], 0.8, 'server cache 5m; client 5m', 'informational institutional row omitted', false)
  };

  function validateSourceRegistry(registry) {
    var errors = [];
    var requiredStrings = ['sourceId', 'provider', 'endpoint', 'unit', 'validator', 'scope', 'observedAtPolicy', 'cachePolicy', 'unavailablePolicy'];
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return ['registry must be an object'];
    Object.keys(registry).forEach(function (key) {
      var source = registry[key];
      if (!source || typeof source !== 'object' || Array.isArray(source)) { errors.push(key + ': entry must be an object'); return; }
      if (source.sourceId !== key || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) errors.push(key + ': invalid sourceId');
      requiredStrings.forEach(function (field) { if (typeof source[field] !== 'string' || !source[field].trim()) errors.push(key + ': invalid ' + field); });
      if (!Array.isArray(source.metrics) || !source.metrics.length || source.metrics.some(function (metric) { return typeof metric !== 'string' || !metric; })) errors.push(key + ': invalid metrics');
      if (!Array.isArray(source.fallbacks) || source.fallbacks.some(function (fallback) { return typeof fallback !== 'string' || !fallback; })) errors.push(key + ': invalid fallbacks');
      if (!isFiniteNumber(source.staleAfterMs) || source.staleAfterMs < 0) errors.push(key + ': invalid staleAfterMs');
      if (!isFiniteNumber(source.provenanceFactor) || source.provenanceFactor < 0 || source.provenanceFactor > 1) errors.push(key + ': invalid provenanceFactor');
      ['primary', 'scoreEligible'].forEach(function (field) { if (typeof source[field] !== 'boolean') errors.push(key + ': invalid ' + field); });
    });
    return errors;
  }

  /**
   * Model ruleset registry: weights, caps and thresholds for 1.0.0-preview.7-codex.2.
   * rulesetVersion must be bumped whenever any scoring rule changes (including the semantics
   * encoded in the contribution functions above) so rulesetHash distinguishes model revisions.
   */
  var RULESET = {
    modelId: 'crypto-live-desk-analytics',
    rulesetVersion: '1.0.0-preview.7-codex.2',
    sourceRegistryVersion: SOURCE_REGISTRY_VERSION,
    sourceRegistry: SOURCE_REGISTRY,
    radarWeights: { technical: 30, flow: 15, derivatives: 10, fundamental: 15, macroNews: 10, history: 15, momentum24h: 5 },
    // multiTimeframe 24->16: o MTF virou gate (1d+1w vetam entradas) e o agregado exclui o TF
    // do grafico, entao o peso de score cai para reduzir o triple-counting de tendencia.
    // risk 10->14: risco agora carrega trap/climax/liquidacoes com mais alcance.
    setupCaps: { technical: 20, multiTimeframe: 16, smartFlow: 18, derivatives: 12, chainFundamental: 10, newsMacro: 10, history: 12, risk: 14 },
    intervalMilliseconds: { '1s': 1000, '1m': 60000, '3m': 180000, '5m': 300000, '15m': 900000, '30m': 1800000, '1h': 3600000, '2h': 7200000, '4h': 14400000, '6h': 21600000, '8h': 28800000, '12h': 43200000, '1d': 86400000, '3d': 259200000, '1w': 604800000, '1M': 2592000000 },
    signalSummary: { neutralMaxAbsReturn24hPct: 1.5, bands: [
      { name: '>= +60', min: 60, max: 101 },
      { name: '+42 a +59', min: 42, max: 60 },
      { name: '+20 a +41', min: 20, max: 42 },
      { name: '-19 a +19', min: -19, max: 20 },
      { name: '-41 a -20', min: -41, max: -19 },
      { name: '-59 a -42', min: -59, max: -41 },
      { name: '<= -60', min: -101, max: -59 }
    ] },
    alertScoreThresholds: [60, 42, -42, -60],
    radarBias: { bull: 35, bear: -35 },
    newsRelevance: { assetSpecific: 1.35, macro: 0.75, crypto: 0.9, generic: 0.55 },
    flowMinCoverage: 0.5,
    netflowMinCoverageDays: 5,
    protocolMinTvl: 1000000,
    clockSkewToleranceMs: 60000
  };

  function scoringImplementationSources(extraImplementation) {
    var extras = Array.isArray(extraImplementation) ? extraImplementation : [];
    // Hash the complete core artifact so a transitive helper change cannot slip past the hash
    // merely because the top-level scorer's function body still calls the same helper name.
    return [analyticsCoreFactory].concat(extras).map(function (implementation) {
      return typeof implementation === 'function' ? Function.prototype.toString.call(implementation) : String(implementation);
    });
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    var output = {};
    Object.keys(value).sort().forEach(function (key) { output[key] = canonicalize(value[key]); });
    return output;
  }

  function hashText(text) {
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

  /** Data-only deterministic hash; unlike rulesetHash it intentionally excludes implementation. */
  function stableHash(value) {
    return hashText(JSON.stringify(canonicalize(value)));
  }

  /**
   * Produces a JSON-only copy for durable evidence. Non-finite numbers have no
   * representation in JSON, so they are made explicit as null instead of being
   * silently changed later by JSON.stringify. Circular values fail closed.
   */
  function jsonEvidenceClone(value) {
    if (value === undefined) return null;
    var serialized = JSON.stringify(value, function (_key, item) {
      if (typeof item === 'number' && !Number.isFinite(item)) return null;
      if (typeof item === 'function' || typeof item === 'symbol' || item === undefined) return null;
      return item;
    });
    if (serialized === undefined) return null;
    return JSON.parse(serialized);
  }

  function evidenceArrayItemCount(value) {
    if (Array.isArray(value)) {
      return value.length + value.reduce(function (sum, item) { return sum + evidenceArrayItemCount(item); }, 0);
    }
    if (!value || typeof value !== 'object') return 0;
    return Object.keys(value).reduce(function (sum, key) { return sum + evidenceArrayItemCount(value[key]); }, 0);
  }

  function rawEvidenceHashMaterial(envelope) {
    return {
      schemaVersion: envelope.schemaVersion,
      capturedAt: envelope.capturedAt,
      modelVersion: envelope.modelVersion,
      rulesetHash: envelope.rulesetHash,
      inputSnapshotId: envelope.inputSnapshotId,
      datasets: envelope.datasets,
      manifest: envelope.manifest
    };
  }

  /**
   * Builds an immutable, self-checking envelope of the normalized raw inputs
   * used by one analytic snapshot. Each dataset carries its normative source
   * ids, observation time and payload; the manifest and envelope hashes make a
   * post-export mutation detectable after a JSON round trip.
   */
  function buildRawEvidenceEnvelope(input) {
    input = input || {};
    var capturedAt = toFiniteNumber(input.capturedAt);
    if (capturedAt === null || capturedAt < 0) throw new TypeError('raw evidence capturedAt must be a non-negative finite timestamp');
    if (!input.datasets || typeof input.datasets !== 'object' || Array.isArray(input.datasets)) throw new TypeError('raw evidence datasets must be an object');
    var datasets = {};
    Object.keys(input.datasets).sort().forEach(function (name) {
      var descriptor = input.datasets[name];
      if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) throw new TypeError('raw evidence dataset ' + name + ' must be an object');
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'payload')) throw new TypeError('raw evidence dataset ' + name + ' is missing payload');
      var sourceIds = Array.isArray(descriptor.sourceIds) ? descriptor.sourceIds.filter(function (sourceId, index, rows) {
        return typeof sourceId === 'string' && !!SOURCE_REGISTRY[sourceId] && rows.indexOf(sourceId) === index;
      }).sort() : [];
      if (!sourceIds.length) throw new TypeError('raw evidence dataset ' + name + ' requires a registered source id');
      var observedAt = toFiniteNumber(descriptor.observedAt);
      datasets[name] = {
        sourceIds: sourceIds,
        observedAt: observedAt === null ? null : observedAt,
        payload: jsonEvidenceClone(descriptor.payload)
      };
    });
    if (!Object.keys(datasets).length) throw new TypeError('raw evidence requires at least one dataset');
    var manifest = Object.keys(datasets).map(function (name) {
      var dataset = datasets[name];
      return {
        name: name,
        sourceIds: dataset.sourceIds.slice(),
        observedAt: dataset.observedAt,
        arrayItemCount: evidenceArrayItemCount(dataset.payload),
        canonicalChars: JSON.stringify(canonicalize(dataset)).length,
        hash: stableHash(dataset)
      };
    });
    var envelope = {
      schemaVersion: 1,
      capturedAt: capturedAt,
      modelVersion: input.modelVersion || null,
      rulesetHash: input.rulesetHash || null,
      inputSnapshotId: input.inputSnapshotId || null,
      datasets: datasets,
      manifest: manifest
    };
    envelope.envelopeHash = stableHash(rawEvidenceHashMaterial(envelope));
    return deepFreeze(envelope);
  }

  function verifyRawEvidenceEnvelope(envelope) {
    var errors = [];
    if (!envelope || typeof envelope !== 'object') return { valid: false, errors: ['envelope ausente'] };
    if (envelope.schemaVersion !== 1) errors.push('schemaVersion invalido');
    if (toFiniteNumber(envelope.capturedAt) === null) errors.push('capturedAt invalido');
    var datasets = envelope.datasets && typeof envelope.datasets === 'object' && !Array.isArray(envelope.datasets) ? envelope.datasets : null;
    var manifest = Array.isArray(envelope.manifest) ? envelope.manifest : null;
    if (!datasets) errors.push('datasets ausente');
    if (!manifest) errors.push('manifest ausente');
    if (datasets && manifest) {
      var names = Object.keys(datasets).sort();
      var manifestNames = manifest.map(function (row) { return row && row.name; });
      if (manifestNames.join('|') !== names.join('|')) errors.push('manifest nao cobre exatamente os datasets');
      manifest.forEach(function (row) {
        if (!row || !datasets[row.name]) return;
        var dataset = datasets[row.name];
        if (stableHash(dataset) !== row.hash) errors.push('hash divergente em ' + row.name);
        if (evidenceArrayItemCount(dataset.payload) !== row.arrayItemCount) errors.push('contagem divergente em ' + row.name);
        if (JSON.stringify(canonicalize(dataset)).length !== row.canonicalChars) errors.push('tamanho canonico divergente em ' + row.name);
        var sourceIds = Array.isArray(dataset.sourceIds) ? dataset.sourceIds : [];
        if (!sourceIds.length || sourceIds.some(function (sourceId) { return !SOURCE_REGISTRY[sourceId]; })) errors.push('fonte invalida em ' + row.name);
      });
    }
    if (typeof envelope.envelopeHash !== 'string' || stableHash(rawEvidenceHashMaterial(envelope)) !== envelope.envelopeHash) errors.push('envelopeHash divergente');
    return { valid: errors.length === 0, errors: errors };
  }

  /** Deterministic FNV-1a hash of declarative rules AND scoring implementation sources. */
  function rulesetHash(ruleset, extraImplementation) {
    var text = JSON.stringify(canonicalize({
      ruleset: ruleset === undefined ? RULESET : ruleset,
      implementation: scoringImplementationSources(extraImplementation)
    }));
    return hashText(text);
  }

  function intervalToMilliseconds(interval) {
    return RULESET.intervalMilliseconds[interval] || null;
  }

  function upsertTrapVeto(registry, key, direction, lastCloseTime, vetoBars, interval) {
    var output = registry && typeof registry === 'object' && !Array.isArray(registry) ? Object.assign({}, registry) : {};
    var closeTime = toFiniteNumber(lastCloseTime);
    var bars = toFiniteNumber(vetoBars);
    var duration = intervalToMilliseconds(interval);
    if (!key || (direction !== 'long' && direction !== 'short') || closeTime === null || bars === null || bars <= 0 || duration === null) return output;
    var existing = output[key];
    var until = closeTime + bars * duration;
    if (!existing || existing.direction !== direction || closeTime >= existing.until) output[key] = { direction: direction, until: until };
    return output;
  }

  function activeTrapVeto(registry, key, referenceTime) {
    var veto = registry && registry[key];
    var reference = toFiniteNumber(referenceTime);
    if (!veto || (veto.direction !== 'long' && veto.direction !== 'short') || !isFiniteNumber(veto.until) || reference === null) return null;
    return reference < veto.until ? veto.direction : null;
  }

  function trapVetoBarsLeft(registry, key, referenceTime, interval) {
    var veto = registry && registry[key];
    var reference = toFiniteNumber(referenceTime);
    var duration = intervalToMilliseconds(interval);
    if (!veto || !isFiniteNumber(veto.until) || reference === null || duration === null) return 0;
    return Math.max(0, Math.ceil((veto.until - reference) / duration));
  }

  function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
    return Object.freeze(value);
  }

  deepFreeze(SOURCE_REGISTRY);
  deepFreeze(RULESET);

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

  /** Validates (but never fabricates) the observation timestamp used for freshness. */
  function resolveObservedAt(dataTimestamp, fetchedAt, maxSkewMs) {
    var fetched = toFiniteNumber(fetchedAt);
    var data = toFiniteNumber(dataTimestamp);
    var skew = numberOr(maxSkewMs, RULESET.clockSkewToleranceMs);
    if (data === null) return { observedAt: null, provenance: 'missing' };
    if (fetched !== null && data > fetched + skew) return { observedAt: data, provenance: 'invalid' };
    return { observedAt: data, provenance: 'data' };
  }

  /**
   * Aggregates weighted radar parts. With no available weight the result is
   * null/unavailable instead of a fabricated neutral zero. Data confidence is
   * graded: each part contributes weight x quality (0-1), not a binary flag.
   */
  function aggregateRadarParts(parts) {
    var rows = Array.isArray(parts) ? parts : [];
    var normalizedRows = rows.map(function (part) {
      var value = toFiniteNumber(part && part.value);
      var weight = boundedWeight(part && part.weight);
      var available = !!(part && part.available === true && value !== null && weight > 0);
      return {
        name: part && part.name,
        value: value === null ? 0 : Math.max(-100, Math.min(100, value)),
        weight: weight,
        available: available,
        quality: available ? Math.max(0, Math.min(1, numberOr(part.quality, 1))) : 0
      };
    });
    var availableRows = normalizedRows.filter(function (part) { return part.available; });
    var availableWeight = availableRows.reduce(function (sum, part) { return sum + part.weight; }, 0);
    var confidenceComponents = normalizedRows.map(function (part) { return { weight: part.weight, quality: part.quality }; });
    var dataConfidence = calculateDataConfidence(confidenceComponents);
    if (!availableWeight) {
      return { score: null, bias: 'Indisponivel', availableWeight: 0, dataConfidence: 0, dataStatus: 'unavailable', contributions: normalizedRows.map(function (part) { return { name: part.name, contribution: 0, available: false }; }) };
    }
    var rawScore = availableRows.reduce(function (sum, part) { return sum + part.value * part.weight; }, 0) / availableWeight;
    var score = Math.round(Math.max(-100, Math.min(100, rawScore)));
    var contributions = normalizedRows.map(function (part) {
      return {
        name: part.name,
        available: part.available,
        contribution: part.available ? (part.value * part.weight) / availableWeight : 0
      };
    });
    var totalWeight = normalizedRows.reduce(function (sum, part) { return sum + part.weight; }, 0);
    var dataStatus = dataConfidence < 40 ? 'insufficient' : availableWeight >= totalWeight ? 'complete' : 'partial';
    return { score: score, rawScore: rawScore, bias: score >= RULESET.radarBias.bull ? 'Comprador' : score <= RULESET.radarBias.bear ? 'Vendedor' : 'Neutro', availableWeight: availableWeight, dataConfidence: dataConfidence, dataStatus: dataStatus, contributions: contributions };
  }

  /** Pairs two candle arrays by timestamp and returns aligned close returns. */
  function alignedReturns(candlesA, candlesB, timeKey) {
    var key = timeKey || 'time';
    var mapB = new Map();
    (Array.isArray(candlesB) ? candlesB : []).forEach(function (candle) {
      var close = toFiniteNumber(candle && candle.close);
      if (candle && close !== null && close > 0) mapB.set(candle[key], close);
    });
    var pairs = [];
    (Array.isArray(candlesA) ? candlesA : []).forEach(function (candle) {
      var close = toFiniteNumber(candle && candle.close);
      if (candle && close !== null && close > 0 && mapB.has(candle[key])) {
        pairs.push([close, mapB.get(candle[key])]);
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
    if (!isFiniteNumber(meanA) || !isFiniteNumber(meanB)) return NaN;
    var scaleA = 0, scaleB = 0;
    for (var index = 0; index < length; index += 1) {
      if (!isFiniteNumber(seriesA[index]) || !isFiniteNumber(seriesB[index])) return NaN;
      scaleA = Math.max(scaleA, Math.abs(seriesA[index] - meanA));
      scaleB = Math.max(scaleB, Math.abs(seriesB[index] - meanB));
    }
    if (!scaleA || !scaleB || !isFiniteNumber(scaleA) || !isFiniteNumber(scaleB)) return NaN;
    var covariance = 0, varianceA = 0, varianceB = 0;
    for (index = 0; index < length; index += 1) {
      var deltaA = (seriesA[index] - meanA) / scaleA;
      var deltaB = (seriesB[index] - meanB) / scaleB;
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
    if (!isFiniteNumber(meanAsset) || !isFiniteNumber(meanBench)) return NaN;
    var scaleAsset = 0, scaleBench = 0;
    for (var index = 0; index < length; index += 1) {
      if (!isFiniteNumber(assetReturns[index]) || !isFiniteNumber(benchmarkReturns[index])) return NaN;
      scaleAsset = Math.max(scaleAsset, Math.abs(assetReturns[index] - meanAsset));
      scaleBench = Math.max(scaleBench, Math.abs(benchmarkReturns[index] - meanBench));
    }
    if (!scaleAsset || !scaleBench || !isFiniteNumber(scaleAsset) || !isFiniteNumber(scaleBench)) return NaN;
    var covariance = 0, varianceBench = 0;
    for (index = 0; index < length; index += 1) {
      var assetDelta = (assetReturns[index] - meanAsset) / scaleAsset;
      var benchmarkDelta = (benchmarkReturns[index] - meanBench) / scaleBench;
      covariance += assetDelta * benchmarkDelta;
      varianceBench += benchmarkDelta * benchmarkDelta;
    }
    var beta = varianceBench ? covariance / varianceBench * (scaleAsset / scaleBench) : NaN;
    return isFiniteNumber(beta) ? beta : NaN;
  }

  /** Cumulative return difference (asset minus benchmark) over the last N aligned periods. */
  function relativeStrength(assetReturns, benchmarkReturns, periods) {
    var span = Math.floor(numberOr(periods, 20));
    var length = Math.min(assetReturns ? assetReturns.length : 0, benchmarkReturns ? benchmarkReturns.length : 0);
    if (length < span || span < 1) return NaN;
    var accumulate = function (rows) {
      return rows.slice(rows.length - span).reduce(function (total, value) { return total * (1 + value); }, 1) - 1;
    };
    var result = (accumulate(assetReturns) - accumulate(benchmarkReturns)) * 100;
    return isFiniteNumber(result) ? result : NaN;
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

  /**
   * Price outcomes at fixed horizons after the signal candle close. Callers that know the
   * source interval can scope `horizons` and cap `maxLagMs`, preventing a distant candle from
   * silently standing in for a missing fixed-horizon observation.
   */
  function evaluateSignalOutcome(record, candles, options) {
    var basePrice = toFiniteNumber(record && record.price);
    var baseTime = toFiniteNumber(record && record.signalCloseTime);
    if (basePrice === null || basePrice <= 0 || baseTime === null) return null;
    var settings = options && typeof options === 'object' ? options : {};
    var requested = Array.isArray(settings.horizons)
      ? settings.horizons.filter(function (name) { return Object.prototype.hasOwnProperty.call(SIGNAL_HORIZONS, name); })
      : Object.keys(SIGNAL_HORIZONS);
    var requestedSet = new Set(requested);
    function lagLimit(name) {
      var source = settings.maxLagMs && typeof settings.maxLagMs === 'object' ? settings.maxLagMs[name] : settings.maxLagMs;
      var parsed = toFiniteNumber(source);
      return parsed !== null && parsed >= 0 ? parsed : null;
    }
    var rows = (Array.isArray(candles) ? candles : []).filter(function (candle) {
      return candle && isFiniteNumber(toFiniteNumber(candle.closeTime)) && isFiniteNumber(toFiniteNumber(candle.close));
    });
    var outcome = {};
    Object.keys(SIGNAL_HORIZONS).forEach(function (name) {
      if (!requestedSet.has(name)) { outcome[name] = null; return; }
      var target = baseTime + SIGNAL_HORIZONS[name];
      var maxLag = lagLimit(name);
      var match = null;
      rows.forEach(function (candle) {
        var closeTime = +candle.closeTime;
        if (closeTime >= target && (maxLag === null || closeTime - target <= maxLag) && (match === null || closeTime < +match.closeTime)) match = candle;
      });
      var rawOutcome = match ? ((+match.close - basePrice) / basePrice) * 100 : null;
      outcome[name] = isFiniteNumber(rawOutcome) ? rawOutcome : null;
    });
    return outcome;
  }

  /** Distinguishes an outcome that is due now from one whose horizon has not elapsed yet. */
  function signalOutcomeState(record, asOf) {
    var baseTime = toFiniteNumber(record && record.signalCloseTime);
    if (baseTime === null) return 'invalid';
    var now = toFiniteNumber(asOf);
    if (now === null) now = Date.now();
    var outcome = record.outcome || {};
    var missing = Object.keys(SIGNAL_HORIZONS).filter(function (name) {
      return !isFiniteNumber(toFiniteNumber(outcome[name]));
    });
    if (!missing.length) return 'complete';
    return missing.some(function (name) { return baseTime + SIGNAL_HORIZONS[name] <= now; }) ? 'due' : 'waiting';
  }

  /**
   * A record stays pending while any horizon whose deadline already elapsed
   * is still unevaluated — an early evaluation must never freeze the record.
   */
  function signalOutcomePending(record, asOf) {
    return signalOutcomeState(record, asOf) === 'due';
  }

  /**
   * Retention-aware journal compaction. No record with an unevaluated horizon is ever discarded;
   * the cap applies only to fully evaluated evidence. This can intentionally exceed the cap when
   * the browser has pending outcomes, preferring audit integrity over silent data loss.
   */
  function compactSignalJournal(records, asOf, completedCap) {
    var now = toFiniteNumber(asOf);
    if (now === null) now = Date.now();
    var cap = Math.max(0, Math.floor(numberOr(completedCap, 500)));
    var byKey = new Map();
    (Array.isArray(records) ? records : []).forEach(function (record) {
      var closeTime = toFiniteNumber(record && record.signalCloseTime);
      if (!record || closeTime === null || !record.symbol || !record.interval) return;
      var key = [record.modelVersion || '', record.symbol, record.interval, closeTime].join(':');
      byKey.set(key, record);
    });
    var ordered = Array.from(byKey.values()).sort(function (a, b) {
      return numberOr(a.signalCloseTime, 0) - numberOr(b.signalCloseTime, 0)
        || numberOr(a.recordedAt, 0) - numberOr(b.recordedAt, 0);
    });
    var incomplete = ordered.filter(function (record) { return signalOutcomeState(record, now) !== 'complete'; });
    var complete = ordered.filter(function (record) { return signalOutcomeState(record, now) === 'complete'; });
    return complete.slice(Math.max(0, complete.length - cap)).concat(incomplete).sort(function (a, b) {
      return numberOr(a.signalCloseTime, 0) - numberOr(b.signalCloseTime, 0)
        || numberOr(a.recordedAt, 0) - numberOr(b.recordedAt, 0);
    });
  }

  /** Merges a fresh evaluation into an existing one without erasing filled horizons. */
  function mergeSignalOutcome(existing, fresh) {
    var merged = {};
    Object.keys(SIGNAL_HORIZONS).forEach(function (name) {
      var freshValue = fresh ? toFiniteNumber(fresh[name]) : null;
      var existingValue = existing ? toFiniteNumber(existing[name]) : null;
      merged[name] = existingValue !== null ? existingValue : freshValue;
    });
    return merged;
  }

  /** Aggregates journal hit-rates per score band; a hit is a positive 24h return for positive scores and vice versa. */
  function summarizeSignalJournal(records) {
    var bands = RULESET.signalSummary.bands;
    return bands.map(function (band) {
      var rows = (Array.isArray(records) ? records : []).filter(function (record) {
        var score = toFiniteNumber(record && record.setupScore);
        return score !== null && score >= band.min && score < band.max;
      });
      var evaluated = rows.filter(function (record) { return record.outcome && isFiniteNumber(toFiniteNumber(record.outcome.r24h)); });
      var hits = evaluated.filter(function (record) {
        var score = +record.setupScore;
        var result = +record.outcome.r24h;
        return score >= 20 ? result > 0 : score <= -20 ? result < 0 : Math.abs(result) < RULESET.signalSummary.neutralMaxAbsReturn24hPct;
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
    return sorted.length % 2 ? sorted[middle] : average([sorted[middle - 1], sorted[middle]]);
  }

  /**
   * Alert rules fire only on state TRANSITIONS between two evaluations,
   * never on level, so a persistent condition alerts once. Score alerts
   * fire on ENTERING a zone (up through +42/+60, down through -42/-60) by
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
      RULESET.alertScoreThresholds.forEach(function (level) {
        var crossedUp = prevScore < level && currScore >= level && level > 0;
        var crossedDown = prevScore > level && currScore <= level && level < 0;
        var label = Math.abs(level) >= 60 ? 'entrada favoravel' : 'entrada com confirmacao';
        if (level < 0) label = 'venda ' + (Math.abs(level) >= 60 ? 'favoravel' : 'com confirmacao');
        if (crossedUp || crossedDown) alerts.push({ id: 'score-' + level, message: current.symbol + ': Setup Score cruzou ' + (level > 0 ? '+' : '') + level + ' (' + label + ') em ' + currScore });
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
    var rawEvidence = input.rawEvidence || null;
    if (rawEvidence) {
      var rawEvidenceVerification = verifyRawEvidenceEnvelope(rawEvidence);
      if (!rawEvidenceVerification.valid) throw new TypeError('raw evidence invalida: ' + rawEvidenceVerification.errors.join('; '));
    }
    return {
      schemaVersion: 3,
      exportedAt: numberOr(input.exportedAt, null),
      modelId: RULESET.modelId,
      modelVersion: input.modelVersion || snapshot.modelVersion || null,
      rulesetHash: input.rulesetHash || snapshot.rulesetHash || null,
      sourceRegistry: { version: SOURCE_REGISTRY_VERSION, entries: SOURCE_REGISTRY },
      symbol: snapshot.symbol || input.symbol || null,
      interval: snapshot.interval || input.interval || null,
      inputSnapshotId: snapshot.inputSnapshotId || null,
      inputComponents: snapshot.inputComponents || null,
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
      evidence: input.evidence || null,
      rawEvidence: rawEvidence,
      disclaimer: 'Scores medem confluencia direcional e cobertura de dados; nao representam probabilidade nem recomendacao.'
    };
  }

  var api = {
    RULESET: RULESET,
    SOURCE_REGISTRY: SOURCE_REGISTRY,
    SOURCE_REGISTRY_VERSION: SOURCE_REGISTRY_VERSION,
    adx: adx,
    alignedReturns: alignedReturns,
    betaCoefficient: betaCoefficient,
    buildAnalyticsExport: buildAnalyticsExport,
    buildRawEvidenceEnvelope: buildRawEvidenceEnvelope,
    compactSignalJournal: compactSignalJournal,
    evaluateAlertTransitions: evaluateAlertTransitions,
    evaluateSignalOutcome: evaluateSignalOutcome,
    mergeSignalOutcome: mergeSignalOutcome,
    signalOutcomePending: signalOutcomePending,
    signalOutcomeState: signalOutcomeState,
    pearsonCorrelation: pearsonCorrelation,
    relativeStrength: relativeStrength,
    realizedVolatility: realizedVolatility,
    shouldRecordSignal: shouldRecordSignal,
    summarizeSignalJournal: summarizeSignalJournal,
    aggregateMultiTimeframe: aggregateMultiTimeframe,
    aggregateRadarParts: aggregateRadarParts,
    bitcoinMempoolContext: bitcoinMempoolContext,
    escapeRegExp: escapeRegExp,
    findProtocolMatch: findProtocolMatch,
    findOpenFairValueGap: findOpenFairValueGap,
    ichimokuState: ichimokuState,
    keywordPattern: keywordPattern,
    newsAssetRelevance: newsAssetRelevance,
    newsKeywordScore: newsKeywordScore,
    resolveObservedAt: resolveObservedAt,
    rulesetHash: rulesetHash,
    stableHash: stableHash,
    validateSourceRegistry: validateSourceRegistry,
    verifyRawEvidenceEnvelope: verifyRawEvidenceEnvelope,
    intervalToMilliseconds: intervalToMilliseconds,
    upsertTrapVeto: upsertTrapVeto,
    activeTrapVeto: activeTrapVeto,
    trapVetoBarsLeft: trapVetoBarsLeft,
    calculateCandleFlow: calculateCandleFlow,
    calculateDataConfidence: calculateDataConfidence,
    calculateDerivativeDetailContribution: calculateDerivativeDetailContribution,
    calculateFundingContribution: calculateFundingContribution,
    calculateOiPriceQuadrant: calculateOiPriceQuadrant,
    timeframeCoverage: timeframeCoverage,
    setupDecision: setupDecision,
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
    normalizeSignalMachineState: normalizeSignalMachineState,
    normalizeSignalMachineMap: normalizeSignalMachineMap,
    summarizeTradeJournal: summarizeTradeJournal,
    buildScenarios: buildScenarios,
    backtestDetectorLag: backtestDetectorLag,
    classifyFreshness: classifyFreshness,
    resolveDatasetFreshness: resolveDatasetFreshness,
    calculatePosition: calculatePosition,
    calculateMarketTrendContext: calculateMarketTrendContext,
    createRequestGate: createRequestGate,
    createRequestBudget: createRequestBudget,
    classifyHttpError: classifyHttpError,
    parseRetryAfter: parseRetryAfter,
    createSourceThrottle: createSourceThrottle,
    filterFreshByTimestamp: filterFreshByTimestamp,
    isCandleClosed: isCandleClosed,
    isDatasetMetricEligible: isDatasetMetricEligible,
    derivativeCoverage: derivativeCoverage,
    formatDisplayTimestamp: formatDisplayTimestamp,
    datasetInputStamp: datasetInputStamp,
    buildInputSnapshotId: buildInputSnapshotId,
    normalizeKlines: normalizeKlines,
    normalizeTradFiChart: normalizeTradFiChart,
    normalizeTradFiRows: normalizeTradFiRows,
    percentageChange: percentageChange,
    priceChangeOverWindow: priceChangeOverWindow,
    formatUsd: formatUsd,
    rsi: rsi,
    rsiSeries: rsiSeries,
    resolveOptionsScope: resolveOptionsScope,
    selectClosedCandles: selectClosedCandles,
    latestTimestampedRow: latestTimestampedRow,
    classifyEtfFlowObservation: classifyEtfFlowObservation,
    isUsEquityTradingDay: isUsEquityTradingDay,
    toTimestampMs: toTimestampMs,
    toFiniteNumber: toFiniteNumber
  };

  return typeof Object.freeze === 'function' ? Object.freeze(api) : api;
}));
