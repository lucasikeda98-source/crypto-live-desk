'use strict';

// UX-004/UX-007 (REV-CC-01): amplia a cobertura de acessibilidade alem dos 6 seletores
// originais — alvos de toque de 44px, foco de teclado na calculadora (o outline:0 do campo
// base suprimia o :focus-visible global) e a semantica do disclosure de explicacao do score.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('alvos de toque: summary da explicacao do score e controles de acao tem 44px', () => {
  assert.match(css, /\.score-explanation summary\s*\{[^}]*min-height:\s*44px/s, 'summary do disclosure precisa de alvo >= 44px');
  assert.match(css, /\.icon-button, \.live-button, \.time-tabs button, \.chip-button\s*\{[^}]*height:\s*44px/s);
  assert.match(css, /\.chip-button\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.calculator-grid input, \.calculator-grid select\s*\{[^}]*min-height:\s*44px/s);
});

test('foco de teclado da calculadora nao e suprimido pelo outline:0 do campo base', () => {
  // O rotulo global usa :where(...):focus-visible (especificidade zero); qualquer seletor de
  // classe com outline:0 o anula. A calculadora precisa de regra propria de :focus-visible.
  assert.match(css, /\.calculator-grid input:focus-visible, \.calculator-grid select:focus-visible\s*\{[^}]*outline:\s*3px solid/s);
  assert.match(css, /:where\(a, button, input, select, summary, \[tabindex\]\):focus-visible\s*\{[^}]*outline:\s*3px solid/s, 'foco global de teclado deve permanecer');
});

test('disclosure da explicacao do score usa details/summary nativos e regioes roladas sao focaveis', () => {
  assert.match(html, /<details class="score-explanation" id="scoreExplanation">\s*<summary>/, 'disclosure deve ser details/summary nativo');
  const focusableRegions = html.match(/class="explanation-table-wrap"[^>]*tabindex="0"/g) || [];
  const allRegions = html.match(/class="explanation-table-wrap"/g) || [];
  assert.equal(focusableRegions.length, allRegions.length, 'toda regiao de tabela rolada deve ser focavel via teclado');
  (html.match(/class="explanation-table-wrap"[^>]*/g) || []).forEach((fragment) => {
    assert.match(fragment, /role="region"/, 'regiao rolada precisa de role="region"');
    assert.match(fragment, /aria-label="/, 'regiao rolada precisa de aria-label');
  });
  assert.match(css, /\.explanation-table-wrap:focus-visible\s*\{[^}]*outline/s);
});
