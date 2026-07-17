'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/institutional');

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return payload; },
  };
}

function cftcRows() {
  return [{
    report_date_as_yyyy_mm_dd: '2026-07-07T00:00:00.000',
    market_and_exchange_names: 'BITCOIN - CHICAGO MERCANTILE EXCHANGE',
    open_interest_all: '18832',
    noncomm_positions_long_all: '16073',
    noncomm_positions_short_all: '12573',
    comm_positions_long_all: '38',
    comm_positions_short_all: '3255',
    change_in_noncomm_long_all: '-422',
    change_in_noncomm_short_all: '-152',
    traders_tot_all: '117',
  }];
}

test('CFTC BTC normaliza nets sem confundir contratos com USD', () => {
  const data = handler.normalizeCftc(cftcRows());
  assert.equal(data.latest.openInterest, 18832);
  assert.equal(data.latest.nonCommercialNet, 3500);
  assert.equal(data.latest.commercialNet, -3217);
  assert.equal(data.latest.changeNonCommercialNet, -270);
  assert.equal(data.latest.traders, 117);
  assert.equal(data.observedAt, Date.parse('2026-07-07T00:00:00.000'));
  const missing = handler.normalizeCftc([{ ...cftcRows()[0], open_interest_all: null }]);
  assert.equal(missing.latest, null, 'campo ausente nao pode virar zero');
  const invalidDate = handler.normalizeCftc([{ ...cftcRows()[0], report_date_as_yyyy_mm_dd: 'nao-e-data' }]);
  assert.equal(invalidDate.latest, null, 'data invalida nao pode virar observacao institucional');
  const negativeOi = handler.normalizeCftc([{ ...cftcRows()[0], open_interest_all: '-1' }]);
  assert.equal(negativeOi.latest, null, 'open interest negativo nao pode virar observacao institucional');
  const negativePositions = handler.normalizeCftc([{ ...cftcRows()[0], noncomm_positions_long_all: '-2' }]);
  assert.equal(negativePositions.latest.nonCommercialLong, null);
  assert.equal(negativePositions.latest.nonCommercialNet, null);
  const overflow = handler.normalizeCftc([{ ...cftcRows()[0], change_in_noncomm_long_all: '1e308', change_in_noncomm_short_all: '-1e308' }]);
  assert.equal(overflow.latest.changeNonCommercialNet, null, 'diferenca infinita nao vaza para o JSON');
});

test('ETF MCP aceita SSE multiline e ignora eventos auxiliares', () => {
  const payload = { rows: [{ date: '2026-07-10', total: 12 }] };
  const envelope = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } });
  const split = Math.floor(envelope.length / 2);
  const body = 'event: ping\ndata: {"ping":true}\n\nevent: message\ndata: ' + envelope.slice(0, split) + '\ndata: ' + envelope.slice(split) + '\n\n';
  assert.deepEqual(handler.parseEtfMcpBody(body), payload);
  assert.deepEqual(handler.parseEtfMcpBody(envelope), payload, 'JSON-RPC direto tambem e aceito');
  assert.throws(() => handler.parseEtfMcpBody('{"jsonrpc":"2.0","error":{"message":"negado"}}'), /semantic error/);
  assert.throws(() => handler.parseEtfMcpBody('event: ping\ndata: {"ping":true}\n\n'), /invalid payload/);
});

test('ETF MCP degrada com erro controlado quando content tem formato inesperado', () => {
  const nonArrayContent = JSON.stringify({ jsonrpc: '2.0', result: { content: { type: 'text', text: '{}' } } });
  assert.throws(() => handler.parseEtfMcpBody(nonArrayContent), /no content/, 'content nao-array nao pode virar TypeError');
  const nullItem = JSON.stringify({ jsonrpc: '2.0', result: { content: [null, { type: 'text', text: '{"ok":1}' }] } });
  assert.deepEqual(handler.parseEtfMcpBody(nullItem), { ok: 1 }, 'item nulo no content nao pode derrubar o parser');
  const textless = JSON.stringify({ jsonrpc: '2.0', result: { content: [{ type: 'image' }] } });
  assert.throws(() => handler.parseEtfMcpBody(textless), /no content/);
});

test('calendario de sessoes cobre feriados moveis dos EUA sem apagar meio-dia de vespera', () => {
  const zeroOn = (date) => ({ date, netFlowUsdM: 0 });
  const normalized = handler.normalizeEtfFlows({ days: [
    zeroOn('2026-01-01'), // New Year
    zeroOn('2026-01-19'), // MLK (3a segunda)
    zeroOn('2026-02-16'), // Washington (3a segunda)
    zeroOn('2026-04-03'), // Good Friday
    zeroOn('2026-05-25'), // Memorial Day (ultima segunda)
    zeroOn('2026-09-07'), // Labor Day (1a segunda)
    zeroOn('2026-11-26'), // Thanksgiving (4a quinta)
    zeroOn('2026-12-25'), // Christmas
    zeroOn('2027-01-01'), // New Year do ano seguinte (borda de ano)
    zeroOn('2027-07-05'), // July 4 observado na segunda
    zeroOn('2026-07-12'), // domingo
  ] });
  assert.deepEqual(normalized.days.map((row) => row.reported), new Array(11).fill(false), 'feriado/fim de semana nao pode cobrar fluxo');
  assert.ok(normalized.days.every((row) => row.reportReason === 'market-closed-placeholder'));

  const halfDays = handler.normalizeEtfFlows({ days: [zeroOn('2026-11-27'), zeroOn('2026-12-24')] });
  assert.deepEqual(halfDays.days.map((row) => row.reported), [true, true], 'meio pregao (Black Friday/vespera de Natal) e dia de negociacao');
  assert.equal(halfDays.days[0].reportReason, 'trading-day-zero');
});

