'use strict';

const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const EDGE_PATH = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173/';
const CDP_TIMEOUT_MS = 15000;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout esperando ' + label)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function ensureBaseUrl() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    if (response.ok) return null;
  } catch (error) { /* inicia servidor local abaixo */ }
  const parsed = new URL(BASE_URL);
  const localHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (!localHost || process.env.BROWSER_SMOKE_START_SERVER === 'false') {
    throw new Error('BASE_URL indisponivel e inicializacao local desativada: ' + BASE_URL);
  }
  const serverPath = path.resolve(__dirname, 'dev-server.cjs');
  const server = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, HOST: parsed.hostname, PORT: parsed.port || '80' },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });
  let serverError = '';
  server.stderr.on('data', (chunk) => { serverError += chunk.toString(); });
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('Servidor local encerrou: ' + (serverError || 'sem detalhe'));
    try {
      const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(1500) });
      if (response.ok) return server;
    } catch (error) { /* tenta novamente */ }
    await delay(150);
  }
  server.kill();
  throw new Error('Timeout iniciando servidor local em ' + BASE_URL + (serverError ? ': ' + serverError : ''));
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForJson(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) return response.json();
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw lastError || new Error('Timeout esperando DevTools');
}

function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Set();
  let sequence = 0;

  socket.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id && pending.has(payload.id)) {
      const entry = pending.get(payload.id);
      pending.delete(payload.id);
      clearTimeout(entry.timer);
      if (payload.error) entry.reject(new Error(payload.error.message));
      else entry.resolve(payload.result || {});
      return;
    }
    listeners.forEach((listener) => listener(payload));
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('close', () => {
    pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(new Error('Conexao DevTools encerrada durante o comando'));
    });
    pending.clear();
  });

  return {
    ready,
    onEvent(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    send(method, params = {}, timeoutMs = CDP_TIMEOUT_MS) {
      sequence += 1;
      const id = sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Timeout DevTools em ' + method));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Falha ao avaliar pagina');
  return result.result && result.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return;
    await delay(250);
  }
  throw new Error('Timeout esperando: ' + expression);
}

async function safeCleanup(profileDirectory) {
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  const resolved = path.resolve(profileDirectory);
  if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('crypto-live-desk-browser-')) {
    throw new Error('Recusa ao limpar perfil fora do diretorio temporario esperado');
  }
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
      return;
    } catch (error) {
      lastError = error;
      await delay(350);
    }
  }
  throw lastError;
}

async function createTab(port, url, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/json/new?' + encodeURIComponent(url), {
        method: 'PUT',
        signal: AbortSignal.timeout(2500)
      });
      if (response.ok) return response.json();
      lastError = new Error('HTTP ' + response.status);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw lastError || new Error('Timeout criando aba DevTools');
}

