'use strict';

// Testes comportamentais para OPS-001 (warmup/cache compartilhado), OPS-002
// (deadline absoluto por rota) e OPS-007 (backoff de outage). Motivacao
// (REV-CC-01, secao B): as correcoes existiam mas eram guardadas por regex de
// fonte; reverter o deadline para dois tetos independentes de 18s (36s > 30s
// de maxDuration) passava verde. Aqui o relogio e o fetch sao falsos e o
// orcamento e observado pelo comportamento real dos handlers.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MAX_DURATION_MS = 30_000; // vercel.json functions api/*.js maxDuration

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return payload; },
    end() { return this; }
  };
}

function freshHandler(relativePath) {
  delete require.cache[require.resolve(relativePath)];
  return require(relativePath);
}

// Ambiente fake: Date.now controlavel + AbortSignal.timeout instrumentado para
// registrar o orcamento (ms) concedido a cada fetch, sem timers reais.
function fakeEnvironment(startAt) {
  const state = { now: startAt, grants: [], calls: [] };
  const originalNow = Date.now;
  const originalTimeout = AbortSignal.timeout;
  const originalFetch = global.fetch;
  Date.now = () => state.now;
  AbortSignal.timeout = (ms) => {
    state.grants.push(ms);
    return new AbortController().signal;
  };
  return {
    state,
    // O AbortSignal.timeout e criado sincronamente logo antes do fetch, entao o
    // ultimo grant registrado pertence a chamada corrente.
    lastGrant() { return state.grants[state.grants.length - 1]; },
    advanceTo(when) { state.now = Math.max(state.now, when); },
    restore() {
      Date.now = originalNow;
      AbortSignal.timeout = originalTimeout;
      global.fetch = originalFetch;
    }
  };
}