test('flag do provedor tem precedencia sobre o calendario e valores invalidos nao viram zero', () => {
  const normalized = handler.normalizeEtfFlows({ days: [
    { date: '2026-07-10', netFlowUsdM: 55, reported: false },
    { date: '2026-07-10', netFlowUsdM: 0, isReported: true },
    { date: '2026-07-10', netFlowUsdM: 0, marketOpen: false },
    { date: '2026-07-10', netFlowUsdM: 0, status: 'Not Reported' },
    { date: '2026-07-10', netFlowUsdM: 0, reportStatus: 'final' },
    { date: '2026-07-10', netFlowUsdM: 'abc' },
    { date: 'nao-e-data', netFlowUsdM: 0 },
  ] });
  assert.deepEqual(normalized.days.map((row) => [row.reported, row.reportReason]), [
    [false, 'provider-reported-flag'],
    [true, 'provider-is-reported-flag'],
    [false, 'provider-market-open-flag'],
    [false, 'provider-status-not_reported'],
    [true, 'provider-status-final'],
    [false, 'invalid-flow'],
    [false, 'invalid-date'],
  ]);
});

test('rota institucional declara degradacao parcial de ETF/CFTC e bloqueia metodo', async () => {
  const originalFetch = global.fetch;
  const payload = { rows: [{ date: '2026-07-10', total: 12 }] };
  global.fetch = async (url) => {
    if (String(url).includes('cryptoetf.today')) {
      const envelope = { jsonrpc: '2.0', result: { content: [{ type: 'text', text: JSON.stringify(payload) }] } };
      return { ok: true, text: async () => JSON.stringify(envelope) };
    }
    throw new Error('CFTC indisponivel');
  };
  try {
    const partial = responseMock();
    await handler({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.121' }, url: '/api/institutional?asset=BTC' }, partial);
    assert.equal(partial.statusCode, 200);
    assert.equal(partial.body.dataStatus, 'partial');
    assert.equal(partial.body.etf.flows.rows[0].reported, true);
    assert.equal(partial.body.etf.flows.rows[0].reportReason, 'nonzero-observation');
    assert.equal(partial.body.errors.cftc, 'internal error');

    const method = responseMock();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.122' }, url: '/api/institutional' }, method);
    assert.equal(method.statusCode, 405);
    assert.equal(method.headers.Allow, 'GET');
  } finally {
    global.fetch = originalFetch;
  }
});

test('normalizacao ETF marca feriados/weekends sem apagar zero legitimo de sessao', () => {
  const normalized = handler.normalizeEtfFlows({ days: [
    { date: '2026-06-19', netFlowUsdM: 0 },
    { date: '2026-07-02', netFlowUsdM: 0 },
    { date: '2026-07-03', netFlowUsdM: 0 },
    { date: '2026-07-10', netFlowUsdM: 90.4 },
    { date: '2026-07-11', netFlowUsdM: 0 },
  ] });
  assert.deepEqual(normalized.days.map((row) => row.reported), [false, true, false, true, false]);
  assert.equal(normalized.days[1].reportReason, 'trading-day-zero');
  assert.equal(normalized.days[2].reportReason, 'market-closed-placeholder');
});

test('normalizacao ETF atravessa envelopes MCP aninhados ate a serie diaria', () => {
  const nested = handler.normalizeEtfFlows({ flows: { symbol: 'BTC', days: [
    { date: '2026-07-03', netFlowUsdM: 0 },
    { date: '2026-07-06', netFlowUsdM: 0 }
  ] } });
  assert.equal(nested.flows.days[0].reported, false);
  assert.equal(nested.flows.days[0].reportReason, 'market-closed-placeholder');
  assert.equal(nested.flows.days[1].reported, true);
  assert.equal(nested.flows.days[1].reportReason, 'trading-day-zero');

  let hostile = { rows: [{ date: '2026-07-10', netFlowUsdM: 1e308 }] };
  for (let index = 0; index < 100; index += 1) hostile = { flows: hostile };
  assert.doesNotThrow(() => handler.normalizeEtfFlows(hostile), 'profundidade hostil nao causa estouro de pilha');
});

test('rota institucional preserva CFTC quando ativo nao tem ETF', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /publicreporting\.cftc\.gov/);
    return { ok: true, json: async () => cftcRows() };
  };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/institutional?asset=DOGE' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.configured.etf, false);
    assert.equal(response.body.configured.cftc, true);
    assert.equal(response.body.etf, null);
    assert.equal(response.body.cftc.latest.nonCommercialNet, 3500);
    assert.equal(response.body.dataStatus, 'fresh');
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(response.headers.Vary, 'Origin');
  } finally {
    global.fetch = originalFetch;
  }
});

test('rota institucional rejeita ativo fora do universo sem amplificar chamadas upstream', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('nao deveria chamar'); };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/institutional?asset=EVIL' }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});