async function main() {
  if (!fs.existsSync(EDGE_PATH)) throw new Error('Microsoft Edge nao encontrado em ' + EDGE_PATH);
  const localServer = await ensureBaseUrl();
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'crypto-live-desk-browser-'));
  const browser = spawn(EDGE_PATH, [
    '--headless=new',
    '--disable-gpu',
    '--disable-gpu-sandbox',
    '--disable-gpu-shader-disk-cache',
    '--disable-features=Vulkan',
    '--use-angle=swiftshader',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + port,
    'about:blank'
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let browserErrors = '';
  browser.stderr.on('data', (chunk) => { browserErrors += chunk.toString(); });

  let cdp;
  let runError;
  try {
    await waitForJson('http://127.0.0.1:' + port + '/json/version', 12000);
    const tab = await createTab(port, BASE_URL);
    cdp = connectCdp(tab.webSocketDebuggerUrl);
    await withTimeout(cdp.ready, 5000, 'WebSocket DevTools');

    const exceptions = [];
    const consoleErrors = [];
    cdp.onEvent((event) => {
      if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text || 'Runtime exception');
      if (event.method === 'Log.entryAdded' && event.params.entry.level === 'error') consoleErrors.push(event.params.entry.text + (event.params.entry.url ? ' | ' + event.params.entry.url : ''));
      if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
        consoleErrors.push((event.params.args || []).map((arg) => arg.value || arg.description || '').join(' '));
      }
    });
    await Promise.all([
      cdp.send('Page.enable'),
      cdp.send('Runtime.enable'),
      cdp.send('Log.enable')
    ]);
    await cdp.send('Page.navigate', { url: BASE_URL });
    await waitFor(cdp, "document.querySelectorAll('.asset-card').length >= 20 && document.getElementById('boardSummary').textContent.includes('Radar Score')", 40000);

    const dashboard = await evaluate(cdp, `JSON.stringify({
      title: document.title,
      bodyLength: document.body.innerText.trim().length,
      cards: document.querySelectorAll('.asset-card').length,
      radarLabel: document.getElementById('boardSummary').textContent,
      modelLoaded: !!window.CryptoAnalyticsCore,
      footer: document.querySelector('.status-bar').innerText,
      gridLeaks: /\\bnull\\b|\\bNaN\\b|\\bundefined\\b/.test(document.getElementById('assetGrid').innerText)
    })`);

    await evaluate(cdp, `(() => {
      document.getElementById('viewAssetButton').click();
      const select = document.getElementById('symbolSelect');
      ['BTCUSDT', 'ETHUSDT', 'AVAXUSDT'].forEach((symbol) => {
        select.value = symbol;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return true;
    })()`);
    await waitFor(cdp, "document.getElementById('chartTitle').textContent.includes('AVAXUSDT') && document.getElementById('optionsStatus').textContent.includes('proxy informativo')", 50000);

    const asset = await evaluate(cdp, `JSON.stringify({
      view: document.body.getAttribute('data-view'),
      symbol: document.getElementById('symbolSelect').value,
      chartTitle: document.getElementById('chartTitle').textContent,
      structure: document.getElementById('structureLine').textContent,
      setup: document.getElementById('entryScoreLine').textContent,
      options: document.getElementById('optionsStatus').textContent,
      status: document.getElementById('statusText').textContent,
      snapshotId: document.getElementById('updatedAt').dataset.snapshotId,
      snapshotStamp: document.getElementById('updatedAt').textContent,
      explanationRows: document.getElementById('explanationRows') ? document.getElementById('explanationRows').querySelectorAll('tr').length : 0,
      explanationEnvelope: document.getElementById('explanationEnvelope') ? document.getElementById('explanationEnvelope').textContent : ''
    })`);

    const snapshotTransition = await evaluate(cdp, `(() => {
      const node = document.getElementById('updatedAt');
      const mode = document.getElementById('newsModeSelect');
      const before = node.dataset.snapshotId;
      mode.value = 'neutral';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      const after = node.dataset.snapshotId;
      const stamp = node.textContent;
      mode.value = 'auto';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ before, after, stamp });
    })()`);

    const calculator = await evaluate(cdp, `(() => {
      const mode = document.getElementById('calcMode');
      const side = document.getElementById('calcSide');
      mode.value = 'futures';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      side.value = 'short';
      side.dispatchEvent(new Event('change', { bubbles: true }));
      mode.value = 'spot';
      mode.dispatchEvent(new Event('change', { bubbles: true }));
      return JSON.stringify({ mode: mode.value, side: side.value, disabled: side.disabled });
    })()`);

    const intermediateBoard = await evaluate(cdp, `(() => {
      const live = document.getElementById('liveButton');
      if (live.classList.contains('is-on')) live.click();
      const interval = document.getElementById('intervalSelect');
      ['15m', '1h'].forEach((value) => {
        interval.value = value;
        interval.dispatchEvent(new Event('change', { bubbles: true }));
      });
      document.getElementById('viewDashboardButton').click();
      return document.getElementById('boardSummary').textContent;
    })()`);
    await waitFor(cdp, "document.getElementById('boardSummary').textContent.includes('neutros em 1h.') && !document.getElementById('boardSummary').textContent.includes('Leitura anterior')", 90000);
    const timeframe = await evaluate(cdp, `JSON.stringify({
      interval: document.getElementById('intervalSelect').value,
      summary: document.getElementById('boardSummary').textContent,
      status: document.getElementById('statusText').textContent,
      cards: document.querySelectorAll('.asset-card').length,
      cardIntervals: Array.from(new Set(Array.from(document.querySelectorAll('.asset-card')).map((card) => card.dataset.interval)))
    })`);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await delay(350);
    const mobile = await evaluate(cdp, `JSON.stringify({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      topbarRight: Math.ceil(document.querySelector('.topbar').getBoundingClientRect().right),
      controlsRight: Math.ceil(document.querySelector('.controls').getBoundingClientRect().right)
    })`);
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    const dashboardResult = JSON.parse(dashboard);
    const assetResult = JSON.parse(asset);
    const snapshotResult = JSON.parse(snapshotTransition);
    const calculatorResult = JSON.parse(calculator);
    const timeframeResult = JSON.parse(timeframe);
    const mobileResult = JSON.parse(mobile);
    const checks = {
      meaningfulPage: dashboardResult.bodyLength > 1000,
      fullRadar: dashboardResult.cards === 24,
      coreLoaded: dashboardResult.modelLoaded,
      radarNamed: dashboardResult.radarLabel.includes('Radar Score preview'),
      assetView: assetResult.view === 'asset' && assetResult.symbol === 'AVAXUSDT',
      finalRequestWins: assetResult.chartTitle.includes('AVAXUSDT'),
      closedCandleExplained: assetResult.structure.includes('fechamento confirmado'),
      setupNamed: assetResult.setup.includes('Setup Score preview') && assetResult.setup.includes('Data Confidence preview'),
      proxyExplained: assetResult.options.includes('proxy informativo'),
      modelStatus: assetResult.status.includes('Modelo 1.0.0-preview.5'),
      noValueLeaks: dashboardResult.gridLeaks === false,
      scoreExplained: assetResult.explanationRows >= 8 && assetResult.explanationEnvelope.includes('regras'),
      snapshotIdentityChanges: !!snapshotResult.before && !!snapshotResult.after && snapshotResult.before !== snapshotResult.after && /\| r\d+$/.test(snapshotResult.stamp),
      spotShortBlocked: calculatorResult.mode === 'spot' && calculatorResult.side === 'long' && calculatorResult.disabled,
      finalTimeframeWins: timeframeResult.interval === '1h' && timeframeResult.summary.includes('neutros em 1h.') && !timeframeResult.summary.includes('Leitura anterior'),
      timeframeTransitionExplained: intermediateBoard.includes('Leitura anterior'),
      timeframeCardsConsistent: timeframeResult.cards === 24 && timeframeResult.cardIntervals.length === 1 && timeframeResult.cardIntervals[0] === '1h',
      mobileNoHorizontalOverflow: mobileResult.scrollWidth <= mobileResult.innerWidth + 1 && mobileResult.bodyScrollWidth <= mobileResult.innerWidth + 1 && mobileResult.topbarRight <= mobileResult.innerWidth + 1 && mobileResult.controlsRight <= mobileResult.innerWidth + 1,
      noRuntimeExceptions: exceptions.length === 0,
      noConsoleErrors: consoleErrors.length === 0
    };
    const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    process.stdout.write(JSON.stringify({ checks, failed, dashboard: dashboardResult, asset: assetResult, snapshotTransition: snapshotResult, calculator: calculatorResult, timeframeTransition: intermediateBoard, timeframe: timeframeResult, mobile: mobileResult, exceptions, consoleErrors }, null, 2) + '\n');
    if (failed.length) process.exitCode = 1;
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    if (cdp) {
      try { await cdp.send('Browser.close', {}, 3000); } catch (error) { /* fechamento por processo abaixo */ }
      cdp.close();
    }
    if (browser.exitCode === null) {
      await Promise.race([once(browser, 'exit'), delay(3000)]);
    }
    if (browser.exitCode === null) {
      browser.kill();
      await Promise.race([once(browser, 'exit'), delay(3000)]);
    }
    await delay(1500);
    try { await safeCleanup(profile); } catch (cleanupError) {
      process.stderr.write('Aviso: perfil temporario nao foi removido: ' + cleanupError.message + '\n');
    }
    if (localServer && localServer.exitCode === null) {
      localServer.kill();
      await Promise.race([once(localServer, 'exit'), delay(3000)]);
    }
    if ((runError || process.exitCode || (browser.exitCode !== null && browser.exitCode !== 0)) && browserErrors) {
      process.stderr.write(browserErrors.slice(-4000));
    }
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