test('OPS-002: rota de mercado divide um orcamento absoluto entre as fases (fallback nao ganha novo teto de 18s)', async () => {
  const T0 = 1_700_000_000_000;
  const env = fakeEnvironment(T0);
  try {
    global.fetch = (url) => {
      const start = Date.now();
      const grant = env.lastGrant();
      env.state.calls.push({ url: String(url), start, grant });
      const value = String(url);
      if (value.includes('coingecko.com')) {
        // Fase 1 lenta: consome o orcamento inteiro concedido e falha.
        return new Promise((resolve, reject) => {
          queueMicrotask(() => {
            env.advanceTo(start + grant);
            reject(new Error('upstream lento'));
          });
        });
      }
      if (value.includes('coinpaprika.com')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.reject(new Error('URL inesperada: ' + value));
    };

    const handler = freshHandler('../api/market');
    const response = responseMock();
    await handler({ method: 'GET' }, response);

    const phaseOne = env.state.calls.filter((call) => call.url.includes('coingecko.com'));
    const fallback = env.state.calls.filter((call) => call.url.includes('coinpaprika.com'));
    assert.equal(phaseOne.length, 3, 'fase 1 deve consultar global, markets e trending');
    assert.equal(fallback.length, 1, 'fallback CoinPaprika deve ser acionado apos a falha da fase 1');

    const consumedByPhaseOne = Math.max(...phaseOne.map((call) => call.start + call.grant)) - T0;
    const fallbackCall = fallback[0];
    // O nucleo do OPS-002: a fase de fallback herda apenas o restante do
    // orcamento. Se o deadline for revertido para tetos independentes de 18s,
    // este grant volta a 18000 e o teste falha.
    assert.ok(
      fallbackCall.grant <= MAX_DURATION_MS - consumedByPhaseOne,
      `fallback recebeu ${fallbackCall.grant}ms, mas so restavam ${MAX_DURATION_MS - consumedByPhaseOne}ms do maxDuration`
    );
    assert.ok(fallbackCall.grant < 18_000, 'fallback nao pode ganhar um teto cheio de 18s apos fase lenta');

    // Invariante absoluto: nenhuma chamada pode terminar depois da janela da funcao.
    for (const call of env.state.calls) {
      assert.ok(
        call.start + call.grant - T0 <= MAX_DURATION_MS,
        `chamada ${call.url} poderia terminar em ${call.start + call.grant - T0}ms > ${MAX_DURATION_MS}ms`
      );
    }
  } finally {
    env.restore();
  }
});

test('OPS-002: rota de opcoes limita a fase de order book ao restante do deadline absoluto', async () => {
  const T0 = Date.UTC(2026, 0, 1); // antes do vencimento ficticio de DEC26
  const env = fakeEnvironment(T0);
  try {
    const summaryRows = [
      { instrument_name: 'BTC-25DEC26-50000-C', open_interest: 10, underlying_price: 50_000, mark_iv: 55, volume_usd: 1_000 },
      { instrument_name: 'BTC-25DEC26-50000-P', open_interest: 12, underlying_price: 50_000, mark_iv: 60, volume_usd: 2_000 },
    ];
    global.fetch = (url) => {
      const start = Date.now();
      const grant = env.lastGrant();
      env.state.calls.push({ url: String(url), start, grant });
      const value = String(url);
      if (value.includes('get_book_summary_by_currency')) {
        // Fase 1 lenta: o summary chega no ultimo instante do grant.
        return new Promise((resolve) => {
          queueMicrotask(() => {
            env.advanceTo(start + grant);
            resolve({ ok: true, json: async () => ({ result: summaryRows }) });
          });
        });
      }
      if (value.includes('get_volatility_index_data')) {
        return Promise.reject(new Error('DVOL indisponivel'));
      }
      if (value.includes('get_order_book')) {
        return Promise.resolve({ ok: true, json: async () => ({ result: { mark_iv: 55, mark_price: 0.05, underlying_price: 50_000 } }) });
      }
      return Promise.reject(new Error('URL inesperada: ' + value));
    };

    const handler = freshHandler('../api/options');
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/options?currency=BTC' }, response);

    assert.equal(response.statusCode, 200, 'summary valido deve produzir payload mesmo com DVOL fora');

    const summaryCalls = env.state.calls.filter((call) => call.url.includes('get_book_summary_by_currency'));
    const bookCalls = env.state.calls.filter((call) => call.url.includes('get_order_book'));
    assert.equal(summaryCalls.length, 1);
    assert.equal(bookCalls.length, 2, 'ATM call e put devem consultar o book');

    const consumedBySummary = summaryCalls[0].start + summaryCalls[0].grant - T0;
    for (const call of bookCalls) {
      // Revert para 18s+18s: estes grants voltariam a 18000 e estourariam 30s.
      assert.ok(
        call.grant <= MAX_DURATION_MS - consumedBySummary,
        `order book recebeu ${call.grant}ms, mas so restavam ${MAX_DURATION_MS - consumedBySummary}ms`
      );
      assert.ok(call.grant < 18_000, 'fase 2 nao pode ganhar um teto cheio de 18s apos summary lento');
      assert.ok(call.start + call.grant - T0 <= MAX_DURATION_MS, 'book poderia terminar alem do maxDuration');
    }
  } finally {
    env.restore();
  }
});

test('OPS-001: cache compartilhado do modulo absorve warmup — chamadas concorrentes e repetidas nao multiplicam rede', async () => {
  const T0 = 1_700_000_000_000;
  const env = fakeEnvironment(T0);
  try {
    // Responde /coins/markets com todos os ids pedidos na propria URL, para
    // cobrir o bundle inteiro sem acionar o fallback: exatamente 3 chamadas.
    let networkCalls = 0;
    global.fetch = async (url) => {
      networkCalls += 1;
      const value = String(url);
      if (value.includes('/global')) return { ok: true, json: async () => ({ data: { market_cap_change_percentage_24h_usd: 1, updated_at: Math.floor(T0 / 1000) } }) };
      if (value.includes('/coins/markets')) {
        const ids = decodeURIComponent(new URL(value).searchParams.get('ids') || '').split(',').filter(Boolean);
        return { ok: true, json: async () => ids.map((id) => ({ id, current_price: 100, last_updated: Math.floor(T0 / 1000) })) };
      }
      if (value.includes('/search/trending')) return { ok: true, json: async () => ({ coins: [] }) };
      throw new Error('URL inesperada: ' + value);
    };

    const handler = freshHandler('../api/market');

    // Warmup concorrente: N abas/usuarios batendo juntos no cold start devem
    // compartilhar um unico refresh (single-flight), nao N lotes de chamadas.
    const concurrent = [responseMock(), responseMock(), responseMock()];
    await Promise.all(concurrent.map((response) => handler({ method: 'GET' }, response)));
    assert.equal(networkCalls, 3, 'warmup concorrente deve compartilhar um unico lote (global, markets, trending)');
    for (const response of concurrent) {
      assert.equal(response.statusCode, 200);
      assert.ok(response.body && response.body.markets.length > 0);
    }

    // Dentro da janela de cache (120s) nenhuma chamada volta a rede.
    env.advanceTo(T0 + 60_000);
    const cached = responseMock();
    await handler({ method: 'GET' }, cached);
    assert.equal(networkCalls, 3, 'chamada dentro da janela de cache nao pode ir a rede');
    assert.equal(cached.statusCode, 200);

    // Cache expirado: exatamente um novo lote.
    env.advanceTo(T0 + 120_001);
    const refreshed = responseMock();
    await handler({ method: 'GET' }, refreshed);
    assert.equal(networkCalls, 6, 'cache expirado deve custar exatamente um novo lote de 3 chamadas');
  } finally {
    env.restore();
  }
});

test('OPS-007: outage total entra em cooldown — chamadas seguintes servem stale sem bater na rede ate o backoff expirar', async () => {
  const T0 = 1_700_000_000_000;
  const env = fakeEnvironment(T0);
  try {
    let mode = 'ok';
    let networkCalls = 0;
    global.fetch = async (url) => {
      networkCalls += 1;
      if (mode === 'outage') throw new Error('outage total');
      const value = String(url);
      if (value.includes('/global')) return { ok: true, json: async () => ({ data: { market_cap_change_percentage_24h_usd: 1, updated_at: Math.floor(T0 / 1000) } }) };
      if (value.includes('/coins/markets')) {
        const ids = decodeURIComponent(new URL(value).searchParams.get('ids') || '').split(',').filter(Boolean);
        return { ok: true, json: async () => ids.map((id) => ({ id, current_price: 100, last_updated: Math.floor(T0 / 1000) })) };
      }
      if (value.includes('/search/trending')) return { ok: true, json: async () => ({ coins: [] }) };
      throw new Error('URL inesperada: ' + value);
    };

    const handler = freshHandler('../api/market');

    // Popula o cache com um refresh saudavel.
    await handler({ method: 'GET' }, responseMock());
    assert.equal(networkCalls, 3);

    // Cache expira e a rede cai por completo.
    mode = 'outage';
    env.advanceTo(T0 + 120_001);
    const staleResponse = responseMock();
    await handler({ method: 'GET' }, staleResponse);
    const callsAfterFailure = networkCalls;
    assert.ok(callsAfterFailure > 3, 'a primeira chamada pos-expiracao deve tentar a rede');
    assert.equal(staleResponse.statusCode, 200, 'com cache disponivel a rota degrada, nao derruba');
    assert.equal(staleResponse.body.stale, true, 'payload servido durante outage deve se declarar stale');

    // Dentro do cooldown: zero tentativas novas de rede.
    env.advanceTo(T0 + 120_001 + 5_000);
    const cooldownResponse = responseMock();
    await handler({ method: 'GET' }, cooldownResponse);
    assert.equal(networkCalls, callsAfterFailure, 'durante o cooldown de outage nenhuma chamada pode bater na rede');
    assert.equal(cooldownResponse.statusCode, 200);

    // Depois do cooldown (15s): a rede volta a ser tentada e o refresh recupera.
    mode = 'ok';
    env.advanceTo(T0 + 120_001 + 15_001);
    const recoveredResponse = responseMock();
    await handler({ method: 'GET' }, recoveredResponse);
    assert.ok(networkCalls > callsAfterFailure, 'expirado o cooldown, a rede deve ser tentada de novo');
    assert.equal(recoveredResponse.statusCode, 200);
    assert.equal(recoveredResponse.body.stale, false, 'refresh bem-sucedido deve limpar o estado stale');
  } finally {
    env.restore();
  }
});

test('OPS-014: pisos de cobertura 95/75/90 permanecem versionados e a exclusao de app.js do denominador esta documentada', () => {
  const root = path.join(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const coverageScript = String(packageJson.scripts && packageJson.scripts['test:coverage'] || '');
  assert.match(coverageScript, /--test-coverage-lines=95\b/);
  assert.match(coverageScript, /--test-coverage-branches=75\b/);
  assert.match(coverageScript, /--test-coverage-functions=90\b/);

  // Onde os pisos sao citados, a exclusao de app.js do denominador precisa
  // estar declarada — os 95/75/90 cobrem lib/ e api/, nao a logica da UI.
  for (const file of ['README.md', 'ANALYTICS_COVERAGE.md', 'OPERATIONS_RUNBOOK.md']) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(content, /denominador[\s\S]{0,200}app\.js|app\.js[\s\S]{0,200}denominador/i,
      file + ' deve documentar que app.js fica fora do denominador de cobertura (OPS-014)');
  }
});
