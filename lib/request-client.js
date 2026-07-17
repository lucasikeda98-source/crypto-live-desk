(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CryptoRequestClient = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function requestClientFactory() {
  'use strict';

  function requestPriority(url, source) {
    if (/^\/api\//.test(url) || source === 'Binance spot') return 2;
    if (/historico|MTF/i.test(source || '')) return -1;
    return 0;
  }

  function finiteNumber(value) {
    if (value === null || value === '' || typeof value === 'boolean') return null;
    var number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function numberOr(value, fallback) {
    var number = finiteNumber(value);
    return number === null ? fallback : number;
  }

  function nonNegative(value) {
    var number = finiteNumber(value);
    return number === null ? 0 : Math.max(0, number);
  }

  /** Per-source circuit breaker with exponential backoff and bounded jitter. */
  function createSourceThrottle(options) {
    options = options || {};
    var baseCooldownMs = Math.max(0, numberOr(options.baseCooldownMs, 1000));
    var maxCooldownMs = Math.max(baseCooldownMs, numberOr(options.maxCooldownMs, 120000));
    var random = typeof options.random === 'function' ? options.random : Math.random;
    var sources = Object.create(null);
    function entry(source) {
      var key = source || 'default';
      if (!sources[key]) sources[key] = { blockedUntil: 0, strikes: 0 };
      return sources[key];
    }
    return {
      retryAt: function (source) { return entry(source).blockedUntil; },
      isBlocked: function (source, now) {
        var reference = finiteNumber(now);
        if (reference === null) reference = Date.now();
        return entry(source).blockedUntil > reference;
      },
      penalize: function (source, retryAfterMs, now) {
        var reference = finiteNumber(now);
        if (reference === null) reference = Date.now();
        var sourceState = entry(source);
        sourceState.strikes += 1;
        var backoff = Math.min(maxCooldownMs, baseCooldownMs * Math.pow(2, sourceState.strikes - 1));
        var randomValue = finiteNumber(random());
        var jitterFactor = randomValue === null ? 0 : Math.max(0, Math.min(1, randomValue));
        backoff = Math.round(backoff * (1 + 0.25 * jitterFactor));
        var wait = Math.max(backoff, nonNegative(retryAfterMs));
        sourceState.blockedUntil = reference + wait;
        return wait;
      },
      succeed: function (source) {
        var sourceState = entry(source);
        sourceState.strikes = 0;
        sourceState.blockedUntil = 0;
      }
    };
  }

  function createRequestClient(options) {
    options = options || {};
    if (!options.budget) throw new TypeError('budget is required');
    if (!options.throttle) throw new TypeError('throttle is required');
    ['health', 'classifyHttpError', 'parseRetryAfter'].forEach(function (name) {
      if (typeof options[name] !== 'function') throw new TypeError(name + ' is required');
    });
    if (typeof options.budget.run !== 'function') throw new TypeError('budget.run is required');
    if (typeof options.throttle.isBlocked !== 'function' || typeof options.throttle.penalize !== 'function' || typeof options.throttle.succeed !== 'function') throw new TypeError('invalid throttle');
    var fetchImpl = options.fetchImpl || (typeof fetch === 'function' ? fetch : null);
    var AbortControllerImpl = options.AbortControllerImpl || (typeof AbortController !== 'undefined' ? AbortController : null);
    var now = typeof options.now === 'function' ? options.now : Date.now;
    if (!fetchImpl || !AbortControllerImpl) throw new Error('browser request primitives unavailable');

    async function fetchJSON(url, timeout, source, requestOptions) {
      try {
        return await options.budget.run(async function () {
          if (source && options.throttle.isBlocked(source, now())) {
            var cooldownError = new Error('rate-limit cooldown');
            cooldownError.category = 'rateLimit';
            cooldownError.throttled = true;
            options.health(source, false, 'cooldown de rate limit ate ' + new Date(options.throttle.retryAt(source)).toLocaleTimeString('pt-BR'));
            throw cooldownError;
          }
          var controller = new AbortControllerImpl();
          var externalSignal = requestOptions && requestOptions.signal;
          var abortFromExternal = function () {
            try { controller.abort(externalSignal && externalSignal.reason); }
            catch (error) { controller.abort(); }
          };
          if (externalSignal) {
            if (externalSignal.aborted) abortFromExternal();
            else if (typeof externalSignal.addEventListener === 'function') externalSignal.addEventListener('abort', abortFromExternal, { once: true });
          }
          var timer = setTimeout(function () { controller.abort(); }, timeout || 9000);
          try {
            var prepared = Object.assign({}, requestOptions || {}, { signal: controller.signal, cache: 'no-store' });
            var response = await fetchImpl(url, prepared);
            if (!response.ok) {
              var httpError = new Error('HTTP ' + response.status);
              httpError.status = response.status;
              httpError.category = options.classifyHttpError(response.status);
              if (httpError.category === 'rateLimit') {
                var retryAfterMs = options.parseRetryAfter(response.headers.get('Retry-After'), now());
                var wait = options.throttle.penalize(source, retryAfterMs, now());
                options.health(source, false, 'rate limit ' + response.status + ' | cooldown ' + Math.round(wait / 1000) + 's');
              } else {
                options.health(source, false, 'HTTP ' + response.status);
              }
              throw httpError;
            }
            var data = await response.json();
            if (source) options.throttle.succeed(source);
            options.health(source, true, 'online');
            return data;
          } finally {
            clearTimeout(timer);
            if (externalSignal && typeof externalSignal.removeEventListener === 'function') externalSignal.removeEventListener('abort', abortFromExternal);
          }
        }, { source: source || 'unclassified', priority: requestPriority(url, source) });
      } catch (error) {
        if (error && error.category === 'budget') options.health('Orcamento global', false, 'fila cheia; chamada descartada');
        else if (!error || !error.category) options.health(source, false, error && error.name === 'AbortError' ? 'timeout' : (error && error.message) || 'falhou');
        throw error;
      }
    }

    async function fetchFromBases(bases, path, timeout, source) {
      var lastError = null;
      for (var index = 0; index < bases.length; index += 1) {
        try {
          var data = await fetchJSON(bases[index] + path, timeout, source);
          if (index > 0) options.health(source, true, 'fallback ' + bases[index]);
          return data;
        } catch (error) {
          lastError = error;
          if (error && (error.category === 'rateLimit' || error.throttled)) break;
        }
      }
      throw lastError || new Error('fontes indisponiveis');
    }

    return { fetchFromBases: fetchFromBases, fetchJSON: fetchJSON };
  }

  return {
    createRequestClient: createRequestClient,
    createSourceThrottle: createSourceThrottle,
    requestPriority: requestPriority
  };
}));
