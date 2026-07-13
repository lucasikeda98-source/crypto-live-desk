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
  } finally {
    global.fetch = originalFetch;
  }
});
