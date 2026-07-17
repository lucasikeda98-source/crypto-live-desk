'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/macro');

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

function treasuryEntry(date, y2, y10) {
  return `<entry><d:NEW_DATE>${date}</d:NEW_DATE><d:BC_2YEAR>${y2}</d:BC_2YEAR><d:BC_10YEAR>${y10}</d:BC_10YEAR></entry>`;
}

test('macro inclui ano anterior durante janeiro', () => {
  assert.deepEqual(handler.treasuryYearsFor(new Date('2027-01-02T00:00:00Z')), [2026, 2027]);
  assert.deepEqual(handler.treasuryYearsFor(new Date('2027-02-02T00:00:00Z')), [2027]);
});

test('Treasury combinado atravessa virada do ano e preserva janela de 5 sessoes', () => {
  const xml = [
    treasuryEntry('2026-12-24T00:00:00', '4.0', '4.2'),
    treasuryEntry('2026-12-28T00:00:00', '4.1', '4.3'),
    treasuryEntry('2026-12-29T00:00:00', '4.1', '4.4'),
    treasuryEntry('2026-12-30T00:00:00', '4.2', '4.5'),
    treasuryEntry('2026-12-31T00:00:00', '4.2', '4.6'),
    treasuryEntry('2027-01-04T00:00:00', '4.3', '4.7'),
  ].join('');
  const result = handler.parseTreasury(xml, Date.parse('2027-01-05T00:00:00Z'));
  assert.equal(result.date, '2027-01-04T00:00:00');
  assert.ok(Math.abs(result.y10Change5d - 0.5) < 1e-12);
});

test('VIX nao transforma campo vazio em zero', () => {
  const result = handler.parseVix('DATE,OPEN,HIGH,LOW,CLOSE\n2026-07-10,1,2,0,');
  assert.equal(result, null);
  assert.equal(handler.parseVix('DATE,OPEN,HIGH,LOW,CLOSE\n2026-07-10,1,2,0,-5'), null, 'VIX negativo e semanticamente invalido');
});

test('parsers macro rejeitam datas invalidas e ordenam VIX por data', () => {
  const treasury = handler.parseTreasury([
    treasuryEntry('nao-e-data', '1', '2'),
    treasuryEntry('2026-07-10T00:00:00', '4', '5'),
  ].join(''));
  assert.equal(treasury.date, '2026-07-10T00:00:00');

  const vix = handler.parseVix([
    'DATE,OPEN,HIGH,LOW,CLOSE',
    '2026-07-10,1,2,0,20',
    'nao-e-data,1,2,0,99',
    '2026-07-08,1,2,0,18',
  ].join('\n'));
  assert.equal(vix.date, '2026-07-10');
  assert.equal(vix.close, 20);
});

test('parsers macro rejeitam observacoes futuras e derivadas com overflow', () => {
  const asOf = Date.parse('2026-07-10T12:00:00Z');
  const treasury = handler.parseTreasury([
    treasuryEntry('2026-07-10T00:00:00', '1e308', '-1e308'),
    treasuryEntry('2026-07-12T00:00:00', '4', '5'),
  ].join(''), asOf);
  assert.equal(treasury.date, '2026-07-10T00:00:00');
  assert.equal(treasury.curve10y2y, null, 'diferenca infinita nao vaza para a resposta');

  const vix = handler.parseVix([
    'DATE,OPEN,HIGH,LOW,CLOSE',
    '2026-07-10,1,2,0,20',
    '2026-07-12,1,2,0,99',
  ].join('\n'), asOf);
  assert.equal(vix.date, '2026-07-10');
});

test('rota macro preserva fonte valida como parcial e nao cacheia falha total', async () => {
  const originalFetch = global.fetch;
  // REV-CC-02/B: o SLA de frescor agora e aplicado contra a idade da observacao (4 dias para o
  // macro); o fixture precisa de uma data recente relativa ao relogio real, nao fixa no passado.
  const recentDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10) + 'T00:00:00';
  try {
    global.fetch = async (url) => {
      if (String(url).includes('treasury.gov')) return { ok: true, text: async () => treasuryEntry(recentDate, '4', '4.5') };
      throw new Error('VIX indisponivel');
    };
    const partial = responseMock();
    await handler({ method: 'GET', headers: {}, url: '/api/macro' }, partial);
    assert.equal(partial.statusCode, 200);
    assert.equal(partial.body.dataStatus, 'partial');
    assert.equal(partial.body.treasury.date, recentDate);
    assert.equal(partial.body.vix, null);
    assert.equal(partial.body.errors.vix, 'internal error');
    assert.equal(partial.body.dataEnvelope.datasetId, 'macro.us-risk.v1');
    assert.equal(partial.body.dataEnvelope.status, 'partial');
    assert.equal(partial.body.dataEnvelope.schemaValidation.valid, true);
    assert.equal(partial.body.dataEnvelope.qualityFlags.includes('availability-inferred-at-retrieval'), true);
    assert.equal(partial.body.dataEnvelope.revision.backtestSafe, false);
    assert.equal(partial.body.dataHealth.scope, 'instance');
    assert.equal(partial.body.dataHealth.p50DurationMs >= 0, true);

    global.fetch = async () => { throw new Error('upstream indisponivel'); };
    const failed = responseMock();
    await handler({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.77' }, url: '/api/macro' }, failed);
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.body.dataStatus, 'error');
    assert.equal(failed.body.dataEnvelope.status, 'error');
    assert.equal(failed.body.dataEnvelope.schemaValidation.valid, true);
    assert.equal(failed.headers['Cache-Control'], 'private, no-store, max-age=0');
  } finally {
    global.fetch = originalFetch;
  }
});

test('rota macro rejeita metodo antes de consultar upstream', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('nao deveria chamar'); };
  try {
    const response = responseMock();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.78' }, url: '/api/macro' }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, 'GET');
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});
