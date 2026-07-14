'use strict';

// SEC-001-gap (REV-CC-01, secao B): o vercel.json publica 6 headers de
// seguranca na rota '/(.*)' mas nenhum teste os afirmava — remover HSTS ou
// Referrer-Policy passava verde. Este teste fixa presenca E valor como
// contrato; qualquer mudanca deliberada deve atualizar aqui junto.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadVercelConfig() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
}

function headersFor(config, source) {
  const block = (config.headers || []).find((entry) => entry && entry.source === source);
  assert.ok(block, 'vercel.json deve manter um bloco de headers para ' + source);
  const map = {};
  for (const header of block.headers || []) map[header.key] = header.value;
  return map;
}

const EXPECTED_SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://data-api.binance.vision https://api.binance.com https://fapi.binance.com https://mempool.space https://community-api.coinmetrics.io https://api.alternative.me https://api.llama.fi https://stablecoins.llama.fi https://api.coinpaprika.com wss://fstream.binance.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
};

test('SEC-001: a rota "/(.*)" publica os 6 headers de seguranca com os valores contratados', () => {
  const config = loadVercelConfig();
  const actual = headersFor(config, '/(.*)');
  for (const [key, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
    assert.ok(key in actual, 'header de seguranca ausente em vercel.json: ' + key);
    assert.equal(actual[key], value, 'valor divergente para ' + key);
  }
});

test('SEC-001: politicas criticas nao podem ser enfraquecidas silenciosamente', () => {
  const config = loadVercelConfig();
  const actual = headersFor(config, '/(.*)');

  // HSTS: minimo de 2 anos, subdominios e preload.
  const hsts = String(actual['Strict-Transport-Security'] || '');
  const maxAge = Number((hsts.match(/max-age=(\d+)/) || [])[1]);
  assert.ok(maxAge >= 63072000, 'HSTS max-age deve cobrir pelo menos 2 anos');
  assert.match(hsts, /includeSubDomains/);
  assert.match(hsts, /preload/);

  // CSP: fundacoes que o app depende para conter XSS.
  const csp = String(actual['Content-Security-Policy'] || '');
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /unsafe-eval/, 'CSP nao pode reintroduzir unsafe-eval');
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/, 'script-src nao pode permitir unsafe-inline');
});

test('OPS-002 (contrato de plataforma): maxDuration das funcoes api/*.js permanece 30s', () => {
  const config = loadVercelConfig();
  const functions = config.functions && config.functions['api/*.js'];
  assert.ok(functions, 'vercel.json deve declarar functions para api/*.js');
  assert.equal(functions.maxDuration, 30, 'o orcamento absoluto das rotas assume maxDuration de 30s');
});
