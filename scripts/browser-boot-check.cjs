'use strict';
// Boot-check de navegador INDEPENDENTE de Binance: valida que o app carrega no Chromium sem
// excecao nao capturada e com o DOM/layout esperados, mesmo com TODAS as fontes de rede fora.
// Diferente do browser-smoke.cjs (gate autoritativo, exige Binance e roda local/contra deploy),
// este check e executavel em CI geo-restringido: falhas de REDE sao esperadas e filtradas;
// qualquer erro DO APP (SyntaxError/ReferenceError/TypeError, console.error proprio) reprova.
// Requisitos: `playwright` ou `playwright-core` resolvivel + Chromium (npx playwright install
// chromium). Overrides: BOOT_CHECK_CHROMIUM (caminho do binario), BOOT_CHECK_PORT.
const { spawn } = require('node:child_process');
const path = require('node:path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (outer) {
  try { ({ chromium } = require('playwright-core')); }
  catch (inner) {
    console.error('boot-check: instale playwright (npm i --no-save playwright && npx playwright install chromium)');
    process.exit(2);
  }
}

const PORT = Number(process.env.BOOT_CHECK_PORT || 5199);
const URL = 'http://127.0.0.1:' + PORT + '/';
const ROOT = path.join(__dirname, '..');

(async () => {
  const server = spawn('node', [path.join(ROOT, 'scripts', 'dev-server.cjs')], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT) }),
    stdio: 'ignore'
  });
  await new Promise((resolve) => setTimeout(resolve, 1500));

  const launchOptions = { headless: true };
  if (process.env.BOOT_CHECK_CHROMIUM) launchOptions.executablePath = process.env.BOOT_CHECK_CHROMIUM;
  const browser = await chromium.launch(launchOptions);
  // 390x844: o menor layout suportado; overflow horizontal aqui e regressao de CSS.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.message || error)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(8000);

  const checks = [];
  const ok = (name, passed, detail) => checks.push({ name, passed: !!passed, detail: detail || '' });

  // O app troca o titulo para "SYMBOL $preco" quando o ticker carrega; runners do GitHub
  // alcancam a Binance SPOT (data-api.binance.vision) mesmo com o fapi geo-restringido,
  // entao ambos os estados sao boots validos.
  const pageTitle = await page.title();
  ok('titulo carregado', pageTitle.includes('Crypto Live') || /USDT \$/.test(pageTitle), pageTitle);
  const dom = await page.evaluate(() => ({
    disclaimer: document.body.textContent.includes('nao representam probabilidade nem recomendacao'),
    exportSignals: !!document.getElementById('exportSignalsButton'),
    signalSummaryCols: (document.querySelectorAll('.signals-summary-panel thead th') || []).length,
    alertLog: !!document.getElementById('alertLog'),
    scoreExplanation: !!document.getElementById('scoreExplanation'),
    assetGrid: !!document.getElementById('assetGrid'),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  }));
  ok('disclaimer do rodape', dom.disclaimer);
  ok('botao Exportar sinais', dom.exportSignals);
  ok('tabela de faixas com 6 colunas', dom.signalSummaryCols === 6, 'cols=' + dom.signalSummaryCols);
  ok('alertLog/explicacao/grid presentes', dom.alertLog && dom.scoreExplanation && dom.assetGrid);
  ok('sem overflow horizontal em 390px', !dom.horizontalOverflow);

  // C4/REV-CC-01: pipeline gated por comportamento real (nao regex de fonte). Quando o runner
  // tem dados spot (titulo com preco), o snapshot precisa existir com identidade completa e o
  // envelope de explicacao precisa estar renderizado. Sem dados, o boot continua valido.
  const hasLiveData = /USDT \$/.test(await page.title());
  if (hasLiveData) {
    await page.click('#viewAssetButton');
    await page.waitForTimeout(3000);
    const pipeline = await page.evaluate(() => ({
      snapshotId: (document.getElementById('updatedAt') || { dataset: {} }).dataset.snapshotId || '',
      envelope: (document.getElementById('explanationEnvelope') || {}).textContent || ''
    }));
    ok('snapshot com identidade completa (dados ao vivo)',
      /^[0-9]+\.[0-9]+\.[0-9]+[^:]*:[0-9a-f]{8}:[A-Z0-9]+USDT:/.test(pipeline.snapshotId),
      pipeline.snapshotId.slice(0, 60));
    ok('envelope de explicacao rastreavel (modelo+regras+snapshot)',
      /Modelo .+ \| regras [0-9a-f]{8} \| .*snapshot /.test(pipeline.envelope),
      pipeline.envelope.slice(0, 80));
  }

  // REV-CC-02/J: ciclo REAL de navegacao Ativo/Geral no Chromium — os testes de regex de fonte
  // nao pegariam um revert do sync do seletor mobile. Roda com ou sem dados ao vivo.
  const assetNav = await page.evaluate(() => {
    const select = document.getElementById('assetTabSelect');
    const buttons = Array.from(document.querySelectorAll('button'));
    const ativo = buttons.find((button) => button.textContent.trim() === 'Ativo');
    const geral = buttons.find((button) => button.textContent.trim() === 'Geral');
    if (!select || !ativo || !geral) return { ok: false, reason: 'controles ausentes' };
    ativo.click();
    select.value = 'signals';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const pressedAfterSelect = document.querySelectorAll('[data-asset-tab][aria-pressed="true"]').length;
    const signalsPressed = !!document.querySelector('[data-asset-tab="signals"][aria-pressed="true"]');
    geral.click();
    const pressedInGeral = document.querySelectorAll('[data-asset-tab][aria-pressed="true"]').length;
    const hiddenStillTabbable = Array.from(document.querySelectorAll('#assetTabs [data-asset-tab]')).filter((button) => button.tabIndex >= 0).length;
    ativo.click();
    return { ok: true, pressedAfterSelect, signalsPressed, pressedInGeral, hiddenStillTabbable, restored: select.value };
  });
  ok('seletor mobile sincroniza area e aria-pressed', assetNav.ok && assetNav.signalsPressed && assetNav.pressedAfterSelect === 1, JSON.stringify(assetNav));
  ok('voltar ao Geral zera aria-pressed e tira as abas da tabulacao', assetNav.ok && assetNav.pressedInGeral === 0 && assetNav.hiddenStillTabbable === 0, JSON.stringify(assetNav));
  ok('reabrir Ativo restaura a area selecionada', assetNav.ok && assetNav.restored === 'signals', String(assetNav.restored));

  // Assinaturas ANCORADAS de falha de rede do navegador. Alternativas soltas como `fetch`,
  // `ERR_`, `4\d\d` ou `WebSocket` engoliam erros reais do app (ex.: "TypeError: cannot read
  // 'fetch' of undefined" ou qualquer mensagem contendo um numero 4xx) — falso verde.
  // "has been blocked by CORS policy" e a mensagem do Chrome quando o runner geo-restrito
  // recebe 451 sem Access-Control-Allow-Origin do fapi (CC-FIX-05); e frase do navegador,
  // nao alcancavel por console.error do app sem ecoa-la de proposito.
  const networkNoise = /(Failed to fetch|net::|NetworkError|Load failed|Failed to load resource|Service Unavailable|WebSocket connection to|has been blocked by CORS policy)/i;
  const appPageErrors = pageErrors.filter((message) => !networkNoise.test(message));
  const appConsoleErrors = consoleErrors.filter((message) => !networkNoise.test(message));
  ok('zero excecoes nao capturadas do app', appPageErrors.length === 0, JSON.stringify(appPageErrors.slice(0, 3)));
  ok('zero console.error proprios do app', appConsoleErrors.length === 0, JSON.stringify(appConsoleErrors.slice(0, 3)));

  const networkErrorCount = pageErrors.length + consoleErrors.length - appPageErrors.length - appConsoleErrors.length;
  console.log('=== BROWSER BOOT CHECK (390x844, Chromium headless) ===');
  console.log('erros de rede filtrados (esperados sem conectividade):', networkErrorCount);
  let failed = 0;
  for (const check of checks) {
    console.log((check.passed ? 'PASS' : 'FAIL') + ' | ' + check.name + (check.detail ? ' | ' + check.detail : ''));
    if (!check.passed) failed += 1;
  }
  await browser.close();
  server.kill();
  console.log(failed === 0 ? 'BOOT CHECK: OK' : 'BOOT CHECK: ' + failed + ' FALHAS');
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => {
  console.error('boot-check crash:', error);
  process.exit(2);
});
