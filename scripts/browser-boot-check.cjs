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

  const networkNoise = /(Failed to fetch|net::|ERR_|4\d\d|5\d\d|NetworkError|Load failed|fetch|Failed to load resource|Service Unavailable|WebSocket)/i;
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
