(function cryptoLiveDeskApp() {
  var MODEL_VERSION = '1.0.0-preview.8';
  var AnalyticsCore = window.CryptoAnalyticsCore;
  if (!AnalyticsCore) throw new Error('CryptoAnalyticsCore nao foi carregado.');
  var RequestClient = window.CryptoRequestClient;
  if (!RequestClient) throw new Error('CryptoRequestClient nao foi carregado.');
  var SignalSync = window.CryptoSignalSyncClient;
  if (!SignalSync) throw new Error('CryptoSignalSyncClient nao foi carregado.');
  var CrossTabLock = window.CryptoCrossTabLock;
  if (!CrossTabLock) throw new Error('CryptoCrossTabLock nao foi carregado.');
  // The full app function joins the complete analytics core artifact in the implementation hash.
  // This is intentionally conservative: no transitive score helper can change invisibly.
  var RULESET_HASH = AnalyticsCore.rulesetHash(undefined, [cryptoLiveDeskApp]);
  var refreshGate = AnalyticsCore.createRequestGate();
  var sourceThrottle = AnalyticsCore.createSourceThrottle({ baseCooldownMs: 5000, maxCooldownMs: 300000 });
  var requestBudget = AnalyticsCore.createRequestBudget({ maxConcurrent: 8, maxStartsPerWindow: 180, maxStartsPerSource: 60, windowMs: 60000, maxQueue: 128 });
  var networkClient = RequestClient.createRequestClient({
    budget: requestBudget,
    throttle: sourceThrottle,
    health: health,
    classifyHttpError: AnalyticsCore.classifyHttpError,
    parseRetryAfter: AnalyticsCore.parseRetryAfter
  });
  var REFRESH_MS = 3000;
  var BOARD_REFRESH_MS = 60000;
  var DERIVATIVES_REFRESH_MS = 15000;
  var CHAIN_REFRESH_MS = 30000;
  var NEWS_REFRESH_MS = 300000;
  var EXTERNAL_REFRESH_MS = 120000;
  var MTF_REFRESH_MS = 60000;
  var ONCHAIN_REFRESH_MS = 900000;
  var ONCHAIN_STALE_MS = 48 * 60 * 60 * 1000;
  var OPTIONS_REFRESH_MS = 60000;
  var OPTIONS_STALE_MS = 5 * 60 * 1000;
  var INSTITUTIONAL_REFRESH_MS = 300000;
  // ETF/EOD observations remain current across weekends; 36h incorrectly made Friday stale on Sunday.
  var INSTITUTIONAL_STALE_MS = 96 * 60 * 60 * 1000;
  var MICROSTRUCTURE_REFRESH_MS = 15000;
  var MICROSTRUCTURE_STALE_MS = 60 * 1000;
  var NEWS_ITEM_STALE_MS = 36 * 60 * 60 * 1000;
  var EXTERNAL_STALE_MS = 10 * 60 * 1000;
  var EOD_STALE_MS = 96 * 60 * 60 * 1000;
  var HISTORY_REFRESH_MS = 21600000;
  var HISTORY_STALE_MS = 48 * 60 * 60 * 1000;
  var DISPLAY_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'horario local';
  var BINANCE_SPOT_BASES = ['https://data-api.binance.vision', 'https://api.binance.com'];
  var BINANCE_INTERVALS = ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'];
  var MTF_INTERVALS = ['15m', '1h', '4h', '1d', '1w'];
  var ASSETS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'TRXUSDT', 'DOTUSDT', 'LTCUSDT', 'BCHUSDT', 'UNIUSDT', 'NEARUSDT', 'ATOMUSDT', 'FILUSDT', 'AAVEUSDT', 'SUIUSDT', 'HBARUSDT', 'XLMUSDT', 'ICPUSDT', 'ARBUSDT', 'OPUSDT'];
  var ASSET_NAMES = {
    BTCUSDT: 'Bitcoin',
    ETHUSDT: 'Ethereum',
    BNBUSDT: 'BNB',
    SOLUSDT: 'Solana',
    XRPUSDT: 'XRP',
    DOGEUSDT: 'Dogecoin',
    ADAUSDT: 'Cardano',
    AVAXUSDT: 'Avalanche',
    LINKUSDT: 'Chainlink',
    TRXUSDT: 'TRON',
    DOTUSDT: 'Polkadot',
    LTCUSDT: 'Litecoin',
    BCHUSDT: 'Bitcoin Cash',
    UNIUSDT: 'Uniswap',
    NEARUSDT: 'NEAR',
    ATOMUSDT: 'Cosmos',
    FILUSDT: 'Filecoin',
    AAVEUSDT: 'Aave',
    SUIUSDT: 'Sui',
    HBARUSDT: 'Hedera',
    XLMUSDT: 'Stellar',
    ICPUSDT: 'Internet Computer',
    ARBUSDT: 'Arbitrum',
    OPUSDT: 'Optimism'
  };
  var ASSET_CONTEXT = {
    BTCUSDT: { gecko: 'bitcoin', paprika: 'btc-bitcoin', chain: 'Bitcoin', kind: 'Reserva / macro beta', narrative: 'Bitcoin guia liquidez, dominancia e apetite de risco. Para BTC, peso maior em macro, funding, OI e sentimento global.' },
    ETHUSDT: { gecko: 'ethereum', paprika: 'eth-ethereum', chain: 'Ethereum', kind: 'L1 + DeFi', narrative: 'Ethereum responde a TVL, fees, stablecoins, atividade DeFi e beta de mercado. Chain TVL ajuda a medir demanda estrutural.' },
    BNBUSDT: { gecko: 'binancecoin', paprika: 'bnb-binance-coin', chain: 'BSC', kind: 'Exchange/L1', narrative: 'BNB combina beta cripto, atividade da BSC e risco ligado ao ecossistema Binance.' },
    SOLUSDT: { gecko: 'solana', paprika: 'sol-solana', chain: 'Solana', kind: 'L1 alto beta', narrative: 'Solana tende a reagir forte a fluxo de risco, TVL, DEX volume e narrativas de rede.' },
    XRPUSDT: { gecko: 'ripple', paprika: 'xrp-xrp', chain: 'XRP', kind: 'Pagamentos', narrative: 'XRP costuma ser sensivel a noticias regulatórias, fluxo especulativo e liquidez do mercado amplo.' },
    DOGEUSDT: { gecko: 'dogecoin', paprika: 'doge-dogecoin', kind: 'Meme beta', narrative: 'DOGE e fortemente guiado por sentimento, momentum, volume e apetite por risco em alts.' },
    ADAUSDT: { gecko: 'cardano', paprika: 'ada-cardano', chain: 'Cardano', kind: 'L1', narrative: 'Cardano combina beta de L1, atividade de rede e ciclos de narrativas de desenvolvimento.' },
    AVAXUSDT: { gecko: 'avalanche-2', paprika: 'avax-avalanche', chain: 'Avalanche', kind: 'L1 + DeFi', narrative: 'Avalanche reage a TVL, subnets/ecossistema DeFi, fluxo de alts e liquidez global.' },
    LINKUSDT: { gecko: 'chainlink', paprika: 'link-chainlink', protocol: 'Chainlink', kind: 'Infra oracle', narrative: 'LINK responde a adoção de oraculos, receitas/protocolo e rotacao para infraestrutura cripto.' },
    TRXUSDT: { gecko: 'tron', paprika: 'trx-tron', chain: 'Tron', kind: 'L1/stablecoins', narrative: 'TRON tem leitura forte em stablecoins, atividade de rede e fluxo defensivo dentro de cripto.' },
    DOTUSDT: { gecko: 'polkadot', paprika: 'dot-polkadot', chain: 'Polkadot', kind: 'L1 interoperabilidade', narrative: 'DOT depende de ciclo de alts, atividade do ecossistema e retomada de apetite por L1s.' },
    LTCUSDT: { gecko: 'litecoin', paprika: 'ltc-litecoin', kind: 'Moeda legado', narrative: 'Litecoin costuma seguir liquidez ampla, momentum tecnico e rotacao para moedas de maior historico.' },
    BCHUSDT: { gecko: 'bitcoin-cash', paprika: 'bch-bitcoin-cash', kind: 'Moeda legado', narrative: 'BCH tende a se mover com beta de Bitcoin, fluxo especulativo e narrativas de pagamentos.' },
    UNIUSDT: { gecko: 'uniswap', paprika: 'uni-uniswap', protocol: 'Uniswap', chain: 'Ethereum', kind: 'DEX / DeFi', narrative: 'UNI ganha contexto com volumes DEX, receitas de protocolo e rotacao para tokens DeFi.' },
    NEARUSDT: { gecko: 'near', paprika: 'near-near-protocol', chain: 'Near', kind: 'L1 alto beta', narrative: 'NEAR costuma amplificar apetite por risco em L1s, IA/narrativas e atividade do ecossistema.' },
    ATOMUSDT: { gecko: 'cosmos', paprika: 'atom-cosmos', chain: 'CosmosHub', kind: 'Interoperabilidade', narrative: 'ATOM depende de fluxo para ecossistemas modulares, staking e rotacao para infraestrutura.' },
    FILUSDT: { gecko: 'filecoin', paprika: 'fil-filecoin', chain: 'Filecoin', kind: 'Storage/infra', narrative: 'FIL reage a narrativas de storage, infraestrutura descentralizada e beta de alts.' },
    AAVEUSDT: { gecko: 'aave', paprika: 'aave-new', protocol: 'AAVE', chain: 'Ethereum', kind: 'Lending / DeFi', narrative: 'AAVE tem leitura forte em TVL, receitas, demanda por lending e retomada de DeFi.' },
    SUIUSDT: { gecko: 'sui', paprika: 'sui-sui', chain: 'Sui', kind: 'L1 alto beta', narrative: 'SUI combina crescimento de ecossistema, atividade DEX e sensibilidade elevada a rotacao de liquidez em L1s.' },
    HBARUSDT: { gecko: 'hedera-hashgraph', paprika: 'hbar-hedera', chain: 'Hedera', kind: 'Rede empresarial', narrative: 'HBAR reage a adocao empresarial, atividade de rede e ciclos de liquidez em altcoins.' },
    XLMUSDT: { gecko: 'stellar', paprika: 'xlm-stellar', chain: 'Stellar', kind: 'Pagamentos', narrative: 'XLM responde a fluxo de pagamentos, noticias reguladoras e rotacao em ativos de infraestrutura financeira.' },
    ICPUSDT: { gecko: 'internet-computer', paprika: 'icp-internet-computer', chain: 'ICP', kind: 'Compute / L1', narrative: 'ICP combina beta de infraestrutura, atividade de desenvolvedores e narrativas de compute descentralizado.' },
    ARBUSDT: { gecko: 'arbitrum', paprika: 'arb-arbitrum', chain: 'Arbitrum', kind: 'Ethereum L2', narrative: 'ARB depende de TVL, volume DEX, atividade de L2 e calendario de desbloqueios.' },
    OPUSDT: { gecko: 'optimism', paprika: 'op-optimism', chain: 'Optimism', kind: 'Ethereum L2', narrative: 'OP reage a atividade do Superchain, TVL, receitas de L2 e desbloqueios de tokens.' }
  };
  var state = { symbol: 'BTCUSDT', interval: '5m', view: 'dashboard', assetTab: 'summary', live: true, refreshing: false, pendingRefresh: false, boardRefreshing: false, boardPendingRefresh: false, contextRefreshing: false, contextPromise: null, chainRefreshing: false, timer: null, klines: [], analysis: null, board: [], boardFetchedAt: 0, boardInterval: '', sort: 'score', chain: null, chainFetchedAt: 0, news: [], newsFetchedAt: 0, newsAttemptedAt: 0, newsMode: 'auto', newsOverrideAt: null, newsOverrideAuthor: null, newsOverrideReason: null, newsSources: [], external: {}, externalFetchedAt: 0, externalAttemptedAt: 0, derivativeCache: {}, mtfCache: {}, mtf: null, historyProfiles: {}, historyCandles: {}, historyLoading: {}, coinMetricsCache: {}, coinMetrics: null, optionsCache: {}, options: null, optionsFetchedAt: 0, institutionalCache: {}, institutional: null, institutionalFetchedAt: 0, microstructureCache: {}, microstructure: null, liquidations: [], liquidationSocket: null, liquidationSymbol: '', liquidationConnected: false, liquidationReconnectTimer: null, apiHealth: {}, boardFailures: {}, trapVetos: {}, signalMachineEval: {}, quantChecks: null, chart: { ema9: true, ema21: true, ema50: true, ema200: false, bb: false, vwap: false, supertrend: false, levels: true, fib: false, patterns: true, candles: 120 } };
  var $ = function (id) { return document.getElementById(id); };
  function analysisMatchesSelection(analysis) {
    if (!analysis) return false;
    if (!analysis.snapshot) return true;
    return analysis.snapshot.symbol === state.symbol && analysis.snapshot.interval === state.interval;
  }
  var fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
  var fmt0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  function cleanZero(n) { return Number.isFinite(n) && Math.abs(n) < 1e-9 ? 0 : n; }
  function money(n) { return AnalyticsCore.formatUsd(n); }
  function compactMoney(n) { return Number.isFinite(n) ? '$' + new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : '--'; }
  function num(n, d) { n = cleanZero(n); return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: d == null ? 2 : d }).format(n) : '--'; }
  function percent(n, d) { n = cleanZero(n); return Number.isFinite(n) ? (n >= 0 ? '+' : '') + n.toFixed(d == null ? 2 : d) + '%' : '--'; }
  function text(id, value) { var node = $(id); if (node) node.textContent = value; }
  function renderSnapshotStamp(analysis) {
    if (!analysis) return;
    var snapshot = analysis.snapshot || {};
    var signalTime = snapshot.signalCloseTime || analysis.signalCandle && analysis.signalCandle.closeTime;
    var calculatedTime = snapshot.calculatedAt || Date.now();
    text('updatedAt', 'v' + MODEL_VERSION + ' | candle fechado ' + (signalTime ? new Date(signalTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--') + ' | snapshot ' + new Date(calculatedTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' | ' + DISPLAY_TIME_ZONE + ' | r' + (snapshot.revision || 0));
    var node = $('updatedAt');
    if (node) {
      node.dataset.snapshotId = snapshot.inputSnapshotId || '';
      node.title = snapshot.updateReason ? 'Ultima mudanca do snapshot: ' + snapshot.updateReason : '';
    }
  }
  function mtfInputStamp() {
    var multi = state.mtf;
    if (!multi || !multi.rows || !multi.rows.length) return 'na';
    return multi.rows.map(function (row) { return row.interval + '@' + (Number.isFinite(row.closeTime) ? row.closeTime : 'x'); }).join(',');
  }
  function scoreInputComponents(analysis) {
    var finiteOrNull = function (value) { return Number.isFinite(value) ? value : null; };
    var detail = analysis.derivativeDetail || {}, flow = analysis.coinMetrics && analysis.coinMetrics.exchangeFlow || {};
    var options = analysis.options || {}, optionMarket = options.market || {}, optionNearest = options.nearest || {};
    var external = analysis.external || {}, news = scoreNews(state.symbol), liquidations = liquidationSummary();
    return {
      signalCandle: analysis.signalCandle ? { time: analysis.signalCandle.time, closeTime: analysis.signalCandle.closeTime, open: analysis.signalCandle.open, high: analysis.signalCandle.high, low: analysis.signalCandle.low, close: analysis.signalCandle.close, volume: analysis.signalCandle.volume, takerBuy: finiteOrNull(analysis.signalCandle.takerBuy) } : null,
      market: { funding: finiteOrNull(analysis.funding), basis: finiteOrNull(analysis.basis), tickerChange24h: finiteOrNull(finiteNumber(analysis.ticker && analysis.ticker.priceChangePercent)) },
      book: { bidQty: finiteOrNull(analysis.bidQty), askQty: finiteOrNull(analysis.askQty), spreadBps: finiteOrNull(analysis.spreadBps), bookImbalance: finiteOrNull(analysis.bookImb), buySlipBps: finiteOrNull(analysis.buySlipBps), sellSlipBps: finiteOrNull(analysis.sellSlipBps) },
      derivatives: { status: datasetStatus(detail), oiChangePct: finiteOrNull(detail.oiChangePct), fundingAvg: finiteOrNull(detail.fundingAvg), longShortRatio: finiteOrNull(detail.longShortRatio), takerRatio: finiteOrNull(detail.takerRatio), topPositionRatio: finiteOrNull(detail.topPositionRatio), basisRate: finiteOrNull(detail.basisRate) },
      onchain: { status: datasetStatus(analysis.coinMetrics), score: finiteOrNull(analysis.chainScore), nativeChainScore: finiteOrNull(analysis.nativeChainScore), netflow7d: finiteOrNull(flow.netflow7d), coverageDays: finiteOrNull(flow.flowCoverageDays) },
      options: { status: datasetStatus(options), isProxy: !!options.isProxy, dvol: finiteOrNull(options.dvol && options.dvol.latest), putCallOi: finiteOrNull(optionMarket.putCallOi), putCallVolume: finiteOrNull(optionMarket.putCallVolume), atmIv: finiteOrNull(optionNearest.atmIv), expectedMove: finiteOrNull(optionNearest.expectedMove) },
      institutional: { status: datasetStatus(analysis.institutional), etfFlow: finiteOrNull(latestEtfFlow(analysis.institutional)) },
      external: { status: datasetStatus(external), total: finiteOrNull(external.total), sentiment: finiteOrNull(external.sentiment), global: finiteOrNull(external.global), asset: finiteOrNull(external.asset), defi: finiteOrNull(external.defi) },
      news: { mode: state.newsMode, provenance: state.newsMode === 'auto' ? 'rss-auto' : 'manual-user-session', overrideAt: state.newsOverrideAt, overrideAuthor: state.newsOverrideAuthor, overrideReason: state.newsOverrideReason, score: finiteOrNull(news.score), items: news.items.length, newestObservedAt: news.items.length ? Math.max.apply(null, news.items.map(function (item) { return timestampMs(item.observedAt); }).filter(Number.isFinite).concat([0])) : null },
      multiTimeframe: state.mtf && state.mtf.rows ? state.mtf.rows.map(function (row) { return { interval: row.interval, closeTime: finiteOrNull(row.closeTime), score: finiteOrNull(row.score), bias: row.bias }; }) : [],
      history: analysis.history ? { status: historyFresh(analysis.history) ? 'fresh' : 'stale', observedAt: finiteOrNull(timestampMs(analysis.history.observedAt)), score: finiteOrNull(analysis.history.score), samples: finiteOrNull(analysis.history.samples) } : null,
      liquidations: { long15m: finiteOrNull(liquidations.longValue), short15m: finiteOrNull(liquidations.shortValue), events15m: liquidations.recent.length, latestEventAt: liquidations.recent.length ? liquidations.recent[0].time : null },
      events: { trap: analysis.trap || null, squeeze: analysis.squeeze || null, structureShift: analysis.structureShift || null, divergence: analysis.divergence || null, volumeClimax: analysis.volumeClimax || null }
    };
  }
  function evidenceDataset(sourceIds, observedAt, payload) {
    var observed = timestampMs(observedAt);
    return { sourceIds: sourceIds, observedAt: Number.isFinite(observed) ? observed : null, payload: payload };
  }
  function multiTimeframeRawEvidence(symbol) {
    var candlesByInterval = {};
    var rows = state.mtf && Array.isArray(state.mtf.rows) ? state.mtf.rows : [];
    rows.forEach(function (row) {
      var cached = state.mtfCache[symbol + ':' + row.interval];
      candlesByInterval[row.interval] = cached && Array.isArray(cached.candles) ? cached.candles : [];
    });
    return { aggregation: state.mtf || null, candlesByInterval: candlesByInterval };
  }
  function externalRawEvidence(symbol, analysis) {
    var ext = state.external || {};
    var marketData = ext.marketData || {};
    return {
      observedAt: ext.observedAt || null,
      fetchedAt: ext.fetchedAt || null,
      dataStatus: ext.dataStatus || null,
      fearGreed: ext.fearGreed || null,
      marketDataStatus: {
        source: marketData.source || null,
        observedAt: marketData.observedAt || null,
        fetchedAt: marketData.fetchedAt || null,
        staleAfterMs: marketData.staleAfterMs || null,
        dataStatus: marketData.dataStatus || null,
        eligibleForScore: !!marketData.eligibleForScore
      },
      global: ext.global || null,
      selectedMarket: selectedMarket(symbol),
      paprikaGlobal: ext.paprikaGlobal || null,
      macro: ext.macro || null,
      tradfi: ext.tradfi || null,
      selectedChain: analysis.external && analysis.external.chain || null,
      selectedProtocol: analysis.external && analysis.external.protocol || null,
      scored: analysis.external || null
    };
  }
  /** Capture a detached, immutable evidence bundle at the same synchronous boundary as the score id. */
  function captureRawEvidence(analysis, snapshot) {
    var symbol = snapshot.symbol || state.symbol;
    var closedCandles = selectClosedCandles(state.klines);
    var signalObservedAt = analysis.signalCandle && analysis.signalCandle.closeTime;
    var newsSource = state.newsMode === 'auto' ? 'rss-news' : 'manual-user-session';
    var rawDatasets = {
      decisionState: evidenceDataset(['binance-spot-klines', 'binance-liquidations', newsSource], snapshot.calculatedAt, {
        inputComponents: snapshot.inputComponents,
        trapVetos: state.trapVetos,
        activeTrapVeto: activeTrapVeto(analysis),
        newsMode: state.newsMode,
        newsOverrideAt: state.newsOverrideAt,
        newsOverrideAuthor: state.newsOverrideAuthor,
        newsOverrideReason: state.newsOverrideReason
      }),
      derivatives: evidenceDataset(['binance-futures'], analysis.derivativeDetail && analysis.derivativeDetail.observedAt, {
        detail: analysis.derivativeDetail || null,
        premium: analysis.marketInputs && analysis.marketInputs.premium || null,
        openInterest: analysis.marketInputs && analysis.marketInputs.openInterest || null
      }),
      externalContext: evidenceDataset(['coingecko-market', 'coinpaprika-market', 'alternative-me', 'us-treasury-yields', 'cboe-vix', 'tradfi-yahoo', 'defillama'], state.external && (state.external.observedAt || state.external.fetchedAt), {
        scoreInputs: externalRawEvidence(symbol, analysis)
      }),
      history: evidenceDataset(['binance-daily-history'], analysis.history && analysis.history.observedAt, {
        candles: state.historyCandles[symbol] || [],
        profile: analysis.history || null
      }),
      institutional: evidenceDataset(['cryptoetf-public', 'cftc-legacy'], analysis.institutional && analysis.institutional.observedAt, analysis.institutional || null),
      liquidations: evidenceDataset(['binance-liquidations'], state.liquidations.length ? state.liquidations[0].time : null, {
        events: state.liquidations,
        summary: liquidationSummary()
      }),
      microstructure: evidenceDataset(['binance-aggtrades', 'cross-venue-quotes'], analysis.microstructure && analysis.microstructure.observedAt, analysis.microstructure || null),
      multiTimeframe: evidenceDataset(['binance-spot-klines'], signalObservedAt, multiTimeframeRawEvidence(symbol)),
      news: evidenceDataset([newsSource], state.newsFetchedAt, {
        items: state.news,
        sources: state.newsSources,
        mode: state.newsMode,
        overrideAt: state.newsOverrideAt,
        overrideAuthor: state.newsOverrideAuthor,
        overrideReason: state.newsOverrideReason
      }),
      onchain: evidenceDataset(['coinmetrics-community', 'mempool-space'], analysis.coinMetrics && analysis.coinMetrics.observedAt, {
        coinMetrics: analysis.coinMetrics || null,
        nativeChain: analysis.chain || null,
        mempoolContext: analysis.mempoolContext || null
      }),
      options: evidenceDataset(['deribit-options'], analysis.options && analysis.options.observedAt, analysis.options || null),
      selectedMarket: evidenceDataset(['binance-spot-klines', 'binance-spot-ticker', 'binance-spot-depth'], signalObservedAt, {
        candles: state.klines,
        closedCandleCount: closedCandles.length,
        signalCandle: analysis.signalCandle || null,
        liveCandle: analysis.liveCandle || null,
        ticker: analysis.marketInputs && analysis.marketInputs.ticker || analysis.ticker || null,
        depth: analysis.marketInputs && analysis.marketInputs.depth || null
      })
    };
    return AnalyticsCore.buildRawEvidenceEnvelope({
      capturedAt: snapshot.calculatedAt,
      modelVersion: MODEL_VERSION,
      rulesetHash: RULESET_HASH,
      inputSnapshotId: snapshot.inputSnapshotId,
      datasets: rawDatasets
    });
  }
  /**
   * The snapshot id hashes every score-driving input, including continuous book/liquidation
   * observations. Calculation time stays excluded: identical inputs still produce the same id.
   */
  function buildInputSnapshotId(analysis, snapshot) {
    // ANL-001: identidade calculada pelo core (testavel); aqui so montamos o spec do estado.
    return AnalyticsCore.buildInputSnapshotId({
      modelVersion: MODEL_VERSION,
      rulesetHash: RULESET_HASH,
      symbol: snapshot.symbol || state.symbol,
      interval: snapshot.interval || state.interval,
      signalCloseTime: snapshot.signalCloseTime || 0,
      derivativeDetail: analysis.derivativeDetail,
      coinMetrics: analysis.coinMetrics,
      options: analysis.options,
      institutional: analysis.institutional,
      externalFetchedAt: state.external && state.external.fetchedAt ? state.external.fetchedAt : null,
      newsFetchedAt: state.newsFetchedAt,
      newsMode: state.newsMode,
      newsOverrideAt: state.newsOverrideAt,
      mtfStamp: mtfInputStamp(),
      history: analysis.history,
      inputComponents: snapshot.inputComponents || scoreInputComponents(analysis)
    });
  }
  function stampAnalysisSnapshot(analysis, reason, fields) {
    if (!analysis) return null;
    var prior = analysis.snapshot || {};
    var revision = (prior.revision || 0) + 1;
    var calculatedAt = Date.now();
    var snapshot = Object.assign({}, prior, fields || {}, {
      modelVersion: MODEL_VERSION,
      rulesetHash: RULESET_HASH,
      calculatedAt: calculatedAt,
      revision: revision,
      updateReason: reason || 'refresh'
    });
    snapshot.inputComponents = scoreInputComponents(analysis);
    snapshot.inputSnapshotId = buildInputSnapshotId(analysis, snapshot);
    analysis.rawEvidence = captureRawEvidence(analysis, snapshot);
    snapshot.rawEvidenceHash = analysis.rawEvidence.envelopeHash;
    analysis.snapshot = snapshot;
    if (analysis === state.analysis) renderSnapshotStamp(analysis);
    return snapshot;
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function avg(values) { return values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : NaN; }
  function last(arr) { return arr[arr.length - 1]; }
  function finiteNumber(value) { var parsed = AnalyticsCore.toFiniteNumber(value); return parsed === null ? NaN : parsed; }
  function firstFinite(values) {
    for (var i = 0; i < values.length; i++) {
      var value = finiteNumber(values[i]);
      if (Number.isFinite(value)) return value;
    }
    return NaN;
  }
  function sumFinite(values) {
    var total = 0;
    var count = 0;
    values.forEach(function (raw) {
      var value = finiteNumber(raw);
      if (Number.isFinite(value)) { total += value; count += 1; }
    });
    return count ? total : NaN;
  }
  function counted(value, singular, plural) { return value + ' ' + (value === 1 ? singular : plural); }
  function escapeHTML(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch];
    });
  }
  function safeURL(value) {
    var url = String(value || '#');
    return /^https?:\/\//i.test(url) ? url : '#';
  }
  function lastFinite(arr) {
    for (var i = arr.length - 1; i >= 0; i--) {
      if (Number.isFinite(arr[i])) return arr[i];
    }
    return NaN;
  }
  function baseAsset(symbol) { return symbol.replace(/USDT$/, ''); }
  function contextFor(symbol) {
    return ASSET_CONTEXT[symbol] || { gecko: baseAsset(symbol).toLowerCase(), paprika: '', kind: 'Criptoativo', narrative: 'Ativo acompanhado por mercado Binance, momentum, fluxo, noticias e contexto global.' };
  }
  function biasFromScore(score) { return score === null || !Number.isFinite(score) ? 'Indisponivel' : score >= 35 ? 'Comprador' : score <= -35 ? 'Vendedor' : 'Neutro'; }
  function sortableScore(analysis) { var score = analysis && analysis.score; return Number.isFinite(score) ? score : -Infinity; }
  function compactNumber(n) { return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n) : '--'; }
  function compactUsd(n) { return Number.isFinite(n) ? '$' + compactNumber(n) : '--'; }
  function intervalLabel(interval) { return interval === '1m' ? '1 min' : interval === '1M' ? '1 mes' : interval; }
  function normKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function sourceRow(name, ok, detail) { return { name: name, ok: !!ok, detail: detail || (ok ? 'online' : 'sem leitura') }; }
  function sourceReference(sourceId) {
    var source = AnalyticsCore.SOURCE_REGISTRY[sourceId];
    return source ? source.provider + ' [' + sourceId + ']' : 'FONTE NAO REGISTRADA [' + sourceId + ']';
  }
  function sourceReferenceTitle(sourceId) {
    var source = AnalyticsCore.SOURCE_REGISTRY[sourceId];
    if (!source) return 'Fonte ausente do registro normativo';
    var validity = source.staleAfterMs === 0 ? 'somente no instante aplicado' : Math.round(source.staleAfterMs / 60000) + ' min';
    return source.metrics.join(', ') + ' | unidade: ' + source.unit + ' | validade: ' + validity + ' | ausencia: ' + source.unavailablePolicy;
  }
  function health(name, ok, detail) {
    if (!name) return;
    var prior = state.apiHealth[name] || {};
    state.apiHealth[name] = {
      ok: !!ok,
      detail: detail || (ok ? 'online' : 'falhou'),
      checkedAt: Date.now(),
      lastSuccess: ok ? Date.now() : prior.lastSuccess || 0
    };
  }
  async function fetchJSON(url, timeout, source, options) {
    return networkClient.fetchJSON(url, timeout, source, options);
  }
  async function fetchSpotJSON(path, timeout, source) {
    return networkClient.fetchFromBases(BINANCE_SPOT_BASES, path, timeout, source);
  }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  var crossTabStorage = null;
  try { crossTabStorage = window.localStorage; } catch (error) { /* coordinator reports degradation */ }
  var crossTabCoordinator = CrossTabLock.createCoordinator({
    locks: typeof navigator !== 'undefined' ? navigator.locks : null,
    storage: crossTabStorage,
    cryptoApi: window.crypto,
    onDegraded: function (reason) {
      health('Concorrencia multiaba', false, reason === 'cross-tab-lock-unavailable'
        ? 'sem Web Locks/localStorage; serializacao limitada a esta aba'
        : 'lease multiaba indisponivel; serializacao limitada a esta aba');
    }
  });
  function withCrossTabLock(name, task) { return crossTabCoordinator.run(name, task); }
  // Session fallback keeps the state coherent when storage is blocked or full. It is deliberately
  // volatile and never presented as durable across reloads.
  var volatileStorage = Object.create(null);
  function safeStorageGet(key) {
    try {
      if (Object.prototype.hasOwnProperty.call(volatileStorage, key)) return JSON.parse(volatileStorage[key]);
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (error) { return null; }
  }
  function safeStorageSet(key, value) {
    var serialized;
    try { serialized = JSON.stringify(value); }
    catch (error) { return false; }
    try {
      localStorage.setItem(key, serialized);
      delete volatileStorage[key];
      return true;
    } catch (error) {
      volatileStorage[key] = serialized;
      // Surface a quota failure instead of silently dropping the journal/history write.
      if (error && (error.name === 'QuotaExceededError' || error.code === 22 || /quota/i.test(error.message || ''))) {
        health('Armazenamento local', false, 'quota excedida; usando fallback volatil apenas nesta sessao');
      } else health('Armazenamento local', false, 'indisponivel; usando fallback volatil apenas nesta sessao');
      return false;
    }
  }
  function reportLegacyStorage() {
    // Historical model evidence is immutable by default. Cleanup must be an explicit user action
    // scoped to a named version; boot only reports preserved legacy keys for cross-version review.
    // (Chaves sao versionadas por MODEL_VERSION, entao maquinas de trade antigas nunca sao
    // carregadas pela versao nova — preservar nao reativa estado transiente de outra versao.)
    try {
      var keepHistoryPrefix = 'liveDesk.history.' + MODEL_VERSION + '.';
      var versionedPrefixes = ['cld-signal-journal:', 'cld-signal-machine:', 'cld-signal-trades:'];
      var legacyCount = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key || key.indexOf('archived:') === 0) continue;
        var staleHistory = key.indexOf('liveDesk.history.') === 0 && key.indexOf(keepHistoryPrefix) !== 0;
        var staleVersioned = versionedPrefixes.some(function (prefix) {
          return key.indexOf(prefix) === 0 && key !== prefix + MODEL_VERSION;
        });
        if (staleHistory || staleVersioned) legacyCount += 1;
      }
      if (legacyCount) health('Armazenamento local', true, legacyCount + ' chave(s) historica(s) preservada(s) para auditoria');
      return legacyCount;
    } catch (error) { return 0; }
  }
  function timestampMs(value) {
    if (value === null || value === undefined || typeof value === 'boolean') return NaN;
    if (typeof value === 'string' && value.trim() === '') return NaN;
    if (Number.isFinite(+value)) {
      var numeric = +value;
      if (numeric >= 1e9 && numeric < 1e12) return numeric * 1000;
      return numeric;
    }
    var parsed = typeof value === 'string' ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  function markDataset(value, retrievedAt, staleAfterMs, status, observedAt) {
    if (!value) return null;
    var retrievalTime = timestampMs(retrievedAt);
    if (!Number.isFinite(retrievalTime)) retrievalTime = Date.now();
    var observationTime = timestampMs(observedAt);
    if (!Number.isFinite(observationTime)) observationTime = timestampMs(value.observedAt);
    var freshness = AnalyticsCore.classifyFreshness(observationTime, staleAfterMs, Date.now());
    var dataStatus = status && status !== 'fresh' ? status : freshness.status;
    return Object.assign({}, value, {
      dataStatus: dataStatus,
      fetchedAt: value.fetchedAt || retrievalTime,
      observedAt: Number.isFinite(observationTime) ? observationTime : null,
      retrievedAt: retrievalTime,
      cacheStoredAt: retrievalTime,
      ageMs: freshness.ageMs,
      staleAfterMs: staleAfterMs,
      eligibleForScore: dataStatus === 'fresh'
    });
  }
  function currentDatasetState(value) {
    return AnalyticsCore.resolveDatasetFreshness(value, Date.now());
  }
  function eligibleDataset(value) {
    return currentDatasetState(value).eligibleForScore;
  }
  function datasetStatus(value) {
    return currentDatasetState(value).status;
  }
  function parseKlines(rows) {
    return AnalyticsCore.normalizeKlines(rows);
  }
  function selectClosedCandles(candles, asOf) {
    return AnalyticsCore.selectClosedCandles(candles, asOf || Date.now());
  }
  function emaSeries(values, period) {
    if (values.length < period) return [];
    var k = 2 / (period + 1), out = [], seed = avg(values.slice(0, period));
    for (var i = 0; i < values.length; i++) {
      if (i < period - 1) out.push(null);
      else if (i === period - 1) out.push(seed);
      else out.push(values[i] * k + out[i - 1] * (1 - k));
    }
    return out;
  }
  function rsiSeries(values, period) {
    return AnalyticsCore.rsiSeries(values, period);
  }
  function rsi(values, period) { return AnalyticsCore.rsi(values, period); }
  function stochRsi(values, period) {
    var series = rsiSeries(values, period).filter(function (v) { return v != null; });
    if (series.length < period) return NaN;
    var recent = series.slice(-period);
    var min = Math.min.apply(null, recent);
    var max = Math.max.apply(null, recent);
    var latest = last(recent);
    return max === min ? 50 : ((latest - min) / (max - min)) * 100;
  }
  function mfi(candles, period) {
    if (candles.length <= period) return NaN;
    var positive = 0, negative = 0;
    for (var i = candles.length - period; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1];
      var typical = (c.high + c.low + c.close) / 3;
      var prevTypical = (p.high + p.low + p.close) / 3;
      var flow = typical * c.volume;
      if (typical > prevTypical) positive += flow;
      else if (typical < prevTypical) negative += flow;
    }
    if (positive === 0 && negative === 0) return 50;
    if (negative === 0) return 100;
    var ratio = positive / negative;
    return 100 - (100 / (1 + ratio));
  }
  function bollinger(values, period, mult) {
    var mid = values.map(function () { return null; });
    var upper = values.map(function () { return null; });
    var lower = values.map(function () { return null; });
    for (var i = period - 1; i < values.length; i++) {
      var slice = values.slice(i - period + 1, i + 1);
      var mean = avg(slice);
      var variance = avg(slice.map(function (v) { return Math.pow(v - mean, 2); }));
      var deviation = Math.sqrt(variance);
      mid[i] = mean;
      upper[i] = mean + deviation * mult;
      lower[i] = mean - deviation * mult;
    }
    return { mid: mid, upper: upper, lower: lower, latestMid: lastFinite(mid), latestUpper: lastFinite(upper), latestLower: lastFinite(lower) };
  }
  function atr(candles, period) {
    return lastFinite(atrSeries(candles, period));
  }
  function trueRangeSeries(candles) {
    var out = candles.map(function () { return null; });
    for (var i = 1; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1];
      out[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
    }
    return out;
  }
  function atrSeries(candles, period) {
    var out = candles.map(function () { return null; });
    if (candles.length <= period) return out;
    var trs = trueRangeSeries(candles).slice(1);
    var value = avg(trs.slice(0, period));
    out[period] = value;
    for (var j = period + 1; j < candles.length; j++) {
      value = ((value * (period - 1)) + trs[j - 1]) / period;
      out[j] = value;
    }
    return out;
  }
  function adx(candles, period) {
    return AnalyticsCore.adx(candles, period);
  }
  function supertrend(candles, period, mult) {
    var atrs = atrSeries(candles, period);
    var finalUpper = null, finalLower = null, trend = 'Neutro', value = NaN;
    for (var i = period; i < candles.length; i++) {
      var c = candles[i], p = candles[i - 1] || c;
      var hl2 = (c.high + c.low) / 2;
      var basicUpper = hl2 + (atrs[i] || 0) * mult;
      var basicLower = hl2 - (atrs[i] || 0) * mult;
      finalUpper = finalUpper == null || basicUpper < finalUpper || p.close > finalUpper ? basicUpper : finalUpper;
      finalLower = finalLower == null || basicLower > finalLower || p.close < finalLower ? basicLower : finalLower;
      if (trend === 'Baixa' && c.close > finalUpper) trend = 'Alta';
      else if (trend === 'Alta' && c.close < finalLower) trend = 'Baixa';
      else if (trend === 'Neutro') trend = c.close >= hl2 ? 'Alta' : 'Baixa';
      value = trend === 'Alta' ? finalLower : finalUpper;
    }
    return { trend: trend, value: value };
  }
  function keltner(candles, period, mult) {
    var closes = candles.map(function (c) { return c.close; });
    var mid = last(emaSeries(closes, period));
    var range = atr(candles, period);
    return { mid: mid, upper: mid + range * mult, lower: mid - range * mult };
  }
  function donchian(candles, period) {
    var rows = candles.slice(-period);
    return {
      upper: Math.max.apply(null, rows.map(function (c) { return c.high; })),
      lower: Math.min.apply(null, rows.map(function (c) { return c.low; }))
    };
  }
  function roc(values, period) {
    if (values.length <= period) return NaN;
    var now = last(values), prev = values[values.length - 1 - period];
    return prev ? ((now - prev) / prev) * 100 : NaN;
  }
  function obv(candles) {
    var total = 0;
    for (var i = 1; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) total += candles[i].volume;
      else if (candles[i].close < candles[i - 1].close) total -= candles[i].volume;
    }
    return total;
  }
  function cmf(candles, period) {
    var rows = candles.slice(-period), mfv = 0, vol = 0;
    rows.forEach(function (c) {
      if (!Number.isFinite(c.volume)) return;
      var range = c.high - c.low;
      var multiplier = range ? (((c.close - c.low) - (c.high - c.close)) / range) : 0;
      mfv += multiplier * c.volume;
      vol += c.volume;
    });
    return vol ? mfv / vol : NaN;
  }
  function smaValue(values, period) {
    return values.length >= period ? avg(values.slice(-period)) : NaN;
  }
  function standardDeviation(values) {
    if (!values.length) return NaN;
    var mean = avg(values);
    return Math.sqrt(avg(values.map(function (value) { return Math.pow(value - mean, 2); })));
  }
  function intervalPeriodsPerYear(interval) {
    var minutes = { '1s': 1 / 60, '1m': 1, '3m': 3, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '6h': 360, '8h': 480, '12h': 720, '1d': 1440, '3d': 4320, '1w': 10080, '1M': 43800 }[interval] || 1440;
    return (365 * 1440) / minutes;
  }
  function realizedVolatility(values, period, interval) {
    return AnalyticsCore.realizedVolatility(values, period, intervalPeriodsPerYear(interval));
  }
  function zScore(values, period) {
    var rows = values.slice(-period);
    var deviation = standardDeviation(rows);
    return rows.length === period && deviation ? (last(rows) - avg(rows)) / deviation : NaN;
  }
  function williamsR(candles, period) {
    var rows = candles.slice(-period);
    if (rows.length < period) return NaN;
    var high = Math.max.apply(null, rows.map(function (c) { return c.high; }));
    var low = Math.min.apply(null, rows.map(function (c) { return c.low; }));
    return high === low ? -50 : ((high - last(rows).close) / (high - low)) * -100;
  }
  function cci(candles, period) {
    var rows = candles.slice(-period);
    if (rows.length < period) return NaN;
    var typical = rows.map(function (c) { return (c.high + c.low + c.close) / 3; });
    var mean = avg(typical);
    var meanDeviation = avg(typical.map(function (value) { return Math.abs(value - mean); }));
    return meanDeviation ? (last(typical) - mean) / (0.015 * meanDeviation) : 0;
  }
  function ichimoku(candles) { return AnalyticsCore.ichimokuState(candles); }
  function findFairValueGap(candles) {
    return AnalyticsCore.findOpenFairValueGap(candles, 60);
  }
  function marketRegime(close, ema50, ema200, adxNow, realizedVol) {
    var trend = close > ema200 && ema50 > ema200 ? 'Alta estrutural' : close < ema200 && ema50 < ema200 ? 'Baixa estrutural' : 'Transicao';
    var strength = Number.isFinite(adxNow.adx) && adxNow.adx >= 25 ? 'tendencial' : 'lateral';
    var volatility = Number.isFinite(realizedVol) && realizedVol > 100 ? 'vol alta' : 'vol normal';
    return trend + ' / ' + strength + ' / ' + volatility;
  }
  function macd(values) {
    var fast = emaSeries(values, 12), slow = emaSeries(values, 26);
    var line = values.map(function (_, i) { return fast[i] == null || slow[i] == null ? null : fast[i] - slow[i]; });
    var valid = line.filter(function (v) { return v != null; });
    var signalRaw = emaSeries(valid, 9);
    var signal = signalRaw.length ? last(signalRaw) : null;
    var macdLine = last(valid);
    return { line: macdLine, signal: signal, hist: macdLine != null && signal != null ? macdLine - signal : NaN };
  }
  function macdSeries(values) {
    var fast = emaSeries(values, 12), slow = emaSeries(values, 26);
    var line = values.map(function (_, i) { return fast[i] == null || slow[i] == null ? null : fast[i] - slow[i]; });
    var compact = [], indexMap = [];
    line.forEach(function (v, i) {
      if (v != null) {
        compact.push(v);
        indexMap.push(i);
      }
    });
    var compactSignal = emaSeries(compact, 9);
    var signal = values.map(function () { return null; });
    var hist = values.map(function () { return null; });
    compactSignal.forEach(function (v, i) {
      var index = indexMap[i];
      signal[index] = v;
      hist[index] = v == null ? null : compact[i] - v;
    });
    return { line: line, signal: signal, hist: hist, latestLine: lastFinite(line), latestSignal: lastFinite(signal), latestHist: lastFinite(hist) };
  }
  function vwap(candles, lookback) {
    var rows = candles.slice(-(lookback || 48));
    var pv = 0, vol = 0;
    rows.forEach(function (c) { var tp = (c.high + c.low + c.close) / 3; pv += tp * c.volume; vol += c.volume; });
    return vol ? pv / vol : NaN;
  }
  function rollingVwapSeries(candles, lookback) {
    var period = lookback || 48;
    return candles.map(function (_, index) {
      var start = Math.max(0, index - period + 1), pv = 0, volume = 0;
      for (var i = start; i <= index; i++) {
        var candle = candles[i], typical = (candle.high + candle.low + candle.close) / 3;
        pv += typical * candle.volume;
        volume += candle.volume;
      }
      return volume ? pv / volume : null;
    });
  }
  function pivots(candles) {
    var highs = [], lows = [];
    for (var i = 2; i < candles.length - 2; i++) {
      var c = candles[i];
      if (c.high > candles[i - 1].high && c.high > candles[i - 2].high && c.high > candles[i + 1].high && c.high > candles[i + 2].high) highs.push({ price: c.high, time: c.time });
      if (c.low < candles[i - 1].low && c.low < candles[i - 2].low && c.low < candles[i + 1].low && c.low < candles[i + 2].low) lows.push({ price: c.low, time: c.time });
    }
    return { highs: highs, lows: lows };
  }
  function detectPatterns(candles) {
    if (!candles || candles.length < 30) return [];
    var out = [], closes = candles.map(function (c) { return c.close; });
    var pv = pivots(candles), highs = pv.highs.slice(-5), lows = pv.lows.slice(-5);
    var latest = last(candles), prior = candles.slice(-22, -2);
    var priorHigh = Math.max.apply(null, prior.map(function (c) { return c.high; }));
    var priorLow = Math.min.apply(null, prior.map(function (c) { return c.low; }));
    function add(name, direction, confidence, detail, time, price) {
      if (!out.some(function (item) { return item.name === name; })) out.push({ name: name, direction: direction, confidence: confidence, detail: detail, time: time || latest.time, price: price || latest.close });
    }
    var ema50Rows = emaSeries(closes, 50), ema200Rows = emaSeries(closes, 200);
    for (var i = closes.length - 1; i >= Math.max(201, closes.length - 25); i--) {
      var prevDiff = ema50Rows[i - 1] - ema200Rows[i - 1], diff = ema50Rows[i] - ema200Rows[i];
      if (Number.isFinite(prevDiff) && prevDiff <= 0 && diff > 0) { add('Golden cross', 'bull', 82, 'EMA 50 cruzou acima da EMA 200.', candles[i].time, candles[i].close); break; }
      if (Number.isFinite(prevDiff) && prevDiff >= 0 && diff < 0) { add('Death cross', 'bear', 82, 'EMA 50 cruzou abaixo da EMA 200.', candles[i].time, candles[i].close); break; }
    }
    if (latest.high > priorHigh && latest.close < priorHigh) add('Bull trap', 'bear', 76, 'Rompimento de maxima retornou para dentro da faixa.', latest.time, latest.high);
    if (latest.low < priorLow && latest.close > priorLow) add('Bear trap', 'bull', 76, 'Perda de minima foi recuperada no fechamento.', latest.time, latest.low);
    if (highs.length >= 2) {
      var h1 = highs[highs.length - 2], h2 = highs[highs.length - 1];
      if (Math.abs(h2.price - h1.price) / latest.close < 0.012) add('Topo duplo', 'bear', 66, 'Duas maximas proximas; exige perda do suporte entre elas.', h2.time, h2.price);
    }
    if (lows.length >= 2) {
      var l1 = lows[lows.length - 2], l2 = lows[lows.length - 1];
      if (Math.abs(l2.price - l1.price) / latest.close < 0.012) add('Fundo duplo', 'bull', 66, 'Duas minimas proximas; exige rompimento da maxima intermediaria.', l2.time, l2.price);
    }
    if (highs.length >= 3) {
      var hs = highs.slice(-3);
      if (hs[1].price > hs[0].price && hs[1].price > hs[2].price && Math.abs(hs[0].price - hs[2].price) / latest.close < 0.025) add('OCO potencial', 'bear', 62, 'Ombros semelhantes com cabeca mais alta; confirmar pela neckline.', hs[2].time, hs[2].price);
    }
    if (lows.length >= 3) {
      var ils = lows.slice(-3);
      if (ils[1].price < ils[0].price && ils[1].price < ils[2].price && Math.abs(ils[0].price - ils[2].price) / latest.close < 0.025) add('OCO invertido potencial', 'bull', 62, 'Fundos laterais semelhantes com cabeca mais baixa; confirmar pela neckline.', ils[2].time, ils[2].price);
    }
    if (highs.length >= 3 && lows.length >= 3) {
      var hh = highs.slice(-3), ll = lows.slice(-3);
      if (hh[2].price < hh[0].price && ll[2].price > ll[0].price) add('Cunha convergente', 'neutral', 58, 'Maximas descendentes e minimas ascendentes; aguardar rompimento.', latest.time, latest.close);
      else if (hh[2].price < hh[0].price && ll[2].price < ll[0].price && Math.abs((hh[2].price - hh[0].price) / hh[0].price) > Math.abs((ll[2].price - ll[0].price) / ll[0].price)) add('Cunha descendente potencial', 'bull', 55, 'Compressao descendente; validar apenas com rompimento e volume.', latest.time, latest.close);
    }
    var range = latest.high - latest.low, body = Math.abs(latest.close - latest.open);
    if (range > 0 && body / range < 0.12) add('Doji', 'neutral', 54, 'Indecisao no ultimo candle; contexto e candle seguinte importam.', latest.time, latest.close);
    if (range > 0 && (Math.min(latest.open, latest.close) - latest.low) / range > 0.6 && body / range < 0.32) add('Martelo potencial', 'bull', 57, 'Rejeicao de minima; confirmar acima da maxima do candle.', latest.time, latest.low);
    if (range > 0 && (latest.high - Math.max(latest.open, latest.close)) / range > 0.6 && body / range < 0.32) add('Estrela cadente potencial', 'bear', 57, 'Rejeicao de maxima; confirmar abaixo da minima do candle.', latest.time, latest.high);
    return out.slice(0, 7);
  }
  function dedupeLevels(levels, price) {
    var threshold = price * 0.0018, out = [];
    levels.forEach(function (level) { if (!out.some(function (x) { return Math.abs(x - level) < threshold; })) out.push(level); });
    return out;
  }
  function buildCoreAnalysis(candles, ticker, premium, options) {
    options = options || {};
    var closes = candles.map(function (c) { return c.close; });
    var close = last(closes);
    var ema9 = last(emaSeries(closes, 9));
    var ema21 = last(emaSeries(closes, 21));
    var ema20 = last(emaSeries(closes, 20));
    var ema50 = last(emaSeries(closes, 50));
    var ema200 = last(emaSeries(closes, 200));
    var rsiValues = rsiSeries(closes, 14);
    var rsi14 = rsi(closes, 14);
    var stochRsi14 = stochRsi(closes, 14);
    var mfi14 = mfi(candles, 14);
    var atr14 = atr(candles, 14);
    var macdNow = macd(closes);
    var macdData = macdSeries(closes);
    var bb = bollinger(closes, 20, 2);
    var bbPctB = Number.isFinite(bb.latestUpper) && bb.latestUpper !== bb.latestLower ? ((close - bb.latestLower) / (bb.latestUpper - bb.latestLower)) * 100 : NaN;
    var bbWidth = Number.isFinite(bb.latestMid) && bb.latestMid ? ((bb.latestUpper - bb.latestLower) / bb.latestMid) * 100 : NaN;
    var vwapNow = vwap(candles, 48);
    var adxNow = adx(candles, 14);
    var supertrendNow = supertrend(candles, 10, 3);
    var keltnerNow = keltner(candles, 20, 2);
    var donchianNow = donchian(candles, 20);
    var roc12 = roc(closes, 12);
    var obvNow = obv(candles);
    var cmf20 = cmf(candles, 20);
    var realizedVol30 = realizedVolatility(closes, 30, options.interval || state.interval);
    var zScore20 = zScore(closes, 20);
    var williams14 = williamsR(candles, 14);
    var cci20 = cci(candles, 20);
    var ichimokuNow = ichimoku(candles);
    var fvg = findFairValueGap(candles);
    var patterns = detectPatterns(candles);
    var pv = pivots(candles);
    var lows = pv.lows.map(function (x) { return x.price; }).concat(candles.slice(-90).map(function (c) { return c.low; }).sort(function (a, b) { return a - b; }).slice(0, 2));
    var highs = pv.highs.map(function (x) { return x.price; }).concat(candles.slice(-90).map(function (c) { return c.high; }).sort(function (a, b) { return b - a; }).slice(0, 2));
    var supports = dedupeLevels(lows.filter(function (x) { return x < close; }).sort(function (a, b) { return b - a; }), close).slice(0, 3);
    var resistances = dedupeLevels(highs.filter(function (x) { return x > close; }).sort(function (a, b) { return a - b; }), close).slice(0, 3);
    var recent = candles.slice(-6), prior = candles.slice(-42, -6);
    var priorLow = Math.min.apply(null, prior.map(function (c) { return c.low; }));
    var priorHigh = Math.max.apply(null, prior.map(function (c) { return c.high; }));
    var recentLow = Math.min.apply(null, recent.map(function (c) { return c.low; }));
    var recentHigh = Math.max.apply(null, recent.map(function (c) { return c.high; }));
    var sweepDown = recentLow < priorLow && close > priorLow;
    var sweepUp = recentHigh > priorHigh && close < priorHigh;
    var lastHighs = pv.highs.slice(-2), lastLows = pv.lows.slice(-2);
    var structure = 'Range';
    if (lastHighs.length > 1 && lastLows.length > 1) {
      if (lastHighs[1].price > lastHighs[0].price && lastLows[1].price > lastLows[0].price) structure = 'HH/HL';
      else if (lastHighs[1].price < lastHighs[0].price && lastLows[1].price < lastLows[0].price) structure = 'LH/LL';
    }
    var candleFlow = AnalyticsCore.calculateCandleFlow(candles, cmf20);
    var deltaSum = candleFlow.deltaSum;
    var avgVol = candleFlow.averageVolume;
    var lastVol = candleFlow.lastVolume;
    // Ciclo B: deteccao rapida de virada — estrutura (CHoCH/BOS), divergencia RSI/OBV nos dois
    // ultimos pivots, exaustao por climax de volume e squeeze BB/Keltner com liberacao.
    var obvValues = AnalyticsCore.obvSeries(candles);
    var structureShift = AnalyticsCore.detectStructureShift(candles, pv.highs, pv.lows);
    var rsiDivergence = AnalyticsCore.detectDivergence(candles, rsiValues, pv.highs, pv.lows);
    var obvDivergence = AnalyticsCore.detectDivergence(candles, obvValues, pv.highs, pv.lows);
    var divergence = {
      bearish: rsiDivergence.bearish || obvDivergence.bearish,
      bullish: rsiDivergence.bullish || obvDivergence.bullish,
      double: (rsiDivergence.bearish && obvDivergence.bearish) || (rsiDivergence.bullish && obvDivergence.bullish)
    };
    var divergenceScore = (divergence.bullish ? 5 : 0) + (divergence.bearish ? -5 : 0);
    var volumeClimax = AnalyticsCore.detectVolumeClimax(candles, atr14);
    var squeeze = AnalyticsCore.detectSqueeze(candles, { deltaSum: deltaSum });
    var funding = finiteNumber(premium && premium.lastFundingRate);
    var markPrice = finiteNumber(premium && premium.markPrice), indexPrice = finiteNumber(premium && premium.indexPrice);
    var basis = Number.isFinite(markPrice) && Number.isFinite(indexPrice) ? markPrice - indexPrice : NaN;
    var currentBar = last(candles);
    var body = Math.abs(currentBar.close - currentBar.open);
    var displacement = Number.isFinite(atr14) && Number.isFinite(currentBar.volume) && Number.isFinite(avgVol) && body > atr14 * 1.15 && currentBar.volume > avgVol * 1.25 ? (currentBar.close > currentBar.open ? 'Alta' : 'Baixa') : 'Nao';
    var regime = marketRegime(close, ema50, ema200, adxNow, realizedVol30);
    var trendScore = (Number.isFinite(ema9) ? (close > ema9 ? 6 : -6) : 0) + (Number.isFinite(ema21) ? (close > ema21 ? 8 : -8) : 0) + (Number.isFinite(ema50) ? (close > ema50 ? 10 : -10) : 0) + (Number.isFinite(ema21) && Number.isFinite(ema50) ? (ema21 > ema50 ? 8 : -8) : 0) + (adxNow.adx > 25 && adxNow.plus > adxNow.minus ? 4 : adxNow.adx > 25 && adxNow.minus > adxNow.plus ? -4 : 0);
    var momScore = (Number.isFinite(rsi14) ? (rsi14 > 52 && rsi14 < 70 ? 12 : rsi14 >= 78 ? -8 : rsi14 >= 70 ? 3 : rsi14 < 35 ? -10 : 0) : 0) + (Number.isFinite(macdNow.hist) ? (macdNow.hist > 0 ? 8 : -8) : 0) + (Number.isFinite(stochRsi14) ? (stochRsi14 > 80 ? -3 : stochRsi14 < 20 ? 3 : 0) : 0);
    var flowScore = candleFlow.score;
    var fundingScore = AnalyticsCore.calculateFundingContribution(funding);
    var derivScore = fundingScore;
    if (Number.isFinite(basis)) derivScore += basis > 0 ? 3 : -3;
    var chainScore = options.chainScore || 0;
    var bookScore = options.bookScore || 0;
    var score = clamp(Math.round(trendScore + momScore + flowScore + derivScore + chainScore + bookScore + structureShift.score + divergenceScore + squeeze.score), -100, 100);
    var bias = biasFromScore(score);
    return { modelVersion: MODEL_VERSION, interval: options.interval || state.interval, close: close, ema9: ema9, ema21: ema21, ema20: ema20, ema50: ema50, ema200: ema200, rsi14: rsi14, rsiValues: rsiValues, stochRsi14: stochRsi14, mfi14: mfi14, atr14: atr14, macd: macdNow, macdData: macdData, bb: bb, bbPctB: bbPctB, bbWidth: bbWidth, vwap: vwapNow, adx: adxNow, supertrend: supertrendNow, keltner: keltnerNow, donchian: donchianNow, roc12: roc12, obv: obvNow, cmf20: cmf20, realizedVol30: realizedVol30, zScore20: zScore20, williams14: williams14, cci20: cci20, ichimoku: ichimokuNow, fvg: fvg, patterns: patterns, displacement: displacement, regime: regime, supports: supports, resistances: resistances, structure: structure, sweepDown: sweepDown, sweepUp: sweepUp, priorLow: priorLow, priorHigh: priorHigh, deltaSum: deltaSum, avgVol: avgVol, lastVol: lastVol, funding: funding, basis: basis, score: score, bias: bias, trendScore: trendScore, momScore: momScore, flowScore: flowScore, fundingScore: fundingScore, structureShift: structureShift, divergence: divergence, divergenceScore: divergenceScore, volumeClimax: volumeClimax, squeeze: squeeze, flowAvailable: candleFlow.available, flowCoverage: candleFlow.coverage, candleCount: candles.length, derivScore: derivScore, chainScore: chainScore, bookScore: bookScore, ticker: ticker };
  }
  function normalizeDepth(depth) {
    function levels(rows) {
      return (Array.isArray(rows) ? rows : []).map(function (row) {
        var price = finiteNumber(row && row[0]);
        var quantity = finiteNumber(row && row[1]);
        return Number.isFinite(price) && price > 0 && Number.isFinite(quantity) && quantity > 0 ? [price, quantity] : null;
      }).filter(Boolean);
    }
    var bids = levels(depth && depth.bids).sort(function (a, b) { return b[0] - a[0]; });
    var asks = levels(depth && depth.asks).sort(function (a, b) { return a[0] - b[0]; });
    if (!bids.length || !asks.length || bids[0][0] >= asks[0][0]) return { bids: [], asks: [] };
    return { bids: bids, asks: asks };
  }
  function depthWindow(depth, mid, pct) {
    var bidQty = 0, askQty = 0, bidNotional = 0, askNotional = 0;
    if (!depth || !depth.bids || !depth.asks) return { bidQty: 0, askQty: 0, bidNotional: 0, askNotional: 0, imbalance: NaN };
    depth.bids.forEach(function (b) { var p = b[0], q = b[1]; if (p >= mid * (1 - pct)) { bidQty += q; bidNotional += p * q; } });
    depth.asks.forEach(function (a) { var p = a[0], q = a[1]; if (p <= mid * (1 + pct)) { askQty += q; askNotional += p * q; } });
    return { bidQty: bidQty, askQty: askQty, bidNotional: bidNotional, askNotional: askNotional, imbalance: (bidQty + askQty) ? (bidQty - askQty) / (bidQty + askQty) : NaN };
  }
  function estimateSlippage(levels, notional, side) {
    var remaining = notional, qty = 0, spent = 0, first = levels && levels.length ? levels[0][0] : NaN;
    if (!levels || !levels.length || !Number.isFinite(first)) return NaN;
    for (var i = 0; i < levels.length && remaining > 0; i++) {
      var price = levels[i][0], size = levels[i][1], levelNotional = price * size;
      var take = Math.min(remaining, levelNotional);
      spent += take;
      qty += take / price;
      remaining -= take;
    }
    if (remaining > 0 || !qty) return NaN;
    var avgPrice = spent / qty;
    return side === 'buy' ? ((avgPrice - first) / first) * 10000 : ((first - avgPrice) / first) * 10000;
  }
  function mergeSelected(symbol, interval, candles, ticker, depth, premium, oi, chain, chainAdjustment) {
    var mempoolContext = AnalyticsCore.bitcoinMempoolContext(symbol, chain && chain.fees && chain.fees.fastestFee);
    var chainScore = clamp(mempoolContext.score + (Number.isFinite(chainAdjustment) ? chainAdjustment : 0), -10, 10);
    var safeDepth = normalizeDepth(depth);
    var bidQty = 0, askQty = 0, bidNotional = 0, askNotional = 0, spread = NaN, close = last(candles).close, mid = close;
    if (safeDepth.bids.length && safeDepth.asks.length) {
      var bestBid = safeDepth.bids[0][0], bestAsk = safeDepth.asks[0][0];
      spread = bestAsk - bestBid; mid = (bestBid + bestAsk) / 2;
      safeDepth.bids.forEach(function (b) { var p = b[0], q = b[1]; if (p >= mid * 0.999) { bidQty += q; bidNotional += p * q; } });
      safeDepth.asks.forEach(function (a) { var p = a[0], q = a[1]; if (p <= mid * 1.001) { askQty += q; askNotional += p * q; } });
    }
    var bookImb = (bidQty + askQty) ? (bidQty - askQty) / (bidQty + askQty) : NaN;
    var bookScore = bookImb > 0.12 ? 10 : bookImb < -0.12 ? -10 : 0;
    var a = buildCoreAnalysis(candles, ticker, premium, { chainScore: chainScore, bookScore: bookScore, interval: interval });
    var w01 = depthWindow(safeDepth, mid, 0.001);
    var w05 = depthWindow(safeDepth, mid, 0.005);
    var notional = Math.max(1000, Math.min(50000, a.close * 0.75));
    a.bidQty = bidQty; a.askQty = askQty; a.bidNotional = bidNotional; a.askNotional = askNotional; a.spread = spread; a.spreadBps = mid ? (spread / mid) * 10000 : NaN; a.microprice = (bidQty + askQty) && safeDepth.bids.length && safeDepth.asks.length ? ((safeDepth.asks[0][0] * bidQty) + (safeDepth.bids[0][0] * askQty)) / (bidQty + askQty) : NaN; a.book01 = w01; a.book05 = w05; a.buySlipBps = estimateSlippage(safeDepth.asks, notional, 'buy'); a.sellSlipBps = estimateSlippage(safeDepth.bids, notional, 'sell'); a.slippageNotional = notional; a.bookImb = bookImb; a.oi = oi; a.chain = chain; a.mempoolContext = mempoolContext;
    a.marketInputs = { ticker: ticker || null, depth: safeDepth, premium: premium || null, openInterest: oi || null };
    return applyExternalToAnalysis(symbol, a);
  }
  async function loadChain() {
    var out = {};
    var rows = await Promise.allSettled([
      fetchJSON('https://mempool.space/api/v1/fees/recommended', 7000, 'mempool.space'),
      fetchJSON('https://mempool.space/api/mempool', 7000, 'mempool.space'),
      fetchJSON('https://mempool.space/api/blocks/tip/height', 7000, 'mempool.space')
    ]);
    if (rows[0].status === 'fulfilled') out.fees = rows[0].value;
    if (rows[1].status === 'fulfilled') out.mempool = rows[1].value;
    if (rows[2].status === 'fulfilled') out.height = rows[2].value;
    return out;
  }
  function coinMetricsAsset(symbol) {
    var mapping = { BNBUSDT: 'bnb', BCHUSDT: 'bch', DOGEUSDT: 'doge', LINKUSDT: 'link', AVAXUSDT: 'avax', NEARUSDT: 'near', AAVEUSDT: 'aave' };
    return mapping[symbol] || baseAsset(symbol).toLowerCase();
  }
  function metricNumber(row, key) {
    return finiteNumber(row && row[key]);
  }
  function metricChange(rows, key, lag) {
    if (!rows || rows.length <= lag) return NaN;
    var now = metricNumber(last(rows), key), prior = metricNumber(rows[rows.length - 1 - lag], key);
    return Number.isFinite(now) && Number.isFinite(prior) && prior !== 0 ? ((now - prior) / Math.abs(prior)) * 100 : NaN;
  }
  function normalizeCoinMetrics(rows) {
    var byTime = new Map();
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var time = timestampMs(row && row.time);
      if (!row || !Number.isFinite(time) || time < 0 || time > Date.now() + AnalyticsCore.RULESET.clockSkewToleranceMs) return;
      byTime.set(time, row);
    });
    rows = Array.from(byTime.entries()).sort(function (a, b) { return a[0] - b[0]; }).map(function (entry) { return entry[1]; });
    var latest = last(rows) || {};
    var adr7 = metricChange(rows, 'AdrActCnt', 7), tx7 = metricChange(rows, 'TxCnt', 7), fees7 = metricChange(rows, 'FeeTotUSD', 7);
    var score = 0;
    if (Number.isFinite(adr7)) score += adr7 > 8 ? 4 : adr7 < -8 ? -4 : 0;
    if (Number.isFinite(tx7)) score += tx7 > 8 ? 3 : tx7 < -8 ? -3 : 0;
    if (Number.isFinite(fees7)) score += fees7 > 15 ? 2 : fees7 < -15 ? -2 : 0;
    var mvrv = metricNumber(latest, 'CapMVRVCur');
    if (Number.isFinite(mvrv)) score += mvrv > 4 ? -3 : mvrv < 1.1 ? 2 : 0;
    var flowRows = rows.slice(-7);
    var inflow1d = metricNumber(latest, 'FlowInExUSD'), outflow1d = metricNumber(latest, 'FlowOutExUSD');
    var netflow1d = Number.isFinite(inflow1d) && Number.isFinite(outflow1d) ? inflow1d - outflow1d : NaN;
    var flowCoverageDays = 0;
    var netflow7d = flowRows.reduce(function (sum, row) {
      var inflow = metricNumber(row, 'FlowInExUSD'), outflow = metricNumber(row, 'FlowOutExUSD');
      if (Number.isFinite(inflow) && Number.isFinite(outflow)) {
        flowCoverageDays += 1;
        return sum + (inflow - outflow);
      }
      return sum;
    }, 0);
    var flowEligible = flowCoverageDays >= AnalyticsCore.RULESET.netflowMinCoverageDays;
    var exchangeFlow = {
      time: latest.time || '',
      status: latest['FlowInExUSD-status'] || latest['FlowOutExUSD-status'] || '',
      inflow1d: inflow1d,
      outflow1d: outflow1d,
      netflow1d: netflow1d,
      netflow7d: flowEligible ? netflow7d : NaN,
      flowCoverageDays: flowCoverageDays,
      flowWindowDays: flowRows.length,
      supplyNative: metricNumber(latest, 'SplyExNtv')
    };
    return { rows: rows, latest: latest, adr7: adr7, tx7: tx7, fees7: fees7, exchangeFlow: exchangeFlow, score: clamp(score, -10, 10) };
  }
  async function loadCoinMetrics(symbol, force) {
    var asset = coinMetricsAsset(symbol), cached = state.coinMetricsCache[asset];
    if (!force && cached && Date.now() - cached.fetchedAt < ONCHAIN_REFRESH_MS) return markDataset(cached.value, cached.fetchedAt, ONCHAIN_STALE_MS);
    var metrics = 'AdrActCnt,TxCnt,TxTfrValAdjUSD,FeeTotUSD,CapMVRVCur,NVTAdj,FlowInExNtv,FlowOutExNtv,FlowInExUSD,FlowOutExUSD,SplyExNtv';
    var url = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=' + encodeURIComponent(asset) + '&metrics=' + encodeURIComponent(metrics) + '&frequency=1d&limit_per_asset=31&page_size=100&ignore_forbidden_errors=true&ignore_unsupported_errors=true';
    try {
      var payload = await fetchJSON(url, 12000, 'Coin Metrics');
      var normalized = normalizeCoinMetrics(payload && payload.data);
      if (!normalized.rows.length) throw new Error('sem cobertura para ' + asset.toUpperCase());
      normalized.asset = asset;
      normalized.observedAt = timestampMs(normalized.latest && normalized.latest.time);
      normalized.fetchedAt = Date.now();
      state.coinMetricsCache[asset] = { value: normalized, fetchedAt: normalized.fetchedAt };
      return markDataset(normalized, normalized.fetchedAt, ONCHAIN_STALE_MS, 'fresh', normalized.observedAt);
    } catch (error) {
      return cached ? markDataset(cached.value, cached.fetchedAt, ONCHAIN_STALE_MS) : null;
    }
  }
  function optionsForSymbol(payload, scope, cachedAt, status) {
    if (!payload) return null;
    var marked = markDataset(payload, cachedAt || payload.fetchedAt, OPTIONS_STALE_MS, status, payload.observedAt);
    return Object.assign({}, marked, {
      requestedAsset: scope.asset,
      isProxy: scope.isProxy,
      scope: scope.scope,
      eligibilityBlocked: !scope.eligibleForScore,
      eligibleForScore: scope.eligibleForScore && marked.eligibleForScore
    });
  }
  async function loadOptions(symbol, force) {
    var scope = AnalyticsCore.resolveOptionsScope(symbol), currency = scope.currency, cached = state.optionsCache[currency];
    if (!force && cached && Date.now() - cached.fetchedAt < OPTIONS_REFRESH_MS) return optionsForSymbol(cached.value, scope, cached.fetchedAt);
    try {
      var payload = await fetchJSON('/api/options?currency=' + encodeURIComponent(currency), 24000, 'Deribit options');
      if (!payload || !payload.market) throw new Error('sem dados de opcoes');
      var clientNow = Date.now();
      var serverObservedAt = timestampMs(payload.observedAt);
      payload.fetchedAt = clientNow;
      payload.observedAt = AnalyticsCore.resolveObservedAt(serverObservedAt, clientNow).observedAt;
      var cachedAt = clientNow;
      state.optionsCache[currency] = { value: payload, fetchedAt: cachedAt };
      return optionsForSymbol(payload, scope, cachedAt, 'fresh');
    } catch (error) {
      return cached ? optionsForSymbol(cached.value, scope, cached.fetchedAt) : null;
    }
  }
  async function loadInstitutional(symbol, force) {
    var asset = baseAsset(symbol), cached = state.institutionalCache[asset];
    if (!force && cached && Date.now() - cached.fetchedAt < INSTITUTIONAL_REFRESH_MS) return markDataset(cached.value, cached.fetchedAt, INSTITUTIONAL_STALE_MS);
    try {
      var payload = await fetchJSON('/api/institutional?asset=' + encodeURIComponent(asset), 24000, 'Dados institucionais');
      var institutionalNow = Date.now();
      var flows = payload.etf && payload.etf.flows;
      var flowRows = nestedRows(flows);
      // Freshness follows the last report eligible for scoring. The API annotates provider flags
      // and US equity-market closures; a zero on an actual trading day remains a neutral report.
      // updatedAt is only a service heartbeat and never replaces the observation date.
      var reportedRows = flowRows.filter(etfReportedRow);
      var lastReportedRow = AnalyticsCore.latestTimestampedRow(reportedRows, ['date', 'day', 'timestamp', 'time'], institutionalNow);
      var flowTimestamp = timestampMs(lastReportedRow && (lastReportedRow.date || lastReportedRow.day || lastReportedRow.time));
      payload.fetchedAt = institutionalNow;
      payload.observedAt = AnalyticsCore.resolveObservedAt(flowTimestamp, institutionalNow).observedAt;
      state.institutionalCache[asset] = { value: payload, fetchedAt: institutionalNow };
      var status = payload && payload.configured && payload.configured.etf && payload.etf && Number.isFinite(payload.observedAt) ? 'fresh' : 'missing';
      return markDataset(payload, institutionalNow, INSTITUTIONAL_STALE_MS, status, payload.observedAt);
    } catch (error) {
      return cached ? markDataset(cached.value, cached.fetchedAt, INSTITUTIONAL_STALE_MS) : null;
    }
  }
  async function loadMicrostructure(symbol, force) {
    var cached = state.microstructureCache[symbol];
    if (!force && cached && Date.now() - cached.fetchedAt < MICROSTRUCTURE_REFRESH_MS) {
      return markDataset(cached.value, cached.fetchedAt, MICROSTRUCTURE_STALE_MS);
    }
    try {
      var payload = await fetchJSON('/api/market-microstructure?symbol=' + encodeURIComponent(symbol), 14000, 'Microestrutura cross-venue');
      var fetchedAt = finiteNumber(payload.fetchedAt);
      if (!Number.isFinite(fetchedAt)) fetchedAt = Date.now();
      var status = Array.isArray(payload.venues) && payload.venues.length || payload.orderFlow && payload.orderFlow.trades ? 'fresh' : 'missing';
      state.microstructureCache[symbol] = { value: payload, fetchedAt: fetchedAt };
      return markDataset(payload, fetchedAt, MICROSTRUCTURE_STALE_MS, status, payload.observedAt);
    } catch (error) {
      return cached ? markDataset(cached.value, cached.fetchedAt, MICROSTRUCTURE_STALE_MS) : null;
    }
  }
  function closeLiquidationStream() {
    if (state.liquidationReconnectTimer) clearTimeout(state.liquidationReconnectTimer);
    state.liquidationReconnectTimer = null;
    if (state.liquidationSocket) {
      state.liquidationSocket.onclose = null;
      state.liquidationSocket.close();
    }
    state.liquidationSocket = null;
    state.liquidationConnected = false;
  }
  function connectLiquidationStream(symbol) {
    if (!state.live || typeof WebSocket === 'undefined') return;
    if (state.liquidationSocket && state.liquidationSymbol === symbol && (state.liquidationSocket.readyState === 0 || state.liquidationSocket.readyState === 1)) return;
    closeLiquidationStream();
    state.liquidationSymbol = symbol;
    var socket = new WebSocket('wss://fstream.binance.com/ws/' + symbol.toLowerCase() + '@forceOrder');
    state.liquidationSocket = socket;
    socket.onopen = function () {
      state.liquidationConnected = true;
      state.liquidationRetryMs = 3000;
      health('Binance liquidations', true, 'stream conectado');
      renderLiquidations();
      renderSourceHealth(state.external || {});
    };
    socket.onmessage = function (event) {
      try {
        var payload = JSON.parse(event.data), order = payload.o || payload.data && payload.data.o;
        if (!order || order.s !== state.liquidationSymbol) return;
        var price = firstFinite([order.ap, order.p]), quantity = firstFinite([order.z, order.q]), notional = price * quantity;
        var eventTime = firstFinite([order.T, payload.E]);
        if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(notional) || notional <= 0) return;
        if (!Number.isFinite(eventTime)) eventTime = Date.now();
        var now = Date.now(), cutoff = now - 60 * 60 * 1000;
        if (eventTime < cutoff || eventTime > now + AnalyticsCore.RULESET.clockSkewToleranceMs) return;
        var eventId = String(order.i || order.orderId || [order.s, order.S, eventTime, price, quantity].join(':'));
        if (state.liquidations.some(function (row) { return row.id === eventId; })) return;
        state.liquidations.unshift({
          id: eventId,
          symbol: order.s,
          time: eventTime,
          price: price,
          quantity: quantity,
          notional: notional,
          side: order.S === 'SELL' ? 'long' : 'short',
          status: order.X || ''
        });
        state.liquidations = state.liquidations.filter(function (row) { return row.time >= cutoff && row.time <= now + AnalyticsCore.RULESET.clockSkewToleranceMs; }).slice(0, 300);
        renderLiquidations();
      } catch (error) { /* ignora evento malformado */ }
    };
    socket.onerror = function () {
      state.liquidationConnected = false;
      health('Binance liquidations', false, 'erro no stream');
      renderLiquidations();
    };
    socket.onclose = function () {
      state.liquidationConnected = false;
      renderLiquidations();
      if (state.live && state.liquidationSymbol === state.symbol) {
        var retryMs = state.liquidationRetryMs || 3000;
        state.liquidationRetryMs = Math.min(retryMs * 2, 60000);
        state.liquidationReconnectTimer = setTimeout(function () { connectLiquidationStream(state.symbol); }, retryMs);
      }
    };
  }
  async function loadExternalContext(force) {
    var lastExternalCycle = Math.max(state.externalFetchedAt, state.externalAttemptedAt);
    if (!force && lastExternalCycle && Date.now() - lastExternalCycle < EXTERNAL_REFRESH_MS) return state.external;
    state.externalAttemptedAt = Date.now();
    var rows = await Promise.allSettled([
      fetchJSON('https://api.alternative.me/fng/?limit=1', 9000, 'Alternative.me'),
      fetchJSON('/api/market', 22000, 'Market data'),
      fetchJSON('https://api.llama.fi/v2/chains', 11000, 'DefiLlama'),
      // Own throttle key: the same-origin proxy is never rate-limited by Llama, so a 429 on the
      // direct chains call must not put the proxy in cooldown too.
      fetchJSON('/api/defillama', 12000, 'DefiLlama protocolos'),
      fetchJSON('https://stablecoins.llama.fi/stablecoins?includePrices=true', 14000, 'DefiLlama stablecoins'),
      fetchJSON('https://api.llama.fi/overview/dexs', 11000, 'DefiLlama DEX'),
      fetchJSON('https://api.coinpaprika.com/v1/global', 9000, 'CoinPaprika'),
      fetchJSON('https://api.llama.fi/overview/fees', 11000, 'DefiLlama fees/OI'),
      fetchJSON('https://api.llama.fi/overview/open-interest', 11000, 'DefiLlama fees/OI'),
      fetchJSON('/api/macro', 22000, 'Macro oficial'),
      fetchJSON('/api/tradfi', 22000, 'TradFi EOD')
    ]);
    var external = normalizeExternal(rows);
    if (external.dataStatus === 'error' && state.external && state.external.fetchedAt) {
      health('Contexto externo', false, 'todas as fontes falharam; mantendo leitura anterior');
      return state.external;
    }
    state.external = external;
    state.externalFetchedAt = Date.now();
    return external;
  }
  function normalizeExternal(rows) {
    var fulfilledCount = rows.filter(function (row) { return row && row.status === 'fulfilled' && row.value; }).length;
    var assembledAt = Date.now();
    var external = { observedAt: assembledAt, observedAtProvenance: 'client-assembled-live-snapshots', fetchedAt: assembledAt, dataStatus: fulfilledCount ? 'fresh' : 'error', fearGreed: null, marketData: null, global: null, coinMarkets: {}, trending: [], chains: [], protocols: [], stablecoins: null, dex: null, paprikaGlobal: null, fees: null, perpsOi: null, macro: null, tradfi: null, sources: [] };
    var fng = value(rows[0]);
    if (fng && fng.data && fng.data[0]) {
      var fearGreedValue = finiteNumber(fng.data[0].value);
      var fearGreedTimestamp = timestampMs(fng.data[0].timestamp);
      if (Number.isFinite(fearGreedValue) && Number.isFinite(fearGreedTimestamp)) {
        external.fearGreed = { value: fearGreedValue, label: fng.data[0].value_classification || '--', timestamp: fearGreedTimestamp, next: finiteNumber(fng.data[0].time_until_update) };
      }
    }
    var marketBundle = value(rows[1]) || {};
    var marketObserved = AnalyticsCore.resolveObservedAt(marketBundle.observedAt, Date.now());
    external.marketData = Object.keys(marketBundle).length ? markDataset(marketBundle, Date.now(), EXTERNAL_STALE_MS, marketBundle.stale ? 'stale' : 'fresh', marketObserved.observedAt) : null;
    if (marketBundle.global && marketBundle.global.data) external.global = marketBundle.global.data;
    (marketBundle.markets || []).forEach(function (coin) { if (coin && coin.id) external.coinMarkets[coin.id] = coin; });
    var trending = marketBundle.trending;
    if (trending && trending.coins) external.trending = trending.coins.map(function (row) { return row.item || row; }).filter(Boolean).slice(0, 8);
    external.chains = Array.isArray(value(rows[2])) ? value(rows[2]) : [];
    var defiProtocols = value(rows[3]);
    external.protocols = defiProtocols && Array.isArray(defiProtocols.protocols) ? defiProtocols.protocols
      : Array.isArray(defiProtocols) ? defiProtocols : [];
    external.stablecoins = value(rows[4]);
    external.dex = value(rows[5]);
    external.paprikaGlobal = value(rows[6]);
    external.fees = value(rows[7]);
    external.perpsOi = value(rows[8]);
    var macroPayload = value(rows[9]);
    var tradfiPayload = value(rows[10]);
    external.macro = macroPayload ? markDataset(macroPayload, macroPayload.fetchedAt, EOD_STALE_MS, 'fresh', macroPayload.observedAt) : null;
    external.tradfi = tradfiPayload ? markDataset(tradfiPayload, tradfiPayload.fetchedAt, EOD_STALE_MS, 'fresh', tradfiPayload.observedAt) : null;
    external.defiTvl = sumFinite(external.chains.map(function (chain) { return chain && chain.tvl; }));
    external.stablecoinCap = stablecoinCap(external.stablecoins);
    external.stablecoinChanges = stablecoinChanges(external.stablecoins);
    external.dexVolume = dexVolume(external.dex);
    var dexCurrent = finiteNumber(external.dex && external.dex.total24h);
    var dexPrior = finiteNumber(external.dex && external.dex.total48hto24h);
    external.dexChange = Number.isFinite(dexCurrent) && Number.isFinite(dexPrior) && dexPrior !== 0 ? ((dexCurrent - dexPrior) / dexPrior) * 100 : NaN;
    external.fees24h = overviewTotal(external.fees);
    external.perpsOpenInterest = overviewTotal(external.perpsOi);
    external.sources = [
      sourceRow('Alternative.me', !!external.fearGreed, external.fearGreed ? external.fearGreed.label + ' ' + external.fearGreed.value : 'falhou'),
      sourceRow('Market data', !!(eligibleDataset(external.marketData) && (external.global || Object.keys(external.coinMarkets).length)), (marketBundle.source || 'fonte publica') + ' | ' + datasetStatus(external.marketData) + ' | ' + Object.keys(external.coinMarkets).length + ' ativos'),
      sourceRow('DefiLlama', !!(external.chains.length || external.protocols.length), external.chains.length + ' chains'),
      sourceRow('DefiLlama stablecoins', Number.isFinite(external.stablecoinCap) && external.stablecoinCap > 0, compactUsd(finiteNumber(external.stablecoinCap))),
      sourceRow('DefiLlama DEX', Number.isFinite(external.dexVolume) && external.dexVolume > 0, compactUsd(finiteNumber(external.dexVolume)) + ' 24h'),
      sourceRow('DefiLlama fees/OI', Number.isFinite(external.fees24h) || Number.isFinite(external.perpsOpenInterest), compactUsd(finiteNumber(external.fees24h)) + ' fees | ' + compactUsd(finiteNumber(external.perpsOpenInterest)) + ' OI'),
      sourceRow('Treasury + Cboe', macroSourceAvailable(external.macro), external.macro ? datasetStatus(external.macro) + ' | macro ' + signed(activeMacroScore(external.macro)) : 'falhou'),
      sourceRow('CoinPaprika', Number.isFinite(finiteNumber(external.paprikaGlobal && external.paprikaGlobal.market_cap_change_24h)) || Number.isFinite(finiteNumber(external.paprikaGlobal && external.paprikaGlobal.bitcoin_dominance_percentage)), external.paprikaGlobal ? percent(finiteNumber(external.paprikaGlobal.market_cap_change_24h), 2) + ' mcap' : 'falhou'),
      sourceRow('TradFi EOD', activeTradFiAssets(external.tradfi).length > 0, external.tradfi ? datasetStatus(external.tradfi) + ' | ' + activeTradFiAssets(external.tradfi).length + ' mercados fresh' : 'falhou')
    ];
    return external;
  }
  function overviewTotal(data) {
    if (!data) return NaN;
    var direct = firstFinite([data.total24h, data.totalDataChart24h, data.totalOpenInterest, data.openInterest]);
    if (Number.isFinite(direct)) return direct;
    var protocols = Array.isArray(data.protocols) ? data.protocols : [];
    return sumFinite(protocols.map(function (item) { return firstFinite([item && item.total24h, item && item.openInterest, item && item.totalOpenInterest]); }));
  }
  function stablecoinCap(stablecoins) {
    var assets = stablecoins && stablecoins.peggedAssets ? stablecoins.peggedAssets : [];
    return sumFinite(assets.map(function (item) {
      var circulating = item.circulating || {};
      return firstFinite([circulating.peggedUSD, circulating.usd, item.mcap]);
    }));
  }
  function stablecoinChanges(stablecoins) {
    var assets = stablecoins && stablecoins.peggedAssets ? stablecoins.peggedAssets : [];
    function total(key) {
      return sumFinite(assets.map(function (item) {
        var value = item[key] || {};
        return firstFinite([value.peggedUSD, value.usd]);
      }));
    }
    var current = stablecoinCap(stablecoins), day = total('circulatingPrevDay'), week = total('circulatingPrevWeek'), month = total('circulatingPrevMonth');
    function pct(prior) { return current && prior ? ((current - prior) / prior) * 100 : NaN; }
    return { day: pct(day), week: pct(week), month: pct(month) };
  }
  function dexVolume(dex) {
    if (!dex) return NaN;
    var direct = firstFinite([dex.total24h, dex.totalDataChart24h]);
    if (Number.isFinite(direct)) return direct;
    var protocols = Array.isArray(dex.protocols) ? dex.protocols : [];
    return sumFinite(protocols.map(function (item) { return firstFinite([item && item.total24h, item && item.volume24h]); }));
  }
  // Memo keyed by external.fetchedAt so the board's 24 cards don't rescan the protocol/chain
  // lists on every 3s tick; a new external snapshot resets the cache.
  var contextMemo = { stamp: -1, chain: {}, protocol: {} };
  function contextMemoBucket(kind) {
    var stamp = (state.external && state.external.fetchedAt) || 0;
    if (contextMemo.stamp !== stamp) contextMemo = { stamp: stamp, chain: {}, protocol: {} };
    return contextMemo[kind];
  }
  function findChainContext(symbol) {
    var bucket = contextMemoBucket('chain');
    if (Object.prototype.hasOwnProperty.call(bucket, symbol)) return bucket[symbol];
    var ctx = contextFor(symbol);
    var result = null;
    if (ctx.chain && state.external && state.external.chains) {
      var key = normKey(ctx.chain);
      result = state.external.chains.find(function (chain) {
        return normKey(chain.name) === key || normKey(chain.tokenSymbol) === key || normKey(chain.name).indexOf(key) !== -1;
      }) || null;
    }
    bucket[symbol] = result;
    return result;
  }
  function findProtocolContext(symbol) {
    var bucket = contextMemoBucket('protocol');
    if (Object.prototype.hasOwnProperty.call(bucket, symbol)) return bucket[symbol];
    var ctx = contextFor(symbol);
    var result = null;
    if (state.external && state.external.protocols) {
      var explicitKeys = ctx.protocol ? [ctx.protocol] : [];
      var fallbackKeys = ctx.protocol ? [] : [ctx.gecko, baseAsset(symbol), ASSET_NAMES[symbol]];
      result = AnalyticsCore.findProtocolMatch(state.external.protocols, explicitKeys, fallbackKeys);
    }
    bucket[symbol] = result;
    return result;
  }
  function selectedMarket(symbol) {
    var ctx = contextFor(symbol);
    var row = state.external && state.external.coinMarkets ? state.external.coinMarkets[ctx.gecko] || null : null;
    return row && sourceObservationFresh(row.observedAt || row.last_updated, EXTERNAL_STALE_MS) ? row : null;
  }
  function externalContextFresh() {
    return !!(state.external && AnalyticsCore.classifyFreshness(state.external.fetchedAt, EXTERNAL_STALE_MS, Date.now()).eligibleForScore);
  }
  function fearGreedEligible(ext) {
    return !!(ext && ext.fearGreed && AnalyticsCore.classifyFreshness(ext.fearGreed.timestamp, NEWS_ITEM_STALE_MS, Date.now()).eligibleForScore);
  }
  function sourceObservationFresh(observedAt, staleAfterMs) {
    return AnalyticsCore.classifyFreshness(timestampMs(observedAt), staleAfterMs, Date.now()).eligibleForScore;
  }
  function activeGlobalMarket(ext) {
    var global = ext && eligibleDataset(ext.marketData) ? ext.global : null;
    return global && sourceObservationFresh(global.updated_at || global.observedAt, EXTERNAL_STALE_MS) ? global : null;
  }
  function activeMacroParts(macro) {
    if (!eligibleDataset(macro)) return { treasury: null, vix: null };
    return {
      treasury: macro.treasury && sourceObservationFresh(macro.treasury.observedAt || macro.treasury.date, EOD_STALE_MS) ? macro.treasury : null,
      vix: macro.vix && sourceObservationFresh(macro.vix.observedAt || macro.vix.date, EOD_STALE_MS) ? macro.vix : null
    };
  }
  function macroSourceAvailable(macro) {
    var parts = activeMacroParts(macro);
    return !!(parts.treasury || parts.vix);
  }
  function activeMacroScore(macro) {
    var parts = activeMacroParts(macro), score = 0;
    if (parts.vix) score += parts.vix.close >= 35 ? -6 : parts.vix.close >= 25 ? -4 : parts.vix.close <= 17 ? 3 : 0;
    if (parts.treasury && Number.isFinite(parts.treasury.y10Change5d)) score += parts.treasury.y10Change5d >= 0.15 ? -2 : parts.treasury.y10Change5d <= -0.15 ? 2 : 0;
    if (parts.treasury && parts.treasury.curve10y2y < 0) score -= 1;
    return score;
  }
  function activeTradFiAssets(tradfi) {
    if (!eligibleDataset(tradfi) || !Array.isArray(tradfi.assets)) return [];
    return AnalyticsCore.filterFreshByTimestamp(tradfi.assets, 'observedAt', EOD_STALE_MS, Date.now());
  }
  function activeTradFiScore(tradfi) {
    var bySymbol = {};
    activeTradFiAssets(tradfi).forEach(function (asset) { bySymbol[asset.symbol] = asset; });
    // Crypto equities remain visible as context, but cannot score a supposedly independent
    // macro block: feeding COIN/MSTR back into a crypto signal creates a circular proxy.
    return ['QQQ', 'SPY', 'NVDA'].reduce(function (score, symbol) {
      var row = bySymbol[symbol];
      return score + (row && Number.isFinite(row.change5d) ? (row.change5d > 2 ? 1 : row.change5d < -2 ? -1 : 0) : 0);
    }, 0);
  }
  function fundamentalContextChecks(externalScore) {
    var ext = externalScore || {};
    var marketTrend = AnalyticsCore.calculateMarketTrendContext(ext.market);
    var chainAvailable = !!(ext.chain && (Number.isFinite(finiteNumber(ext.chain.change_1d)) || Number.isFinite(finiteNumber(ext.chain.change_7d))));
    var protocolAvailable = !!(ext.protocol && (Number.isFinite(finiteNumber(ext.protocol.change_1d)) || Number.isFinite(finiteNumber(ext.protocol.change_7d))));
    return [marketTrend.available, chainAvailable || protocolAvailable];
  }
  function marketMacroContextAvailable(ext) {
    if (!externalContextFresh()) return false;
    var global = activeGlobalMarket(ext);
    var globalChange = finiteNumber(global && global.market_cap_change_percentage_24h_usd);
    var paprikaChange = finiteNumber(ext && ext.paprikaGlobal && ext.paprikaGlobal.market_cap_change_24h);
    return Number.isFinite(globalChange) || Number.isFinite(paprikaChange) || Number.isFinite(btcDominanceValue(ext));
  }
  function emptyExternalScore(observedAt) {
    return { total: 0, sentiment: 0, global: 0, asset: 0, defi: 0, market: null, chain: null, protocol: null, observedAt: observedAt || null, staleAfterMs: EXTERNAL_STALE_MS, dataStatus: 'stale', eligibleForScore: false };
  }
  function scoreExternalContext(symbol) {
    if (!externalContextFresh()) return emptyExternalScore(state.external && state.external.fetchedAt);
    var ext = state.external || {};
    var marketDataFresh = eligibleDataset(ext.marketData);
    var market = marketDataFresh ? selectedMarket(symbol) : null;
    var chain = findChainContext(symbol);
    var protocol = findProtocolContext(symbol);
    var sentiment = 0, globalScore = 0, asset = 0, defi = 0;
    if (fearGreedEligible(ext) && Number.isFinite(ext.fearGreed.value)) {
      var fg = ext.fearGreed.value;
      sentiment = fg >= 80 ? -8 : fg >= 65 ? 4 : fg >= 45 ? 2 : fg >= 25 ? -3 : -6;
    }
    var activeGlobal = marketDataFresh ? activeGlobalMarket(ext) : null;
    var globalChange = activeGlobal ? finiteNumber(activeGlobal.market_cap_change_percentage_24h_usd) : NaN;
    if (!Number.isFinite(globalChange) && ext.paprikaGlobal) globalChange = finiteNumber(ext.paprikaGlobal.market_cap_change_24h);
    if (Number.isFinite(globalChange)) globalScore += clamp(Math.round(globalChange * 2.2), -10, 10);
    if (macroSourceAvailable(ext.macro)) globalScore += clamp(activeMacroScore(ext.macro), -8, 8);
    if (activeTradFiAssets(ext.tradfi).length) globalScore += clamp(activeTradFiScore(ext.tradfi), -4, 4);
    var btcDom = btcDominanceValue(ext);
    if (Number.isFinite(btcDom)) {
      if (symbol === 'BTCUSDT') globalScore += btcDom >= 54 ? 2 : btcDom <= 45 ? -2 : 0;
      else globalScore += btcDom >= 55 ? -4 : btcDom <= 48 ? 3 : 0;
    }
    var finiteOr = function (value, fallback) { var parsed = AnalyticsCore.toFiniteNumber(value); return parsed === null ? fallback : parsed; };
    if (market) {
      // d24 fica fora: o momentum de 24h ja e componente proprio do radar (momentum24h) e
      // entrava duplicado aqui; o bloco fundamental le posicionamento de medio prazo (7d/30d).
      asset = AnalyticsCore.calculateMarketTrendContext(market).score;
    }
    if (chain) {
      var chain1d = finiteOr(chain.change_1d, NaN), chain7d = finiteOr(chain.change_7d, NaN);
      if (Number.isFinite(chain1d) || Number.isFinite(chain7d)) defi += clamp(Math.round((Number.isFinite(chain1d) ? chain1d : 0) * 1.4 + (Number.isFinite(chain7d) ? chain7d : 0) * 0.55), -7, 7);
    }
    if (protocol) {
      var proto1d = finiteOr(protocol.change_1d, NaN), proto7d = finiteOr(protocol.change_7d, NaN);
      if (Number.isFinite(proto1d) || Number.isFinite(proto7d)) defi += clamp(Math.round((Number.isFinite(proto1d) ? proto1d : 0) * 1.2 + (Number.isFinite(proto7d) ? proto7d : 0) * 0.45), -7, 7);
    }
    defi = clamp(defi, -10, 10);
    var total = clamp(sentiment + globalScore + asset + defi, -28, 28);
    return { total: total, sentiment: sentiment, global: globalScore, asset: asset, defi: defi, market: market, chain: chain, protocol: protocol, observedAt: ext.observedAt, staleAfterMs: EXTERNAL_STALE_MS, dataStatus: ext.dataStatus || 'fresh', eligibleForScore: ext.dataStatus !== 'error' };
  }
  function btcDominanceValue(ext) {
    var global = activeGlobalMarket(ext);
    var marketDominance = finiteNumber(global && global.market_cap_percentage && global.market_cap_percentage.btc);
    if (Number.isFinite(marketDominance)) return marketDominance;
    var paprikaDominance = finiteNumber(ext && ext.paprikaGlobal && ext.paprikaGlobal.bitcoin_dominance_percentage);
    if (Number.isFinite(paprikaDominance)) return paprikaDominance;
    return NaN;
  }
  function applyExternalToAnalysis(symbol, analysis) {
    var externalScore = scoreExternalContext(symbol);
    var baseScore = Number.isFinite(analysis.coreScore) ? analysis.coreScore : analysis.score;
    analysis.external = externalScore;
    analysis.coreScore = baseScore;
    analysis.score = clamp(Math.round(baseScore + externalScore.total), -100, 100);
    analysis.bias = biasFromScore(analysis.score);
    return analysis;
  }
  function buildRadarScore(symbol, analysis) {
    var ext = analysis.external && eligibleDataset(analysis.external) ? analysis.external : scoreExternalContext(symbol);
    var historyCandidate = analysis.history || state.historyProfiles[symbol] || null;
    var history = historyFresh(historyCandidate) ? historyCandidate : null;
    var news = scoreNews(symbol);
    var ticker = analysis.ticker || {};
    var tickerChange24h = finiteNumber(ticker.priceChangePercent);
    var extEligible = ext.eligibleForScore !== false;
    var marketMacroAvailable = marketMacroContextAvailable(state.external);
    var externalMacroAvailable = fearGreedEligible(state.external) || macroSourceAvailable(state.external.macro) || activeTradFiAssets(state.external.tradfi).length > 0 || marketMacroAvailable;
    var macroChecks = [!!news.items.length || state.newsMode !== 'auto', fearGreedEligible(state.external), macroSourceAvailable(state.external.macro) || activeTradFiAssets(state.external.tradfi).length > 0];
    // Contrato 8.2/12.7 (RC-007): presenca do bloco de mercado ganha credito parcial (0.8) quando
    // a fonte que o alimentou e o fallback equivalente (CoinPaprika); chain/protocolo seguem com
    // credito 1. A disponibilidade vem de fundamentalContextChecks (ciclo D).
    var marketProvenance = AnalyticsCore.sourceProvenanceFactor(state.external.marketData && state.external.marketData.source);
    var fundamentalAvailability = fundamentalContextChecks(ext);
    var fundamentalChecks = [fundamentalAvailability[0] ? marketProvenance : 0, fundamentalAvailability[1] ? 1 : 0];
    var parts = [
      { name: 'Tecnica', ruleId: 'radar.technical.v2', weight: 30, available: Number.isFinite(analysis.trendScore) && Number.isFinite(analysis.momScore), value: clamp(((analysis.trendScore + analysis.momScore + (analysis.structureShift ? analysis.structureShift.score : 0) + (analysis.divergenceScore || 0) + (analysis.squeeze ? analysis.squeeze.score : 0)) / 60) * 100, -100, 100), quality: Math.min(1, (analysis.candleCount || 0) / 220), raw: analysis.trendScore + analysis.momScore + (analysis.structureShift ? analysis.structureShift.score : 0) + (analysis.divergenceScore || 0) + (analysis.squeeze ? analysis.squeeze.score : 0), scope: 'symbol', reason: 'EMAs, RSI, MACD, ADX, estrutura, CHoCH/BOS, divergencia e squeeze do timeframe' },
      { name: 'Fluxo', ruleId: 'radar.flow.v1', weight: 15, available: analysis.flowAvailable === true, value: clamp((analysis.flowScore / 13) * 100, -100, 100), quality: Number.isFinite(analysis.flowCoverage) ? analysis.flowCoverage : 0, raw: analysis.flowScore, scope: 'symbol', reason: 'Delta taker e CMF (volume marca cobertura, sem bonus direcional)' },
      { name: 'Derivativos', ruleId: 'radar.derivatives.v1', weight: 10, available: Number.isFinite(analysis.funding) || Number.isFinite(analysis.basis), value: clamp((analysis.derivScore / 9) * 100, -100, 100), quality: ((Number.isFinite(analysis.funding) ? 1 : 0) + (Number.isFinite(analysis.basis) ? 1 : 0)) / 2, raw: analysis.derivScore, scope: 'symbol', reason: 'Funding e basis dos perpetuos Binance' },
      { name: 'Fundamental', ruleId: 'radar.fundamental.v1', weight: 15, available: extEligible && fundamentalChecks.some(Boolean), value: clamp(((ext.asset + ext.defi) / 22) * 100, -100, 100), quality: (fundamentalChecks[0] + fundamentalChecks[1]) / fundamentalChecks.length, raw: ext.asset + ext.defi, scope: 'symbol', reason: 'Variacoes 7d/30d de mercado (CoinGecko/fallback com credito de proveniencia) e 1d/7d de TVL DeFiLlama' },
      { name: 'Macro/noticias', ruleId: 'radar.macro.v1', weight: 10, available: !!(news.items.length || state.newsMode !== 'auto' || externalMacroAvailable), value: clamp(((news.score * 0.45 + ext.sentiment + ext.global) / 30) * 100, -100, 100), quality: macroChecks.filter(Boolean).length / macroChecks.length, raw: news.score * 0.45 + ext.sentiment + ext.global, scope: 'market', reason: 'Noticias RSS, sentimento e macro oficial' },
      { name: 'Historico', ruleId: 'radar.history.v1', weight: 15, available: !!history, value: history ? clamp((history.score / 12) * 100, -100, 100) : 0, quality: history ? Math.min(1, (history.samples || 0) / 20) : 0, raw: history ? history.score : null, scope: 'symbol', reason: 'Regimes semelhantes no historico diario' },
      { name: 'Momentum 24h', ruleId: 'radar.momentum24h.v1', weight: 5, available: Number.isFinite(tickerChange24h), value: Number.isFinite(tickerChange24h) ? clamp((tickerChange24h / 5) * 100, -100, 100) : 0, quality: Number.isFinite(tickerChange24h) ? 1 : 0, raw: Number.isFinite(tickerChange24h) ? tickerChange24h : null, scope: 'symbol', reason: 'Variacao 24h do ticker Binance' }
    ];
    var aggregate = AnalyticsCore.aggregateRadarParts(parts);
    parts.forEach(function (part, index) {
      part.contribution = aggregate.contributions[index] ? aggregate.contributions[index].contribution : 0;
      part.status = part.available ? 'fresh' : 'missing';
      part.isProxy = false;
    });
    analysis.radar = {
      modelId: AnalyticsCore.RULESET.modelId,
      modelVersion: MODEL_VERSION,
      rulesetHash: RULESET_HASH,
      scoreType: 'radar',
      symbol: symbol,
      interval: analysis.interval || state.boardInterval || state.interval,
      score: aggregate.score,
      rawScore: aggregate.rawScore,
      bias: aggregate.bias,
      dataConfidence: aggregate.dataConfidence,
      confidence: aggregate.dataConfidence,
      dataStatus: aggregate.dataStatus,
      calculatedAt: Date.now(),
      lastClosedCandleTime: analysis.signalCandle ? analysis.signalCandle.closeTime : null,
      components: parts,
      availableWeight: aggregate.availableWeight
    };
    analysis.score = aggregate.score;
    analysis.bias = aggregate.bias;
    return analysis;
  }
  function technicalSnapshot(candles, interval) {
    var a = buildCoreAnalysis(candles, null, null, { interval: interval });
    var score = 0;
    if (Number.isFinite(a.ema21)) score += a.close > a.ema21 ? 10 : -10;
    if (Number.isFinite(a.ema21) && Number.isFinite(a.ema50)) score += a.ema21 > a.ema50 ? 10 : -10;
    if (Number.isFinite(a.ema200)) score += a.ema50 > a.ema200 ? 12 : -12;
    score += a.adx.adx > 22 ? (a.adx.plus > a.adx.minus ? 8 : -8) : 0;
    if (Number.isFinite(a.rsi14)) score += a.rsi14 >= 52 && a.rsi14 <= 70 ? 6 : a.rsi14 < 45 ? -6 : a.rsi14 > 76 ? -3 : 0;
    if (Number.isFinite(a.macd.hist)) score += a.macd.hist > 0 ? 6 : -6;
    score += a.structure === 'HH/HL' ? 5 : a.structure === 'LH/LL' ? -5 : 0;
    score = clamp(Math.round(score), -50, 50);
    var cross = (a.patterns || []).find(function (pattern) { return pattern.name === 'Golden cross' || pattern.name === 'Death cross'; });
    return { interval: interval, score: score, bias: score >= 12 ? 'Alta' : score <= -12 ? 'Baixa' : 'Neutro', close: a.close, closeTime: candles.length ? last(candles).closeTime : NaN, rsi: a.rsi14, adx: a.adx.adx, macd: a.macd.hist, structure: a.structure, regime: a.regime, cross: cross ? cross.name : (Number.isFinite(a.ema200) ? (a.ema50 >= a.ema200 ? 'EMA50 > EMA200' : 'EMA50 < EMA200') : 'sem EMA200'), patterns: (a.patterns || []).slice(0, 3) };
  }
  function summarizeMultiTimeframe(rows, selectedInterval) {
    // Aggregation (weights, directional alignment, bias) lives in the lib so it is tested and
    // covered by the ruleset registry; this wrapper only reattaches the rows for rendering.
    // The chart's own timeframe is EXCLUDED from the aggregate: it is already fully scored by
    // the technical bucket, and the MTF block must measure INDEPENDENT confirmation.
    var aggregationRows = rows.filter(function (row) { return row.interval !== selectedInterval; });
    // aggregatedCount = how many timeframes actually fed the score (chart TF excluded); the full
    // `rows` set is kept only for rendering the per-TF table.
    return Object.assign({ rows: rows, aggregatedCount: aggregationRows.length }, AnalyticsCore.aggregateMultiTimeframe(aggregationRows));
  }
  async function loadMultiTimeframe(symbol, selectedInterval, force, selectedCandles) {
    var intervals = MTF_INTERVALS.concat([selectedInterval]).filter(function (value, index, array) { return array.indexOf(value) === index; });
    var results = await Promise.allSettled(intervals.map(async function (interval) {
      var key = symbol + ':' + interval, cached = state.mtfCache[key];
      if (!force && cached && Date.now() - cached.fetchedAt < MTF_REFRESH_MS) return cached.value;
      var candles;
      if (interval === selectedInterval && selectedCandles && selectedCandles.length >= 220) candles = selectedCandles;
      else {
        var path = '/api/v3/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + interval + '&limit=500';
        candles = selectClosedCandles(parseKlines(await fetchSpotJSON(path, 12000, 'Binance MTF')));
      }
      // The weekly leg needs a lower floor: demanding 60 closed weekly candles (~14 months of
      // listing) would deny the HTF gate — and thus 'Entrada favoravel' — to newer listings
      // forever. 30 weekly candles still give EMA21/structure a meaningful read.
      if (!candles || candles.length < (interval === '1w' ? 30 : 60)) return null;
      var snapshot = technicalSnapshot(candles, interval);
      state.mtfCache[key] = { value: snapshot, candles: candles.slice(), fetchedAt: Date.now() };
      return snapshot;
    }));
    return summarizeMultiTimeframe(results.map(value).filter(Boolean), selectedInterval);
  }
  function median(values) {
    if (!values.length) return NaN;
    var rows = values.slice().sort(function (a, b) { return a - b; }), middle = Math.floor(rows.length / 2);
    return rows.length % 2 ? rows[middle] : (rows[middle - 1] + rows[middle]) / 2;
  }
  function rsiBucket(value) { return value < 35 ? 0 : value < 50 ? 1 : value < 65 ? 2 : value < 75 ? 3 : 4; }
  function historicalProfile(candles) {
    if (!candles || candles.length < 240) return null;
    var closes = candles.map(function (c) { return c.close; });
    var ema50Rows = emaSeries(closes, 50), ema200Rows = emaSeries(closes, 200), rsiRows = rsiSeries(closes, 14);
    var lastIndex = closes.length - 1;
    // Tercil de volatilidade realizada (30d) na assinatura: o mesmo padrao tecnico em regime de
    // vol baixa e de vol alta tem distribuicoes de retorno diferentes.
    var volRows = closes.map(function (_, index) {
      if (index < 31) return NaN;
      return realizedVolatility(closes.slice(index - 31, index + 1), 30, '1d');
    });
    var sortedVol = volRows.filter(Number.isFinite).slice().sort(function (a, b) { return a - b; });
    function volTercile(value) {
      if (!Number.isFinite(value) || sortedVol.length < 30) return 1;
      if (value <= sortedVol[Math.floor(sortedVol.length / 3)]) return 0;
      if (value <= sortedVol[Math.floor(sortedVol.length * 2 / 3)]) return 1;
      return 2;
    }
    var currentSignature = { above200: closes[lastIndex] > ema200Rows[lastIndex], bullCross: ema50Rows[lastIndex] > ema200Rows[lastIndex], rsi: rsiBucket(rsiRows[lastIndex]), vol: volTercile(volRows[lastIndex]) };
    var HALF_LIFE_DAYS = 730;
    function collect(relaxed) {
      var matches = [];
      var lastMatchIndex = -Infinity;
      for (var i = 200; i < candles.length - 30; i++) {
        if (!Number.isFinite(ema200Rows[i]) || !Number.isFinite(rsiRows[i])) continue;
        // Espacamento minimo de 5 dias entre matches: dias consecutivos do mesmo regime sao a
        // MESMA amostra com retornos sobrepostos, nao amostras independentes.
        if (i - lastMatchIndex < 5) continue;
        var sameDirection = (closes[i] > ema200Rows[i]) === currentSignature.above200;
        var sameCross = (ema50Rows[i] > ema200Rows[i]) === currentSignature.bullCross;
        var sameRsi = Math.abs(rsiBucket(rsiRows[i]) - currentSignature.rsi) <= (relaxed ? 1 : 0);
        var sameVol = relaxed || volTercile(volRows[i]) === currentSignature.vol;
        if (sameDirection && sameCross && sameRsi && sameVol) {
          lastMatchIndex = i;
          var ageDays = lastIndex - i;
          matches.push({
            d1: ((closes[i + 1] - closes[i]) / closes[i]) * 100,
            d7: ((closes[i + 7] - closes[i]) / closes[i]) * 100,
            d30: ((closes[i + 30] - closes[i]) / closes[i]) * 100,
            // Decay temporal: meia-vida ~2 anos; um match de 2018 nao vale o mesmo que um de 2026.
            weight: Math.pow(0.5, ageDays / HALF_LIFE_DAYS)
          });
        }
      }
      return matches;
    }
    var matches = collect(false);
    if (matches.length < 12) matches = collect(true);
    var weights = matches.map(function (x) { return x.weight; });
    var d1 = matches.map(function (x) { return x.d1; }), d7 = matches.map(function (x) { return x.d7; }), d30 = matches.map(function (x) { return x.d30; });
    // Base rate incondicional: mediana de TODOS os retornos de 7d do ativo. O historico so deve
    // pontuar o EXCESSO do regime sobre a deriva natural do ativo (fix pro-ciclico).
    var unconditional7 = [];
    for (var u = 200; u < closes.length - 7; u++) unconditional7.push(((closes[u + 7] - closes[u]) / closes[u]) * 100);
    var baseline7 = median(unconditional7);
    var baselineWin7 = unconditional7.length ? unconditional7.filter(function (v) { return v > 0; }).length / unconditional7.length * 100 : 50;
    var peak = closes[0], maxDrawdown = 0;
    closes.forEach(function (close) { peak = Math.max(peak, close); maxDrawdown = Math.min(maxDrawdown, ((close - peak) / peak) * 100); });
    var winRate7 = d7.length ? d7.filter(function (value) { return value > 0; }).length / d7.length * 100 : NaN;
    var median7 = AnalyticsCore.weightedMedian(d7, weights);
    var excess7 = Number.isFinite(median7) && Number.isFinite(baseline7) ? median7 - baseline7 : NaN;
    var score = 0;
    if (Number.isFinite(excess7)) score += clamp(Math.round(excess7 * 2.2), -8, 8);
    if (Number.isFinite(winRate7)) score += clamp(Math.round((winRate7 - baselineWin7) / 4), -4, 4);
    var latestCandle = last(candles);
    return {
      fetchedAt: Date.now(), observedAt: latestCandle.closeTime || latestCandle.time + 86400000, candles: candles.length, listingTime: candles[0].time, maxDrawdown: maxDrawdown,
      realizedVol30: realizedVolatility(closes, 30, '1d'), realizedVol90: realizedVolatility(closes, 90, '1d'),
      samples: matches.length, independentSamples: true, volTercile: currentSignature.vol, baseline7: baseline7, excess7: excess7,
      winRate1: d1.length ? d1.filter(function (value) { return value > 0; }).length / d1.length * 100 : NaN,
      winRate7: winRate7, winRate30: d30.length ? d30.filter(function (value) { return value > 0; }).length / d30.length * 100 : NaN,
      median1: AnalyticsCore.weightedMedian(d1, weights), median7: median7, median30: AnalyticsCore.weightedMedian(d30, weights), score: clamp(score, -12, 12)
    };
  }
  function historyFresh(profile) {
    return !!(profile && AnalyticsCore.classifyFreshness(profile.observedAt, HISTORY_STALE_MS, Date.now()).eligibleForScore);
  }
  function historyCacheRecent(profile) {
    return !!(profile && AnalyticsCore.classifyFreshness(profile.fetchedAt, HISTORY_REFRESH_MS, Date.now()).eligibleForScore);
  }
  function attachHistory(analysis, profile) {
    if (!analysis || !historyFresh(profile)) return analysis;
    if (analysis.history === profile) return analysis;
    analysis.history = profile;
    if (analysis.snapshot) stampAnalysisSnapshot(analysis, 'history');
    return analysis;
  }
  async function fetchFullDailyHistory(symbol) {
    var all = [], startTime = Date.UTC(2010, 0, 1), now = Date.now(), pages = 0;
    while (startTime < now && pages < 12) {
      var path = '/api/v3/klines?symbol=' + encodeURIComponent(symbol) + '&interval=1d&limit=1000&startTime=' + startTime;
      var rows = parseKlines(await fetchSpotJSON(path, 15000, 'Binance historico'));
      if (!rows.length) break;
      rows.forEach(function (row) { if (!all.length || row.time > last(all).time) all.push(row); });
      var next = last(rows).time + 86400000;
      if (next <= startTime || rows.length < 1000) break;
      startTime = next;
      pages++;
      await delay(70);
    }
    return selectClosedCandles(all, now);
  }
  async function ensureHistoricalProfile(symbol, keepCandles) {
    if (historyFresh(state.historyProfiles[symbol]) && historyCacheRecent(state.historyProfiles[symbol]) && (!keepCandles || state.historyCandles[symbol])) return state.historyProfiles[symbol];
    if (state.historyLoading[symbol]) return state.historyLoading[symbol];
    var historyStorageKey = 'liveDesk.history.' + MODEL_VERSION + '.' + symbol;
    var stored = safeStorageGet(historyStorageKey);
    if (!keepCandles && historyFresh(stored) && historyCacheRecent(stored)) {
      state.historyProfiles[symbol] = stored;
      return stored;
    }
    state.historyLoading[symbol] = (async function () {
      try {
        var candles = await fetchFullDailyHistory(symbol);
        var profile = historicalProfile(candles);
        if (profile) {
          state.historyProfiles[symbol] = profile;
          if (keepCandles) {
            // Only the selected symbol's full daily series is ever read; evict the others so the
            // cache doesn't grow ~15MB across the 24 assets as the user browses.
            Object.keys(state.historyCandles).forEach(function (key) { if (key !== symbol) delete state.historyCandles[key]; });
            state.historyCandles[symbol] = candles;
          }
          safeStorageSet(historyStorageKey, profile);
        }
        return profile;
      } catch (error) {
        health('Binance historico', false, error.message || 'falhou');
        return historyFresh(stored) ? stored : null;
      } finally { delete state.historyLoading[symbol]; }
    })();
    return state.historyLoading[symbol];
  }
  function setupQuality(a) {
    var volumeRatio = Number.isFinite(a.avgVol) && a.avgVol ? a.lastVol / a.avgVol : NaN;
    var derivative = scoreableDerivativeDetail(a.derivativeDetail);
    var setupExternal = eligibleDataset(a.external) ? a.external : null;
    var checks = [
      { name: 'Tendencia', score: a.adx.adx > 22 && a.adx.plus > a.adx.minus && a.close > a.ema50 ? 18 : a.adx.adx > 22 && a.adx.minus > a.adx.plus ? -18 : 0, detail: 'ADX ' + num(a.adx.adx, 1) + ' | DI+ ' + num(a.adx.plus, 1) + ' / DI- ' + num(a.adx.minus, 1) },
      { name: 'Momentum', score: a.rsi14 > 52 && a.rsi14 < 70 && a.macd.hist > 0 && a.roc12 > 0 ? 16 : a.rsi14 > 76 || (a.macd.hist < 0 && a.roc12 < 0) ? -16 : 0, detail: 'RSI ' + num(a.rsi14, 1) + ' | ROC ' + percent(a.roc12, 2) },
      { name: 'Fluxo', score: a.deltaSum > 0 && a.cmf20 > 0.05 ? 14 : a.deltaSum < 0 && a.cmf20 < -0.05 ? -14 : 0, detail: 'Delta ' + num(a.deltaSum, 2) + ' | CMF ' + num(a.cmf20, 2) },
      { name: 'Volume', score: Number.isFinite(volumeRatio) && volumeRatio > 1.35 ? 10 : Number.isFinite(volumeRatio) && volumeRatio < 0.55 ? -10 : 0, detail: Number.isFinite(volumeRatio) ? num(volumeRatio, 2) + 'x media' : '--' },
      { name: 'Liquidez', score: Number.isFinite(a.spreadBps) && a.spreadBps < 3 && Number.isFinite(a.buySlipBps) && a.buySlipBps < 8 ? 12 : Number.isFinite(a.spreadBps) && a.spreadBps > 12 ? -12 : 0, detail: 'Spread ' + num(a.spreadBps, 2) + ' bps | slip ' + num(a.buySlipBps, 2) + ' bps' },
      { name: 'Derivativos', score: Number.isFinite(derivative.takerRatio) && derivative.takerRatio > 1.08 ? 10 : Number.isFinite(derivative.takerRatio) && derivative.takerRatio < 0.92 ? -10 : 0, detail: Object.keys(derivative).length ? 'Taker ' + num(derivative.takerRatio, 2) + ' | OI ' + percent(derivative.oiChangePct, 2) : 'indisponivel ou stale' },
      { name: 'Contexto', score: setupExternal && setupExternal.total > 6 ? 12 : setupExternal && setupExternal.total < -6 ? -12 : 0, detail: setupExternal ? 'Externo ' + signed(setupExternal.total) : 'indisponivel ou stale' }
    ];
    var total = clamp(Math.round(checks.reduce(function (sum, item) { return sum + item.score; }, 0)), -100, 100);
    return { total: total, checks: checks };
  }
  function freshNewsItems() {
    return AnalyticsCore.filterFreshByTimestamp(state.news, 'published', NEWS_ITEM_STALE_MS, Date.now());
  }
  async function loadNewsIfNeeded(force) {
    if (!force && Date.now() - Math.max(state.newsFetchedAt, state.newsAttemptedAt) < NEWS_REFRESH_MS) return;
    state.newsAttemptedAt = Date.now();
    var rows = await Promise.allSettled([
      fetchJSON('/api/news', 12000, 'Noticias RSS')
    ]);
    var news = [];
    if (rows[0].status === 'fulfilled' && rows[0].value && Array.isArray(rows[0].value.items)) {
      news = rows[0].value.items.slice(0, 36);
      state.newsSources = rows[0].value.sources || [];
    }
    if (news.length) {
      state.news = news.sort(function (a, b) { return (b.published || 0) - (a.published || 0); }).filter(function (item, index, rows) { return rows.findIndex(function (row) { return row.title === item.title; }) === index; }).slice(0, 32);
      state.newsFetchedAt = Date.now();
      health('Noticias RSS', true, state.news.length + ' noticias');
    } else health('Noticias RSS', false, 'sem feed; mantendo ultimo dado');
  }
  function scoreNews(symbol) {
    if (state.newsMode === 'risk-on') return { score: 18, label: 'manual risk-on', items: [] };
    if (state.newsMode === 'risk-off') return { score: -18, label: 'manual risk-off', items: [] };
    if (state.newsMode === 'neutral') return { score: 0, label: 'manual neutro', items: [] };
    var base = baseAsset(symbol);
    var name = ASSET_NAMES[symbol] || '';
    var positive = ['inflow', 'inflows', 'approval', 'approved', 'adoption', 'accumulation', 'reserve', 'rally', 'surge', 'dovish', 'rate cut', 'easing', 'lower inflation', 'institutional', 'partnership', 'upgrade', 'etf demand', 'buying'];
    var negative = ['outflow', 'outflows', 'hack', 'lawsuit', 'ban', 'crackdown', 'selloff', 'liquidation', 'hawkish', 'rate hike', 'higher inflation', 'war', 'sanction', 'oil spike', 'recession', 'default', 'exploit', 'probe'];
    var newsItems = freshNewsItems();
    var scored = newsItems.map(function (item) {
      var rawText = item.title + ' ' + item.body;
      var raw = AnalyticsCore.newsKeywordScore(rawText, positive, negative);
      var relevance = AnalyticsCore.newsAssetRelevance(rawText, base, name, item.type);
      return { item: item, score: raw * relevance, relevance: relevance };
    }).filter(function (row) { return row.score !== 0 || row.relevance >= 1.2; });
    var total = scored.reduce(function (sum, row) { return sum + row.score; }, 0);
    var score = clamp(Math.round(total * 6), -22, 22);
    return { score: score, label: newsItems.length ? 'auto noticias' : 'sem noticias frescas', items: scored.sort(function (a, b) { return Math.abs(b.score) - Math.abs(a.score); }).slice(0, 6) };
  }
  function cleanNewsOverrideText(value, maxLength) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  }
  function rerenderNewsDrivenAnalysis(reason) {
    if (!state.analysis || !analysisMatchesSelection(state.analysis)) return;
    stampAnalysisSnapshot(state.analysis, reason || 'news-mode');
    renderConfluence(state.analysis);
    renderWrittenAnalysis(state.analysis);
    updateScore(state.analysis);
  }
  function setNewsOverrideFeedback(message, isError) {
    var node = $('newsOverrideFeedback');
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('is-error', !!isError);
  }
  function showNewsOverrideEditor(visible) {
    var panel = $('newsOverridePanel');
    if (panel) panel.hidden = !visible;
  }
  function applyNewsMode(mode, author, reason) {
    var allowed = ['auto', 'risk-on', 'neutral', 'risk-off'];
    if (allowed.indexOf(mode) === -1) return false;
    if (mode === 'auto') {
      state.newsMode = 'auto';
      state.newsOverrideAt = null;
      state.newsOverrideAuthor = null;
      state.newsOverrideReason = null;
      rerenderNewsDrivenAnalysis('news-mode-auto');
      return true;
    }
    author = cleanNewsOverrideText(author, 80);
    reason = cleanNewsOverrideText(reason, 180);
    if (!author || !reason) return false;
    state.newsMode = mode;
    state.newsOverrideAt = Date.now();
    state.newsOverrideAuthor = author;
    state.newsOverrideReason = reason;
    rerenderNewsDrivenAnalysis('news-mode-manual');
    return true;
  }
  function newsOverrideAuditLabel() {
    if (state.newsMode === 'auto') return '';
    var time = timestampMs(state.newsOverrideAt);
    var when = Number.isFinite(time) ? new Date(time).toISOString() : 'instante nao registrado';
    return 'override manual por ' + (state.newsOverrideAuthor || 'autor nao registrado') + ' em ' + when + '; motivo: ' + (state.newsOverrideReason || 'nao registrado') + '; ';
  }
  function smartMoneyAnalysis(a) {
    var score = 0, liquidity = 'Sem sweep', imbalance = 'Sem deslocamento', oiPhase = 'OI/preco indisponivel';
    score += a.structure === 'HH/HL' ? 5 : a.structure === 'LH/LL' ? -5 : 0;
    // A confirmed trap already scores the reclaim (with its extra OI/liq confirmation) in trapScore,
    // which also feeds flow — scoring the raw sweep here too would count the same reclaim twice in
    // the flow component. When a same-direction trap fired, keep the liquidity label but drop the
    // duplicate sweep contribution. (bull trap comes from a low-sweep, bear trap from a high-sweep.)
    var bullTrap = !!(a.trap && a.trap.trap === 'bull');
    var bearTrap = !!(a.trap && a.trap.trap === 'bear');
    if (a.sweepDown) { score += bullTrap ? 0 : (a.close > a.vwap ? 8 : 3); liquidity = 'Sweep de minima' + (a.close > a.vwap ? ' / reclaim' : ' / sem reclaim VWAP') + (bullTrap ? ' (trap)' : ''); }
    if (a.sweepUp) { score -= bearTrap ? 0 : (a.close < a.vwap ? 8 : 3); liquidity = 'Sweep de maxima' + (a.close < a.vwap ? ' / rejeicao' : ' / sem rejeicao VWAP') + (bearTrap ? ' (trap)' : ''); }
    if (a.displacement === 'Alta') { score += 4; imbalance = 'Deslocamento comprador'; }
    else if (a.displacement === 'Baixa') { score -= 4; imbalance = 'Deslocamento vendedor'; }
    if (a.fvg) imbalance += ' | FVG ' + (a.fvg.type === 'bullish' ? 'alta' : 'baixa');
    // Delta/CMF are already scored in flowScore (calculateCandleFlow: delta +/-9, cmf +/-4). Scoring
    // their agreement again here would double-count the same flow signal inside the flow component,
    // since smart.score also feeds flow (smart.score*0.55).
    var detail = scoreableDerivativeDetail(a.derivativeDetail);
    if (Number.isFinite(detail.oiChangePct)) {
      // Same-window signal as calculateDerivativeDetailContribution. Narrative label ONLY: the
      // quadrant SCORES exclusively in the derivatives bucket
      // (lib) — adding it here too double-counted it into flow via smart.score*0.55.
      if (Number.isFinite(a.oiPriceChangePct)) oiPhase = AnalyticsCore.calculateOiPriceQuadrant(detail.oiChangePct, a.oiPriceChangePct).phase;
    }
    return { score: clamp(Math.round(score), -18, 18), structure: a.structure, liquidity: liquidity, imbalance: imbalance, oiPhase: oiPhase };
  }
  function dataQuality(a) {
    var closedCount = selectClosedCandles(state.klines).length;
    var technicalQuality = Math.min(1, closedCount / 220);
    // Quality = coverage of the CANONICAL timeframes (the weekly leg matters most), not raw row
    // count — the chart TF row used to inflate this while 1w was missing.
    var mtfRows = (state.mtf && state.mtf.rows) || [];
    var mtfQuality = AnalyticsCore.timeframeCoverage(mtfRows, MTF_INTERVALS).ratio;
    var historyQuality = historyFresh(a.history) ? Math.min(1, (a.history.samples || 0) / 20) : 0;
    var flowChecks = [Number.isFinite(a.deltaSum) && Number.isFinite(a.cmf20), Number.isFinite(a.spreadBps) && Number.isFinite(a.buySlipBps)];
    var flowQuality = flowChecks.filter(Boolean).length / flowChecks.length;
    var derivativeChecks = [Number.isFinite(a.funding) || Number.isFinite(a.basis), hasDerivativeData(a.derivativeDetail)];
    if (eligibleDataset(a.options)) derivativeChecks.push(!!a.options.market);
    var derivativeQuality = derivativeChecks.filter(Boolean).length / derivativeChecks.length;
    var currentExternal = a.external && eligibleDataset(a.external) ? a.external : scoreExternalContext(state.symbol);
    var nativeChainEligible = !!(a.mempoolContext && a.mempoolContext.eligibleForScore);
    // Contrato 8.2/12.7 (RC-007): quando o contexto externo so esta coberto pelo market data de
    // FALLBACK (CoinPaprika no lugar da CoinGecko), o credito de proveniencia e parcial (0.8),
    // nao cheio. A disponibilidade vem de fundamentalContextChecks (ciclo D).
    var contextAvailability = fundamentalContextChecks(currentExternal);
    var contextCredit = contextAvailability[1] ? 1
      : contextAvailability[0] ? AnalyticsCore.sourceProvenanceFactor(state.external.marketData && state.external.marketData.source) : 0;
    var coinMetricsCredit = (!!(a.coinMetrics && a.coinMetrics.latest && eligibleDataset(a.coinMetrics)) || nativeChainEligible) ? 1 : 0;
    var fundamentalQuality = (coinMetricsCredit + contextCredit) / 2;
    var macroChecks = [state.newsMode !== 'auto' || freshNewsItems().length > 0, marketMacroContextAvailable(state.external), externalContextFresh() && !!(state.external && (macroSourceAvailable(state.external.macro) || activeTradFiAssets(state.external.tradfi).length || fearGreedEligible(state.external)))];
    var macroQuality = macroChecks.filter(Boolean).length / macroChecks.length;
    var riskQuality = (technicalQuality + flowQuality + derivativeQuality) / 3;
    // Data Confidence weights ARE the setup caps (contract 8.2). Derive them from the ruleset so
    // the two can never drift again.
    var caps = AnalyticsCore.RULESET.setupCaps;
    return AnalyticsCore.calculateDataConfidence([
      { weight: caps.technical, quality: technicalQuality },
      { weight: caps.multiTimeframe, quality: mtfQuality },
      { weight: caps.smartFlow, quality: flowQuality },
      { weight: caps.derivatives, quality: derivativeQuality },
      { weight: caps.chainFundamental, quality: fundamentalQuality },
      { weight: caps.newsMacro, quality: macroQuality },
      { weight: caps.history, quality: historyQuality },
      { weight: caps.risk, quality: riskQuality }
    ]);
  }
  var confluenceMemo = { key: null, value: null, computedAt: 0 };
  var CONFLUENCE_MEMO_TTL_MS = 15000;
  /**
   * Memoizes the confluence per snapshot so every panel rendered in the same pass (gauge,
   * reasons, written analysis, trade plan) reads the same result, AND so consecutive 3s render
   * passes reuse it while inputs are unchanged. Keyed by inputSnapshotId only — calculatedAt and
   * revision bumped on every re-stamp even when inputs were identical, defeating the memo. A short
   * TTL still forces re-evaluation so a source that goes stale without a new snapshot id (its
   * observedAt frozen) is re-scored within ~15s instead of serving a stale-eligible confluence.
   */
  function confluenceFor(a) {
    var snapshot = a && a.snapshot;
    var key = snapshot ? snapshot.inputSnapshotId : null;
    var now = Date.now();
    if (key && confluenceMemo.key === key && (now - confluenceMemo.computedAt) < CONFLUENCE_MEMO_TTL_MS) return confluenceMemo.value;
    var value = buildConfluence(a);
    if (key) { confluenceMemo.key = key; confluenceMemo.value = value; confluenceMemo.computedAt = now; }
    return value;
  }
  function buildConfluence(a) {
    var news = scoreNews(state.symbol);
    var external = a.external && eligibleDataset(a.external) ? a.external : scoreExternalContext(state.symbol);
    // CHoCH/BOS e divergencia entram no tecnico com peso integral (nao diluidos pelos fatores
    // 0.32/0.42 dos scores continuos) — sao eventos discretos de virada.
    var technical = clamp(Math.round(a.trendScore * 0.32 + a.momScore * 0.42 + (a.structureShift ? a.structureShift.score : 0) + (a.divergenceScore || 0)), -20, 20);
    var multi = state.mtf || { score: 0, alignment: 0, bias: 'Misto', rows: [] };
    var smart = smartMoneyAnalysis(a);
    var trapScore = a.trap && a.trap.trap ? a.trap.score : 0;
    var squeezeScore = a.squeeze ? a.squeeze.score : 0;
    var flow = clamp(Math.round(a.flowScore * 0.48 + a.bookScore * 0.35 + smart.score * 0.55 + trapScore + squeezeScore), -18, 18);
    var optionsData = a.options || state.options;
    var detailPercentiles = a.derivativeDetail && a.derivativeDetail.percentiles ? a.derivativeDetail.percentiles : {};
    // Carry only scores from ELIGIBLE data — a stale cached fundingAvg must not keep injecting
    // its carry read after the dataset was declared ineligible (same gate the detail scorer uses).
    var confluenceAsOf = Date.now();
    var detailFundingEligible = !!(a.derivativeDetail
      && Number.isFinite(a.derivativeDetail.fundingAvg)
      && AnalyticsCore.resolveDatasetFreshness(a.derivativeDetail, confluenceAsOf).eligibleForScore
      && AnalyticsCore.isDatasetMetricEligible(a.derivativeDetail, 'fundingAvg', confluenceAsOf));
    var carry = AnalyticsCore.calculateCarryRegime({
      fundingAvg: detailFundingEligible ? a.derivativeDetail.fundingAvg : null,
      oiPercentile: detailPercentiles.oi
    });
    var derivativeDetail = AnalyticsCore.calculateDerivativeDetailContribution({
      detail: a.derivativeDetail,
      options: optionsData,
      close: a.close,
      vwap: a.vwap,
      oiPriceChangePct: a.oiPriceChangePct,
      percentiles: detailPercentiles,
      muteOiQuadrant: carry.muteBuildup,
      carryScore: carry.carryScore,
      priceChange7dPct: (function () {
        var market = eligibleDataset(state.external.marketData) ? selectedMarket(state.symbol) : null;
        return market ? AnalyticsCore.toFiniteNumber(market.price_change_percentage_7d_in_currency) : null;
      })(),
      asOf: Date.now()
    });
    // Funding no setup: a leitura RELATIVA (percentil/fundingAvg) e a ancora ABSOLUTA (carry
    // anualizado, passado como carryScore) sao lentes complementares combinadas com clamp conjunto
    // (+/-7) DENTRO de calculateDerivativeDetailContribution — por isso o carry nao e somado de novo
    // aqui. O fundingScore do premium so e subtraido quando o detail realmente pontuou funding; numa
    // pane parcial do endpoint fundingRate, o funding ao vivo do premium volta a valer.
    var derivatives = clamp(Math.round((a.derivScore - (detailFundingEligible ? (a.fundingScore || 0) : 0)) * 1.25 + derivativeDetail), -12, 12);
    var scoreChain = eligibleDataset(a.coinMetrics) ? a.chainScore : (Number.isFinite(a.nativeChainScore) ? a.nativeChainScore : 0);
    var chain = clamp(Math.round(scoreChain + external.defi * 0.45 + external.asset * 0.2), -10, 10);
    var etfFlow = latestEtfFlow(a.institutional || state.institutional);
    var etfAdjustment = Number.isFinite(etfFlow) ? clamp(Math.round(etfFlow / 100000000), -3, 3) : 0;
    var macro = clamp(Math.round(news.score * 0.36 + external.sentiment * 0.45 + external.global * 0.45 + etfAdjustment), -10, 10);
    var historyCandidate = a.history || state.historyProfiles[state.symbol] || null;
    var history = historyFresh(historyCandidate) ? historyCandidate : null;
    var historyScore = history ? clamp(Math.round(history.score), -12, 12) : 0;
    var setup = setupQuality(a);
    var risk = 0;
    var volumeRatio = Number.isFinite(a.avgVol) && a.avgVol ? a.lastVol / a.avgVol : 1;
    if (Number.isFinite(a.bb.latestUpper) && a.close > a.bb.latestUpper && a.rsi14 >= 68) risk -= 8;
    // Mirror of the overbought fade: an oversold stretch (below the lower band, RSI extreme) is
    // bounce risk to shorts, so it favors the long side (+8). RSI 32 = 50-18 mirrors the 68 = 50+18
    // overbought trigger; magnitude +8 mirrors the -8 penalty. This is the mean-reversion overlay;
    // the momentum read of a low RSI stays in momScore (technical bucket), a separate lens.
    if (Number.isFinite(a.bb.latestLower) && a.close < a.bb.latestLower && a.rsi14 <= 32) risk += 8;
    // Sweeps score once, in smart money -> flow (a sweep is a liquidity/flow event); the pure sweep
    // terms here re-counted the same boolean into risk. The sweep+liquidation JOINT terms below stay:
    // they also require a liquidation skew, a distinct confirmation signal.
    var climax = a.volumeClimax && a.volumeClimax.climax ? a.volumeClimax : null;
    if (climax) {
      // Volume climatico com fecho no terco oposto e exaustao: warning contra a tendencia,
      // nunca o antigo bonus pro-tendencia por "volume alto".
      risk += climax.direction === 'exhaustion-top' ? -5 : 5;
    } else {
      if (volumeRatio > 1.45 && a.deltaSum > 0) risk += 4;
      if (volumeRatio > 1.45 && a.deltaSum < 0) risk -= 4;
    }
    var liq = liquidationSummary();
    if (liq.total > 0 && liq.longValue > liq.shortValue * 2 && a.sweepDown) risk += 2;
    if (liq.total > 0 && liq.shortValue > liq.longValue * 2 && a.sweepUp) risk -= 2;
    risk = clamp(risk, -14, 14);
    var total = clamp(Math.round(technical + multi.score + flow + derivatives + chain + macro + historyScore + risk), -100, 100);
    var quality = dataQuality(a);
    // Gate HTF: 1d e 1w precisam existir e nao podem estar ambos contra a direcao da entrada.
    var htf1d = multi.rows ? multi.rows.find(function (row) { return row.interval === '1d'; }) : null;
    var htf1w = multi.rows ? multi.rows.find(function (row) { return row.interval === '1w'; }) : null;
    var htfGateAvailable = !!(htf1d && htf1w);
    var htfVetoLong = htfGateAvailable && htf1d.bias === 'Baixa' && htf1w.bias === 'Baixa';
    var htfVetoShort = htfGateAvailable && htf1d.bias === 'Alta' && htf1w.bias === 'Alta';
    var trapVeto = activeTrapVeto(a);
    // A mesma ladder pura e testada governa a UI. Todo nivel de entrada, inclusive +/-42, exige
    // que 1d e 1w estejam presentes; assim a tela nunca diverge do motor de sinais.
    var decisionResult = AnalyticsCore.setupDecision({ total: total, quality: quality, multiScore: multi.score, multiBias: multi.bias, alignment: multi.alignment, htfAvailable: htfGateAvailable, htfVetoLong: htfVetoLong, htfVetoShort: htfVetoShort, trapVeto: trapVeto, trapBarsLeft: trapVetoBarsLeft(a) });
    var decision = decisionResult.decision;
    var tone = decisionResult.tone;
    var reasons = [
      { tone: technical > 7 ? 'good' : technical < -7 ? 'bad' : 'neutral', text: technical > 7 ? 'Tecnica do timeframe selecionado favorece compra.' : technical < -7 ? 'Tecnica do timeframe selecionado pesa contra.' : 'Tecnica local mista: falta rompimento ou reteste confirmado.' },
      { tone: multi.score > 5 ? 'good' : multi.score < -5 ? 'bad' : 'neutral', text: multi.score > 5 ? 'Demais timeframes confirmam tendencia de alta de forma independente.' : multi.score < -5 ? 'Demais timeframes divergem ou mantem tendencia de baixa.' : 'Multi-timeframe ainda sem alinhamento direcional forte.' },
      { tone: flow > 7 ? 'good' : flow < -7 ? 'bad' : 'neutral', text: flow > 7 ? 'Fluxo confirma: delta taker e livro mostram demanda no curto prazo.' : flow < -7 ? 'Fluxo pressiona: agressao vendedora ou ask dominando o livro.' : 'Fluxo equilibrado: livro e volume ainda nao confirmam direcao.' },
      { tone: derivatives > 4 ? 'good' : derivatives < -4 ? 'bad' : 'neutral', text: derivatives > 4 ? 'Derivativos dao apoio leve, sem excesso evidente no funding.' : derivatives < -4 ? 'Derivativos pedem cautela: funding/basis podem indicar trade lotado.' : 'Derivativos neutros, sem vantagem quantitativa clara.' },
      { tone: macro > 3 ? 'good' : macro < -3 ? 'bad' : 'neutral', text: macro > 3 ? 'Noticias e macro favorecem risco.' : macro < -3 ? 'Noticias e macro elevam risco negativo.' : 'Noticias e macro sem impulso dominante.' },
      { tone: historyScore > 3 ? 'good' : historyScore < -3 ? 'bad' : 'neutral', text: historyScore > 3 ? 'Ocorrencias historicas semelhantes tiveram expectativa positiva.' : historyScore < -3 ? 'Ocorrencias historicas semelhantes tiveram expectativa negativa.' : 'Historico semelhante neutro ou ainda com pouca amostra.' }
    ];
    // Eventos discretos (trap/climax) entram na FRENTE das razoes continuas: sao eles que mudam a
    // decisao (veto/warning) e nao podem ser cortados pelo slice final.
    if (climax) {
      reasons.unshift({ tone: 'bad', text: 'Climax de volume com fecho no terco oposto: exaustao provavel da perna ' + (climax.direction === 'exhaustion-top' ? 'de alta' : 'de baixa') + '; nao tratar volume como confirmacao.' });
    }
    if (a.trap && a.trap.trap) {
      reasons.unshift({ tone: a.trap.score > 0 ? 'good' : 'bad', text: (a.trap.trap === 'bull' ? 'Bear trap: sweep de minima revertido com flip de delta' : 'Bull trap: sweep de maxima rejeitado com flip de delta') + (a.trap.confirmed ? ' e confirmacao de OI/liquidacao' : '') + '; entradas ' + (a.trap.vetoDirection === 'short' ? 'vendidas' : 'compradas') + ' vetadas por ' + a.trap.vetoBars + ' barras.' });
    }
    if (risk !== 0) {
      reasons.push({ tone: risk > 0 ? 'good' : 'bad', text: risk > 0 ? 'Ajuste de risco favorece: sobrevenda esticada (risco de repique), exaustao de fundo, volume comprador ou liquidacoes de longs absorvidas.' : 'Ajuste de risco pesa contra: sobrecompra esticada, exaustao de topo, volume vendedor ou liquidacoes de shorts no sweep de maxima.' });
    }
    var mtfCoverage = AnalyticsCore.timeframeCoverage(multi.rows, MTF_INTERVALS);
    var macroStatus = state.newsMode !== 'auto' ? 'manual'
      : (news.items.length || fearGreedEligible(state.external) || macroSourceAvailable(state.external.macro) || activeTradFiAssets(state.external.tradfi).length || marketMacroContextAvailable(state.external)) ? 'fresh' : 'missing';
    var components = [
      { name: 'Tecnica', ruleId: 'setup.technical.v1', score: technical, max: 20, status: 'fresh', scope: 'symbol', isProxy: false, sources: ['binance-spot-klines'], reason: 'trendScore*0.32 + momScore*0.42 do timeframe selecionado' },
      { name: 'Multi-TF', ruleId: 'setup.mtf.v2', score: multi.score, max: 16, status: mtfCoverage.available === mtfCoverage.expected ? 'fresh' : mtfCoverage.available ? 'partial' : 'missing', scope: 'symbol', isProxy: false, sources: ['binance-spot-klines'], reason: 'Confirmacao INDEPENDENTE (TF do grafico excluido) + gate 1d/1w; cobertura ' + mtfCoverage.available + '/' + mtfCoverage.expected + ' timeframes canonicos' },
      { name: 'Smart/fluxo', ruleId: 'setup.flow.v1', score: flow, max: 18, status: a.flowAvailable ? 'fresh' : 'missing', scope: 'symbol', isProxy: false, sources: ['binance-spot-klines', 'binance-spot-depth'], reason: 'flowScore*0.48 + book*0.35 + smart money*0.55' },
      { name: 'Derivativos', ruleId: 'setup.derivatives.v1', score: derivatives, max: 12, status: datasetStatus(a.derivativeDetail) || 'missing', scope: 'symbol', isProxy: false, sources: ['binance-futures', 'deribit-options'], reason: 'derivScore*1.25 + detalhe de OI/funding/taker/opcoes elegiveis' },
      { name: 'On-chain/fund.', ruleId: 'setup.chain.v1', score: chain, max: 10, status: eligibleDataset(a.coinMetrics) || (a.mempoolContext && a.mempoolContext.eligibleForScore) ? 'fresh' : a.coinMetrics ? datasetStatus(a.coinMetrics) : 'missing', scope: 'symbol', isProxy: !!(a.mempoolContext && a.mempoolContext.isProxy), sources: ['coinmetrics-community', 'defillama', 'mempool-space'], reason: 'chainScore + defi*0.45 + asset*0.2' },
      { name: 'Noticias/macro', ruleId: 'setup.macro.v1', score: macro, max: 10, status: macroStatus, scope: 'market', isProxy: false, sources: state.newsMode !== 'auto' ? ['manual-user-session', 'alternative-me', 'us-treasury-yields', 'cboe-vix', 'cryptoetf-public'] : ['rss-news', 'alternative-me', 'us-treasury-yields', 'cboe-vix', 'cryptoetf-public'], reason: newsOverrideAuditLabel() + 'news*0.36 + sentimento*0.45 + global*0.45 + ETF' },
      { name: 'Historico', ruleId: 'setup.history.v1', score: historyScore, max: 12, status: history ? 'fresh' : historyCandidate ? 'stale' : 'missing', scope: 'symbol', isProxy: false, sources: ['binance-daily-history'], reason: history ? (history.samples || 0) + ' amostras de regimes semelhantes' : 'sem perfil historico fresco' },
      { name: 'Risco', ruleId: 'setup.risk.v2', score: risk, max: 14, status: 'fresh', scope: 'symbol', isProxy: false, sources: ['binance-spot-klines', 'binance-liquidations'], reason: 'Esticamento de bandas, climax de volume, volume x delta e sweeps confirmados por liquidacoes' }
    ];
    components.forEach(function (component) { component.contribution = component.score; });
    var reconciledTotal = components.reduce(function (sum, component) { return sum + component.score; }, 0);
    return {
      modelId: AnalyticsCore.RULESET.modelId,
      modelVersion: MODEL_VERSION,
      rulesetHash: RULESET_HASH,
      scoreType: 'setup',
      symbol: state.symbol,
      interval: state.interval,
      total: total,
      rawTotal: reconciledTotal,
      calculatedAt: Date.now(),
      inputSnapshotId: a.snapshot ? a.snapshot.inputSnapshotId : null,
      lastClosedCandleTime: a.signalCandle ? a.signalCandle.closeTime : null,
      dataStatus: quality < 40 ? 'insufficient' : quality >= 85 ? 'complete' : 'partial',
      decision: decision,
      tone: tone,
      news: news,
      external: external,
      setup: setup,
      smart: smart,
      quality: quality,
      dataConfidence: quality,
      history: history,
      multi: multi,
      gates: { htfAvailable: htfGateAvailable, htfVetoLong: htfVetoLong, htfVetoShort: htfVetoShort, trapVeto: trapVeto },
      trap: a.trap || null,
      carry: carry,
      reasons: reasons.slice(0, 8),
      components: components
    };
  }
  function signed(n) { return (n > 0 ? '+' : '') + String(n); }
  function renderConfluence(a) {
    var c = confluenceFor(a);
    var entry = $('entryDecision');
    if (entry) {
      var card = entry.closest('.entry-card');
      if (card) card.className = 'entry-card ' + c.tone;
    }
    text('confluenceSummary', 'Setup Score preview ' + MODEL_VERSION + ' para ' + state.symbol + ': tecnica em candles fechados combinada com fluxo e contexto do snapshot atual.');
    text('entryDecision', c.decision);
    text('entryScoreLine', 'Setup Score preview ' + signed(c.total) + ' / 100 | Data Confidence preview ' + c.dataConfidence + '%');
    var bars = $('confluenceBars');
    if (bars) {
      bars.innerHTML = c.components.map(function (item) {
        var pct = clamp(Math.abs(item.score) / item.max * 50, 0, 50);
        var left = item.score >= 0 ? 50 : 50 - pct;
        var cls = item.score > 0 ? 'positive' : item.score < 0 ? 'negative' : '';
        return '<div class="score-row"><div class="score-row-header"><span>' + escapeHTML(item.name) + '</span><strong>' + signed(item.score) + '</strong></div><div class="score-track"><span class="score-fill ' + cls + '" style="left:' + left.toFixed(2) + '%;width:' + pct.toFixed(2) + '%"></span></div></div>';
      }).join('');
    }
    var reasons = $('confluenceReasons');
    if (reasons) {
      reasons.innerHTML = c.reasons.map(function (item) {
        var dot = item.tone === 'good' ? 'good' : item.tone === 'bad' ? 'bad' : '';
        return '<div class="reason-item"><span class="reason-dot ' + dot + '"></span><span>' + escapeHTML(item.text) + '</span></div>';
      }).join('');
    }
    text('newsScoreLine', signed(c.news.score) + ' | ' + c.news.label);
    var newsList = $('newsList');
    if (newsList) {
      var rows = c.news.items.length ? c.news.items.map(function (x) { return x.item; }) : freshNewsItems().slice(0, 5);
      newsList.innerHTML = rows.length ? rows.slice(0, 5).map(function (item) {
        var time = item.published ? AnalyticsCore.formatDisplayTimestamp(item.published, DISPLAY_TIME_ZONE, 'short') : '';
        return '<div class="news-item"><a href="' + escapeHTML(safeURL(item.url)) + '" target="_blank" rel="noreferrer">' + escapeHTML(item.title || 'Sem titulo') + '</a><small>' + escapeHTML(item.source || 'Fonte') + (time ? ' | ' + escapeHTML(time) : '') + '</small></div>';
      }).join('') : '<div class="news-item"><small>Sem noticias carregadas agora. Use o botao para tentar atualizar.</small></div>';
    }
    var overrideTime = timestampMs(state.newsOverrideAt);
    var status = state.newsMode !== 'auto'
      ? 'Noticias/macro: override ' + c.news.label.replace(/^manual /, '') + ' por ' + (state.newsOverrideAuthor || 'autor nao registrado') + (Number.isFinite(overrideTime) ? ' em ' + new Date(overrideTime).toLocaleString('pt-BR') : '') + '. Motivo: ' + (state.newsOverrideReason || 'nao registrado') + '.'
      : state.newsFetchedAt
        ? 'Noticias/macro: auto a cada 5 min. Ultima leitura ' + AnalyticsCore.formatDisplayTimestamp(state.newsFetchedAt, DISPLAY_TIME_ZONE, 'time') + ' (' + DISPLAY_TIME_ZONE + ').'
        : 'Noticias/macro: tentando carregar fontes externas.';
    text('newsStatus', status);
  }
  function renderScoreExplanation(a, c) {
    var rows = $('explanationRows');
    if (!rows || !c) return;
    var snapshot = a.snapshot || {};
    text('explanationEnvelope', 'Modelo ' + (c.modelId || '--') + ' v' + c.modelVersion + ' | regras ' + (c.rulesetHash || '--') + ' | fontes ' + AnalyticsCore.SOURCE_REGISTRY_VERSION + ' | snapshot ' + (snapshot.inputSnapshotId ? snapshot.inputSnapshotId.slice(0, 60) + '...' : '--') + ' | candle fechado ' + (c.lastClosedCandleTime ? new Date(c.lastClosedCandleTime).toLocaleString('pt-BR') : '--') + ' | calculado ' + new Date(c.calculatedAt).toLocaleTimeString('pt-BR') + ' | dados ' + c.dataStatus);
    rows.innerHTML = c.components.map(function (component) {
      var contribClass = component.contribution > 0 ? 'contrib-pos' : component.contribution < 0 ? 'contrib-neg' : '';
      var sourceCells = (component.sources || []).map(function (sourceId) { return '<span title="' + escapeHTML(sourceReferenceTitle(sourceId)) + '">' + escapeHTML(sourceReference(sourceId)) + '</span>'; }).join('<br>');
      return '<tr><td>' + escapeHTML(component.name) + '</td><td>' + escapeHTML(component.ruleId || '--') + '</td><td class="' + contribClass + '">' + signed(component.contribution) + '</td><td>&plusmn;' + component.max + '</td><td class="status-' + escapeHTML(component.status || 'fresh') + '">' + escapeHTML(component.status || 'fresh') + (component.isProxy ? ' (proxy)' : '') + '</td><td>' + escapeHTML(component.scope || '--') + '</td><td>' + sourceCells + '</td><td>' + escapeHTML(component.reason || '') + '</td></tr>';
    }).join('');
    var sum = c.components.reduce(function (total, component) { return total + component.contribution; }, 0);
    text('explanationReconciliation', 'Soma das contribuicoes: ' + signed(sum) + ' | Setup Score exibido: ' + signed(c.total) + (sum === c.total ? ' (reconciliado)' : ' (diferenca apenas pelo clamp de -100 a +100)') + ' | Data Confidence ' + c.dataConfidence + '% mede cobertura de dados, nao chance de acerto.');
  }
  function renderWrittenAnalysis(a) {
    var c = confluenceFor(a);
    renderScoreExplanation(a, c);
    var market = eligibleDataset(state.external.marketData) ? selectedMarket(state.symbol) : null;
    var d = scoreableDerivativeDetail(a.derivativeDetail);
    var volumeRatio = Number.isFinite(a.avgVol) && a.avgVol ? a.lastVol / a.avgVol : NaN;
    var quality = setupQuality(a);
    var technicalTone = c.components[0].score > 10 ? 'favoravel' : c.components[0].score < -10 ? 'desfavoravel' : 'mista';
    var flowTone = c.components[2].score > 7 ? 'confirmando compra' : c.components[2].score < -7 ? 'pressionando venda' : 'sem confirmacao forte';
    var derivativeTone = Number.isFinite(d.oiChangePct) ? (d.oiChangePct > 3 ? 'OI expandindo' : d.oiChangePct < -3 ? 'OI contraindo' : 'OI estavel') : 'OI historico indisponivel';
    var headline = (ASSET_NAMES[state.symbol] || state.symbol) + ': ' + c.decision + ' com Setup Score ' + signed(c.total);
    var detectedPatterns = (a.patterns || []).slice(0, 3).map(function (pattern) { return pattern.name; });
    var tradePlan = buildTradePlan(a);
    var operationalPlan = tradePlan.side === 'Aguardar' ? tradePlan.rationale + ' ' : 'Plano ' + tradePlan.side + ': ' + tradePlan.levels.map(function (level) { return level.label + ' ' + level.value; }).join(', ') + '. ';
    var optionData = a.options || state.options;
    var optionPutCall = AnalyticsCore.toFiniteNumber(optionData && optionData.market && optionData.market.putCallOi);
    var optionAtmIv = AnalyticsCore.toFiniteNumber(optionData && optionData.nearest && optionData.nearest.atmIv);
    var optionSentence = optionData && optionData.market && (optionData.isProxy || eligibleDataset(optionData)) ? (optionData.isProxy ? 'Como proxy BTC apenas informativo e fora do Setup Score, ' : 'Nas opcoes nativas ' + optionData.currency + ', ') + 'put/call OI ' + (optionPutCall !== null ? 'em ' + num(optionPutCall, 2) + 'x' : 'indisponivel') + (AnalyticsCore.toFiniteNumber(optionData.dvol && optionData.dvol.latest) !== null ? ', DVOL em ' + num(finiteNumber(optionData.dvol.latest), 1) : ', sem indice DVOL para esta moeda') + ' e IV ATM ' + (optionAtmIv !== null ? 'em ' + num(optionAtmIv, 1) + '%' : 'indisponivel') + '. ' : '';
    var exchangeFlow = eligibleDataset(a.coinMetrics) && a.coinMetrics.exchangeFlow, exchangeSentence = exchangeFlow && Number.isFinite(exchangeFlow.netflow7d) ? 'O netflow agregado de exchanges em ' + exchangeFlow.flowCoverageDays + ' de ' + exchangeFlow.flowWindowDays + ' dias cobertos e ' + compactMoney(exchangeFlow.netflow7d) + ' (positivo significa entrada liquida em exchanges). ' : '';
    var liqSummary = liquidationSummary(), liquidationSentence = liqSummary.total ? 'Nos ultimos 15 minutos, o stream observou ' + compactMoney(liqSummary.longValue) + ' em longs e ' + compactMoney(liqSummary.shortValue) + ' em shorts liquidados. ' : '';
    var etfValue = latestEtfFlow(a.institutional || state.institutional), etfSentence = Number.isFinite(etfValue) ? 'O ultimo ETF net flow disponivel e ' + compactMoney(etfValue) + '. ' : '';
    var vwapNarrative = Number.isFinite(a.vwap) ? (a.close > a.vwap ? 'acima' : 'abaixo') + ' do VWAP' : 'com VWAP indisponivel';
    var macdNarrative = Number.isFinite(a.macd.hist) ? (a.macd.hist >= 0 ? 'positivo' : 'negativo') : 'indisponivel';
    var body = 'No timeframe ' + intervalLabel(state.interval) + ', a leitura tecnica esta ' + technicalTone + ': estrutura ' + a.structure + ', preco ' + vwapNarrative + ', RSI em ' + num(a.rsi14, 1) + ', MACD ' + macdNarrative + ', ADX ' + num(a.adx.adx, 1) + ' e Supertrend em ' + a.supertrend.trend + '. ' +
      'A confirmacao multi-timeframe esta em ' + c.multi.bias + ', com alinhamento de ' + Math.round(c.multi.alignment * 100) + '% e score ' + signed(c.multi.score) + '. ' +
      'O fluxo esta ' + flowTone + ', com delta taker de ' + num(a.deltaSum, 3) + ' ' + baseAsset(state.symbol) + ', CMF ' + num(a.cmf20, 2) + (Number.isFinite(volumeRatio) ? ' e volume em ' + num(volumeRatio, 2) + 'x a media recente. ' : '. ') +
      'Na leitura smart money, ' + c.smart.liquidity.toLowerCase() + ', ' + c.smart.oiPhase.toLowerCase() + ' e ' + c.smart.imbalance.toLowerCase() + '. ' +
      'A qualidade do setup soma ' + signed(quality.total) + ', com spread de ' + num(a.spreadBps, 2) + ' bps e slippage estimado de compra em ' + num(a.buySlipBps, 2) + ' bps. ' +
      'Nos derivativos, funding atual ' + (Number.isFinite(a.funding) ? percent(a.funding * 100, 4) : '--') + ', ' + derivativeTone + (Number.isFinite(d.longShortRatio) ? ' e long/short em ' + num(d.longShortRatio, 2) + 'x. ' : '. ') +
      optionSentence + exchangeSentence + liquidationSentence + etfSentence +
      'O contexto externo soma ' + signed(c.external.total) + ': sentimento ' + (eligibleDataset(c.external) && fearGreedEligible(state.external) ? state.external.fearGreed.value + ' ' + state.external.fearGreed.label : 'indisponivel ou stale') + ', ativo ' + signed(c.external.asset) + ', global ' + signed(c.external.global) + ' e DeFi ' + signed(c.external.defi) + '. ' +
      (c.history ? 'No historico diario completo, ' + c.history.samples + ' ocorrencias semelhantes tiveram acerto de 7 dias em ' + num(c.history.winRate7, 1) + '% e retorno mediano de ' + percent(c.history.median7, 2) + '. ' : 'O historico completo ainda esta sendo carregado. ') +
      (detectedPatterns.length ? 'Padroes/eventos em candles fechados: ' + detectedPatterns.join(', ') + '; continuam sendo hipoteses operacionais. ' : 'Nenhum padrao grafico objetivo foi encontrado nos candles fechados. ') +
      'Operacionalmente, a zona de alta fica acima de ' + (a.resistances[0] ? money(a.resistances[0]) : '--') + '; perda de ' + (a.supports[0] ? money(a.supports[0]) : '--') + ' enfraquece o setup. ' +
      operationalPlan +
      (market ? 'No dado fundamental de mercado, rank #' + (Number.isFinite(finiteNumber(market.market_cap_rank)) ? finiteNumber(market.market_cap_rank) : '--') + ', market cap ' + compactUsd(finiteNumber(market.market_cap)) + ', volume 24h ' + compactUsd(finiteNumber(market.total_volume)) + ' e distancia do ATH ' + percent(finiteNumber(market.ath_change_percentage), 1) + '. ' : '') +
      'Isso e uma leitura analitica do painel, nao uma recomendacao automatica de compra ou venda.';
    text('analysisHeadline', headline);
    text('analysisBody', body);
    text('analysisQuality', 'Data Confidence preview ' + c.dataConfidence + '% | modelo ' + MODEL_VERSION + ' | tecnica em candles fechados');
    var checks = [
      { cls: c.components[0].score > 10 ? 'good' : c.components[0].score < -10 ? 'bad' : '', label: 'Tecnica', value: signed(c.components[0].score), text: 'Medias, RSI, MACD, VWAP e estrutura.' },
      { cls: c.components[1].score > 7 ? 'good' : c.components[1].score < -7 ? 'bad' : '', label: 'Multi-TF', value: signed(c.components[1].score), text: '15m, 1h, 4h, 1d e 1w.' },
      { cls: c.components[2].score > 5 ? 'good' : c.components[2].score < -5 ? 'bad' : '', label: 'Smart/fluxo', value: signed(c.components[2].score), text: 'Sweeps, delta, CMF, book e deslocamento.' },
      { cls: c.components[3].score > 3 ? 'good' : c.components[3].score < -3 ? 'bad' : '', label: 'Derivativos', value: signed(c.components[3].score), text: 'Funding, basis, OI e long/short.' },
      { cls: c.components[5].score > 3 ? 'good' : c.components[5].score < -3 ? 'bad' : '', label: 'Noticias/macro', value: signed(c.components[5].score), text: 'RSS agregado, sentimento e mercado global.' },
      { cls: c.components[6].score > 3 ? 'good' : c.components[6].score < -3 ? 'bad' : '', label: 'Historico', value: signed(c.components[6].score), text: 'Ocorrencias de regime semelhantes.' }
    ];
    var list = $('analysisChecklist');
    if (list) {
      list.innerHTML = checks.map(function (item) {
        return '<div class="check-row ' + item.cls + '"><div><strong>' + escapeHTML(item.label) + '</strong><br><span>' + escapeHTML(item.text) + '</span></div><span>' + escapeHTML(item.value) + '</span></div>';
      }).join('');
    }
  }
  function value(result) { return result && result.status === 'fulfilled' ? result.value : null; }
  function tickerMapFromRows(rows) {
    var map = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (row && ASSETS.indexOf(row.symbol) !== -1) map[row.symbol] = row;
    });
    return map;
  }
  function premiumMapFromRows(rows) {
    var map = Object.create(null);
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      if (row && ASSETS.indexOf(row.symbol) !== -1) map[row.symbol] = row;
    });
    return map;
  }
  function reapplyExternalContext() {
    state.board.forEach(function (item) {
      if (item && item.analysis) buildRadarScore(item.symbol, applyExternalToAnalysis(item.symbol, item.analysis));
    });
    if (state.analysis && analysisMatchesSelection(state.analysis)) {
      applyExternalToAnalysis(state.analysis.snapshot ? state.analysis.snapshot.symbol : state.symbol, state.analysis);
      stampAnalysisSnapshot(state.analysis, 'external-news');
      renderExternalContext(state.analysis);
      renderConfluence(state.analysis);
      renderWrittenAnalysis(state.analysis);
      renderSetupQuality(state.analysis);
      renderMacroFlow(state.analysis);
      updateScore(state.analysis);
    }
    renderBoard();
    renderSourceHealth(state.external || {});
  }
  function refreshContextIfNeeded(force) {
    if (state.contextRefreshing) return state.contextPromise || Promise.resolve(state.external);
    var lastNewsCycle = Math.max(state.newsFetchedAt, state.newsAttemptedAt);
    var needsNews = !!force || !lastNewsCycle || Date.now() - lastNewsCycle >= NEWS_REFRESH_MS;
    var lastExternalCycle = Math.max(state.externalFetchedAt, state.externalAttemptedAt);
    var needsExternal = !!force || !lastExternalCycle || Date.now() - lastExternalCycle >= EXTERNAL_REFRESH_MS;
    if (!needsNews && !needsExternal) return Promise.resolve(state.external);
    state.contextRefreshing = true;
    if (needsNews) text('newsStatus', 'Atualizando noticias e macro...');
    if (needsExternal) text('externalStatus', 'Atualizando contexto externo...');
    state.contextPromise = Promise.allSettled([
      needsNews ? loadNewsIfNeeded(true) : Promise.resolve(),
      needsExternal ? loadExternalContext(true) : Promise.resolve(state.external)
    ]).then(function (rows) {
      var external = value(rows[1]);
      if (external) state.external = external;
      reapplyExternalContext();
    }).catch(function () {
      if (needsExternal) text('externalStatus', 'Contexto externo indisponivel agora.');
    }).finally(function () {
      state.contextRefreshing = false;
      state.contextPromise = null;
    });
    return state.contextPromise;
  }
  function refreshChainIfNeeded(force) {
    if (state.chainRefreshing) return;
    var needsChain = !!force || !state.chainFetchedAt || Date.now() - state.chainFetchedAt >= CHAIN_REFRESH_MS;
    if (!needsChain) return;
    state.chainRefreshing = true;
    loadChain().then(function (chain) {
      state.chain = chain || {};
      state.chainFetchedAt = Date.now();
      if (state.analysis && analysisMatchesSelection(state.analysis)) updateChain(state.chain);
      renderSourceHealth(state.external || {});
    }).catch(function () {
      renderSourceHealth(state.external || {});
    }).finally(function () {
      state.chainRefreshing = false;
    });
  }
  function refreshBoardIfNeeded(force) {
    var fastInterval = ['1s', '1m', '3m', '5m'].indexOf(state.interval) !== -1;
    var boardTtl = fastInterval ? Math.min(BOARD_REFRESH_MS, 30000) : BOARD_REFRESH_MS;
    var needsBoard = !!force || !state.board.length || state.boardInterval !== state.interval || Date.now() - state.boardFetchedAt >= boardTtl;
    if (!needsBoard) return;
    if (state.boardRefreshing) {
      state.boardPendingRefresh = true;
      renderBoard();
      return;
    }
    state.boardRefreshing = true;
    var intervalChoice = state.interval;
    (async function () {
      try {
        var symbolsParam = encodeURIComponent(JSON.stringify(ASSETS));
        var baseResults = await Promise.allSettled([
          fetchSpotJSON('/api/v3/ticker/24hr?symbols=' + symbolsParam, 10000, 'Binance spot'),
          fetchJSON('https://fapi.binance.com/fapi/v1/premiumIndex', 10000, 'Binance futuros')
        ]);
        var tickerMap = tickerMapFromRows(value(baseResults[0]));
        var premiumMap = premiumMapFromRows(value(baseResults[1]));
        var boardResults = await mapSettledPool(ASSETS, 4, function (symbol) { return loadBoardAsset(symbol, tickerMap[symbol], premiumMap[symbol], intervalChoice); });
        if (intervalChoice !== state.interval) return;
        state.board = boardResults.map(value).filter(Boolean);
        state.boardFetchedAt = Date.now();
        state.boardInterval = intervalChoice;
        renderBoard();
      } catch (error) {
        text('boardSummary', 'Radar multiativos indisponivel agora: ' + error.message);
      } finally {
        state.boardRefreshing = false;
        if (state.boardPendingRefresh) {
          state.boardPendingRefresh = false;
          setTimeout(function () { refreshBoardIfNeeded(true); }, 0);
        }
      }
    })();
  }
  async function mapSettledPool(items, concurrency, mapper) {
    var results = new Array(items.length);
    var cursor = 0;
    async function worker() {
      while (cursor < items.length) {
        var index = cursor++;
        try { results[index] = { status: 'fulfilled', value: await mapper(items[index], index) }; }
        catch (error) { results[index] = { status: 'rejected', reason: error }; }
      }
    }
    var workers = [];
    var count = Math.max(1, Math.min(concurrency || 1, items.length));
    for (var i = 0; i < count; i++) workers.push(worker());
    await Promise.all(workers);
    return results;
  }
  async function refresh(force) {
    if (state.refreshing) {
      if (force) {
        state.pendingRefresh = true;
        refreshGate.invalidate();
      }
      return;
    }
    var requestedSymbol = normalizeSymbol($('symbolSelect').value);
    var requestedInterval = $('intervalSelect').value;
    var requestId = refreshGate.begin();
    state.refreshing = true;
    state.symbol = requestedSymbol;
    $('symbolSelect').value = state.symbol;
    state.interval = requestedInterval;
    if (ASSETS.indexOf(state.symbol) === -1) ASSETS.unshift(state.symbol);
    refreshChainIfNeeded(false);
    var contextPromise = refreshContextIfNeeded(false);
    refreshBoardIfNeeded(!!force);
    text('statusText', 'Atualizando ativo selecionado em tempo real...');
    try {
      var applied = await refreshSelected(null, null, state.chain || {}, !!force, requestedSymbol, requestedInterval, requestId, contextPromise);
      if (applied && refreshGate.isCurrent(requestId)) text('statusText', 'Modelo ' + MODEL_VERSION + ' | snapshot: ' + requestedSymbol + ' ' + intervalLabel(requestedInterval) + ' | preco ao vivo ' + Math.round(REFRESH_MS / 1000) + 's');
    } catch (error) {
      if (refreshGate.isCurrent(requestId)) text('statusText', 'Falha ao atualizar: ' + error.message);
    } finally {
      state.refreshing = false;
      if (state.pendingRefresh) {
        state.pendingRefresh = false;
        refresh(true);
      }
    }
  }
  function normalizeSymbol(value) {
    var clean = String(value || 'BTCUSDT').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!clean.endsWith('USDT')) clean += 'USDT';
    return /^[A-Z0-9]{1,15}USDT$/.test(clean) ? clean : 'BTCUSDT';
  }
  var BOARD_FAIL_SKIP = 5, BOARD_FAIL_RETEST = 25;
  async function loadBoardAsset(symbol, ticker, premium, intervalChoice) {
    // Track consecutive failures per symbol so a delisted pair stops silently hammering the API and
    // flapping the shared 'Binance spot' health; re-test periodically in case it was transient.
    var fails = state.boardFailures[symbol] || 0;
    var isRetest = fails >= BOARD_FAIL_RETEST;
    if (isRetest) fails = 0;
    if (fails >= BOARD_FAIL_SKIP) { state.boardFailures[symbol] = fails + 1; return null; }
    try {
      var rows = await fetchSpotJSON('/api/v3/klines?symbol=' + encodeURIComponent(symbol) + '&interval=' + (intervalChoice || state.interval) + '&limit=260', 10000, 'Binance spot');
      var candles = parseKlines(rows), closedCandles = selectClosedCandles(candles);
      if (!closedCandles.length) throw new Error('sem candles fechados');
      var analysis = applyExternalToAnalysis(symbol, buildCoreAnalysis(closedCandles, ticker, premium, { interval: intervalChoice || state.interval }));
      analysis.signalCandle = last(closedCandles);
      analysis.liveCandle = last(candles) || analysis.signalCandle;
      analysis.liveClose = analysis.liveCandle.close;
      analysis.hasOpenCandle = !AnalyticsCore.isCandleClosed(analysis.liveCandle, Date.now());
      attachHistory(analysis, state.historyProfiles[symbol]);
      buildRadarScore(symbol, analysis);
      state.boardFailures[symbol] = 0;
      return { symbol: symbol, interval: intervalChoice || state.interval, ticker: ticker, premium: premium, candles: candles, analysis: analysis };
    } catch (error) {
      // A failed retest jumps straight back into the skip band: one probe per retest window,
      // not a fresh ramp of SKIP real fetches.
      state.boardFailures[symbol] = isRetest ? BOARD_FAIL_SKIP : fails + 1;
      return null;
    }
  }
  function stalledBoardSymbols() {
    return Object.keys(state.boardFailures).filter(function (symbol) { return (state.boardFailures[symbol] || 0) >= BOARD_FAIL_SKIP; });
  }
  function futuresPeriod(interval) {
    if (['5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'].indexOf(interval) !== -1) return interval;
    if (interval === '8h') return '6h';
    if (interval === '3d' || interval === '1w' || interval === '1M') return '1d';
    return '5m';
  }
  function latestRowsObservedAt(groups) {
    var latestTime = NaN;
    (groups || []).forEach(function (rows) {
      (Array.isArray(rows) ? rows : []).forEach(function (row) {
        var raw = row && (row.timestamp || row.fundingTime || row.time || row.T);
        var time = timestampMs(raw);
        if (Number.isFinite(time) && time < 100000000000) time *= 1000;
        if (Number.isFinite(time) && (!Number.isFinite(latestTime) || time > latestTime)) latestTime = time;
      });
    });
    return latestTime;
  }
  function derivativesStaleAfter(period) {
    var unit = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720, '1d': 1440 }[period] || 5;
    return Math.max(DERIVATIVES_REFRESH_MS * 3, unit * 2 * 60 * 1000);
  }
  function normalizeDerivativeDetail(oiHist, fundingRows, longShortRows, takerRows, topAccountRows, topPositionRows, basisRows) {
    function orderedRows(rows) {
      var byTime = new Map();
      (Array.isArray(rows) ? rows : []).forEach(function (row) {
        var raw = row && (row.timestamp || row.fundingTime || row.time || row.T);
        var time = timestampMs(raw);
        if (!row || !Number.isFinite(time) || time < 0 || time > Date.now() + AnalyticsCore.RULESET.clockSkewToleranceMs) return;
        byTime.set(time, row);
      });
      return Array.from(byTime.entries()).sort(function (a, b) { return a[0] - b[0]; }).map(function (entry) { return entry[1]; });
    }
    oiHist = orderedRows(oiHist);
    fundingRows = orderedRows(fundingRows);
    longShortRows = orderedRows(longShortRows);
    takerRows = orderedRows(takerRows);
    topAccountRows = orderedRows(topAccountRows);
    topPositionRows = orderedRows(topPositionRows);
    basisRows = orderedRows(basisRows);
    // oiChangePct keeps its ORIGINAL 30-period window (the quadrant, trap flush threshold and
    // priceChangeOverWindow were all calibrated on it); the full 500-row series feeds ONLY the
    // percentile engine — mirroring how fundingAvg kept its 12-settlement meaning.
    var oiWindow = Array.isArray(oiHist) ? oiHist.slice(-30) : [];
    var oiChangePct = NaN, oiWindowStart = NaN, oiWindowEnd = NaN;
    if (oiWindow.length > 1) {
      var firstOi = finiteNumber(oiWindow[0].sumOpenInterestValue);
      var lastOi = finiteNumber(oiWindow[oiWindow.length - 1].sumOpenInterestValue);
      if (!Number.isFinite(firstOi)) firstOi = finiteNumber(oiWindow[0].sumOpenInterest);
      if (!Number.isFinite(lastOi)) lastOi = finiteNumber(oiWindow[oiWindow.length - 1].sumOpenInterest);
      oiChangePct = firstOi > 0 && lastOi > 0 ? ((lastOi - firstOi) / firstOi) * 100 : NaN;
      oiWindowStart = timestampMs(oiWindow[0].timestamp);
      oiWindowEnd = timestampMs(oiWindow[oiWindow.length - 1].timestamp);
    }
    var fundingAvg = NaN, fundingSeries = [];
    if (Array.isArray(fundingRows) && fundingRows.length) {
      fundingSeries = fundingRows.map(function (row) { return finiteNumber(row && row.fundingRate); }).filter(Number.isFinite);
      // fundingAvg keeps its original 12-settlement (~4d) meaning; the full series feeds percentiles.
      fundingAvg = avg(fundingSeries.slice(-12));
    }
    var latestLongShort = Array.isArray(longShortRows) && longShortRows.length ? longShortRows[longShortRows.length - 1] : null;
    var latestTaker = Array.isArray(takerRows) && takerRows.length ? takerRows[takerRows.length - 1] : null;
    var latestTopAccount = Array.isArray(topAccountRows) && topAccountRows.length ? topAccountRows[topAccountRows.length - 1] : null;
    var latestTopPosition = Array.isArray(topPositionRows) && topPositionRows.length ? topPositionRows[topPositionRows.length - 1] : null;
    var latestBasis = Array.isArray(basisRows) && basisRows.length ? basisRows[basisRows.length - 1] : null;
    var metricObservedAt = {
      oiChangePct: latestRowsObservedAt([oiHist]),
      fundingAvg: latestRowsObservedAt([fundingRows]),
      longShortRatio: latestRowsObservedAt([longShortRows]),
      takerRatio: latestRowsObservedAt([takerRows]),
      topAccountRatio: latestRowsObservedAt([topAccountRows]),
      topPositionRatio: latestRowsObservedAt([topPositionRows]),
      basisRate: latestRowsObservedAt([basisRows])
    };
    var observedTimes = Object.keys(metricObservedAt).map(function (key) { return metricObservedAt[key]; }).filter(Number.isFinite);
    // Percentile of the CURRENT reading within the asset's own fetched history. percentileRank
    // returns null under 30 samples, which downstream treats as "use the fixed threshold".
    var seriesOf = function (rows, selector) {
      return Array.isArray(rows) ? rows.map(selector).filter(Number.isFinite) : [];
    };
    var oiSeries = seriesOf(oiHist, function (row) { var value = finiteNumber(row && row.sumOpenInterestValue); if (!Number.isFinite(value)) value = finiteNumber(row && row.sumOpenInterest); return value > 0 ? value : NaN; });
    var longShortSeries = seriesOf(longShortRows, function (row) { var value = finiteNumber(row && row.longShortRatio); return value > 0 ? value : NaN; });
    var takerSeries = seriesOf(takerRows, function (row) { var value = finiteNumber(row && row.buySellRatio); return value > 0 ? value : NaN; });
    var topPositionSeries = seriesOf(topPositionRows, function (row) { var value = finiteNumber(row && row.longShortRatio); return value > 0 ? value : NaN; });
    // Funding: ranks the ROLLING 12-settlement average within the series of rolling averages —
    // the same quantity the fallback threshold reads (fundingAvg), far less noisy than ranking a
    // single settlement, and immune to the "last print" jitter.
    var fundingRolling = [];
    for (var f = 11; f < fundingSeries.length; f++) {
      var windowSum = 0;
      for (var w = f - 11; w <= f; w++) windowSum += fundingSeries[w];
      fundingRolling.push(windowSum / 12);
    }
    // The futures/data series span only what Binance retains at this period (~42h at 5m, ~30d at
    // 1d) — a TF-dependent window. Demand 100+ samples so 1d (30 rows) falls back to the fixed
    // thresholds instead of a 3.3%-granularity percentile; funding (8h settlements, ~333d) is
    // TF-independent and keeps the default minimum.
    var percentiles = {
      funding: AnalyticsCore.percentileRank(fundingRolling, fundingRolling[fundingRolling.length - 1]),
      longShort: AnalyticsCore.percentileRank(longShortSeries, longShortSeries[longShortSeries.length - 1], 100),
      taker: AnalyticsCore.percentileRank(takerSeries, takerSeries[takerSeries.length - 1], 100),
      topPosition: AnalyticsCore.percentileRank(topPositionSeries, topPositionSeries[topPositionSeries.length - 1], 100),
      oi: AnalyticsCore.percentileRank(oiSeries, oiSeries[oiSeries.length - 1], 100)
    };
    return {
      oiChangePct: oiChangePct,
      oiWindowStart: Number.isFinite(oiWindowStart) ? oiWindowStart : NaN,
      oiWindowEnd: Number.isFinite(oiWindowEnd) ? oiWindowEnd : NaN,
      percentiles: percentiles,
      fundingAvg: fundingAvg,
      longShortRatio: (function () { var value = finiteNumber(latestLongShort && latestLongShort.longShortRatio); return value > 0 ? value : NaN; })(),
      longAccount: finiteNumber(latestLongShort && latestLongShort.longAccount),
      shortAccount: finiteNumber(latestLongShort && latestLongShort.shortAccount),
      takerRatio: (function () { var value = finiteNumber(latestTaker && latestTaker.buySellRatio); return value > 0 ? value : NaN; })(),
      takerBuyVol: (function () { var value = finiteNumber(latestTaker && latestTaker.buyVol); return value >= 0 ? value : NaN; })(),
      takerSellVol: (function () { var value = finiteNumber(latestTaker && latestTaker.sellVol); return value >= 0 ? value : NaN; })(),
      topAccountRatio: (function () { var value = finiteNumber(latestTopAccount && latestTopAccount.longShortRatio); return value > 0 ? value : NaN; })(),
      topPositionRatio: (function () { var value = finiteNumber(latestTopPosition && latestTopPosition.longShortRatio); return value > 0 ? value : NaN; })(),
      basisRate: finiteNumber(latestBasis && latestBasis.basisRate),
      metricObservedAt: metricObservedAt,
      sourceRows: {
        openInterestHistory: oiHist,
        fundingHistory: fundingRows,
        globalLongShortHistory: longShortRows,
        takerLongShortHistory: takerRows,
        topAccountHistory: topAccountRows,
        topPositionHistory: topPositionRows,
        basisHistory: basisRows
      },
      observedAt: observedTimes.length ? Math.max.apply(null, observedTimes) : NaN
    };
  }
  function scoreableDerivativeDetail(detail) {
    if (!eligibleDataset(detail)) return {};
    var output = {};
    ['oiChangePct', 'fundingAvg', 'longShortRatio', 'takerRatio', 'topAccountRatio', 'topPositionRatio', 'basisRate'].forEach(function (metric) {
      if (AnalyticsCore.isDatasetMetricEligible(detail, metric, Date.now()) && Number.isFinite(detail[metric])) output[metric] = detail[metric];
    });
    if (Number.isFinite(output.longShortRatio)) {
      output.longAccount = detail.longAccount;
      output.shortAccount = detail.shortAccount;
    }
    if (Number.isFinite(output.takerRatio)) {
      output.takerBuyVol = detail.takerBuyVol;
      output.takerSellVol = detail.takerSellVol;
    }
    return output;
  }
  function hasDerivativeData(detail) {
    var scoreable = scoreableDerivativeDetail(detail);
    return Number.isFinite(scoreable.oiChangePct) || Number.isFinite(scoreable.fundingAvg) || Number.isFinite(scoreable.longShortRatio) || Number.isFinite(scoreable.takerRatio) || Number.isFinite(scoreable.topPositionRatio) || Number.isFinite(scoreable.basisRate);
  }
  async function loadDerivativeDetail(symbol, period, force) {
    var key = symbol + ':' + period;
    var cached = state.derivativeCache[key];
    var staleAfterMs = derivativesStaleAfter(period);
    // The 500-row series gain one point per period; refetching ~400KB every 15s buys nothing.
    // Refresh at half the period (floor 15s) — staleness display is governed separately.
    var unitMinutes = { '5m': 5, '15m': 15, '30m': 30, '1h': 60, '2h': 120, '4h': 240, '6h': 360, '12h': 720, '1d': 1440 }[period] || 5;
    var refreshMs = Math.max(DERIVATIVES_REFRESH_MS, unitMinutes * 60 * 1000 / 2);
    if (!force && cached && Date.now() - cached.fetchedAt < refreshMs) return markDataset(cached.value, cached.fetchedAt, staleAfterMs);
    var s = encodeURIComponent(symbol);
    var rows = await Promise.allSettled([
      // Longer windows feed the percentile engine (positioning vs the asset's OWN history).
      // fundingRate keeps ~333d of 8h settlements; the futures/data endpoints retain ~30d.
      fetchJSON('https://fapi.binance.com/futures/data/openInterestHist?symbol=' + s + '&period=' + period + '&limit=500', 9000, 'Binance futuros'),
      fetchJSON('https://fapi.binance.com/fapi/v1/fundingRate?symbol=' + s + '&limit=1000', 9000, 'Binance futuros'),
      fetchJSON('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=' + s + '&period=' + period + '&limit=500', 9000, 'Binance futuros'),
      fetchJSON('https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=' + s + '&period=' + period + '&limit=500', 9000, 'Binance futuros'),
      fetchJSON('https://fapi.binance.com/futures/data/topLongShortAccountRatio?symbol=' + s + '&period=' + period + '&limit=30', 9000, 'Binance futuros'),
      fetchJSON('https://fapi.binance.com/futures/data/topLongShortPositionRatio?symbol=' + s + '&period=' + period + '&limit=500', 9000, 'Binance futuros'),
      fetchJSON('https://fapi.binance.com/futures/data/basis?pair=' + s + '&contractType=PERPETUAL&period=' + period + '&limit=30', 9000, 'Binance futuros')
    ]);
    var detail = normalizeDerivativeDetail(value(rows[0]), value(rows[1]), value(rows[2]), value(rows[3]), value(rows[4]), value(rows[5]), value(rows[6]));
    detail.fetchedAt = Date.now();
    detail.period = period;
    detail.metricStaleAfterMs = {
      oiChangePct: staleAfterMs,
      fundingAvg: 12 * 60 * 60 * 1000,
      longShortRatio: staleAfterMs,
      takerRatio: staleAfterMs,
      topAccountRatio: staleAfterMs,
      topPositionRatio: staleAfterMs,
      basisRate: staleAfterMs
    };
    // A partial seven-source refresh must not erase a still-fresh metric from the previous
    // snapshot. Preserve each field independently, with its original observation timestamp.
    if (cached && cached.value) {
      var prior = cached.value;
      var companions = {
        oiChangePct: ['oiWindowStart', 'oiWindowEnd'],
        longShortRatio: ['longAccount', 'shortAccount'],
        takerRatio: ['takerBuyVol', 'takerSellVol']
      };
      var rawSeriesKeys = {
        oiChangePct: 'openInterestHistory',
        fundingAvg: 'fundingHistory',
        longShortRatio: 'globalLongShortHistory',
        takerRatio: 'takerLongShortHistory',
        topAccountRatio: 'topAccountHistory',
        topPositionRatio: 'topPositionHistory',
        basisRate: 'basisHistory'
      };
      var percentileKeys = { oiChangePct: 'oi', fundingAvg: 'funding', longShortRatio: 'longShort', takerRatio: 'taker', topPositionRatio: 'topPosition' };
      Object.keys(detail.metricStaleAfterMs).forEach(function (metric) {
        var currentFresh = Number.isFinite(detail[metric]) && AnalyticsCore.classifyFreshness(detail.metricObservedAt[metric], detail.metricStaleAfterMs[metric], Date.now()).eligibleForScore;
        var priorTtl = prior.metricStaleAfterMs && prior.metricStaleAfterMs[metric] || detail.metricStaleAfterMs[metric];
        var priorFresh = Number.isFinite(prior[metric]) && AnalyticsCore.classifyFreshness(prior.metricObservedAt && prior.metricObservedAt[metric], priorTtl, Date.now()).eligibleForScore;
        if (currentFresh || !priorFresh) return;
        detail[metric] = prior[metric];
        detail.metricObservedAt[metric] = prior.metricObservedAt[metric];
        (companions[metric] || []).forEach(function (field) { detail[field] = prior[field]; });
        var rawSeriesKey = rawSeriesKeys[metric];
        if (rawSeriesKey && prior.sourceRows && prior.sourceRows[rawSeriesKey]) detail.sourceRows[rawSeriesKey] = prior.sourceRows[rawSeriesKey];
        var percentileKey = percentileKeys[metric];
        if (percentileKey && prior.percentiles) detail.percentiles[percentileKey] = prior.percentiles[percentileKey];
      });
      var mergedObservedTimes = Object.keys(detail.metricObservedAt).map(function (metric) { return detail.metricObservedAt[metric]; }).filter(Number.isFinite);
      detail.observedAt = mergedObservedTimes.length ? Math.max.apply(null, mergedObservedTimes) : NaN;
    }
    var markedDetail = markDataset(detail, detail.fetchedAt, staleAfterMs, Number.isFinite(detail.observedAt) ? 'fresh' : 'missing', detail.observedAt);
    if (!hasDerivativeData(markedDetail) && cached) return markDataset(cached.value, cached.fetchedAt, staleAfterMs);
    if (!hasDerivativeData(markedDetail)) return markedDetail;
    state.derivativeCache[key] = { value: detail, fetchedAt: detail.fetchedAt };
    return markedDetail;
  }
  /**
   * Trap veto: after a confirmed trap, entries in the trapped direction stay blocked for
   * vetoBars candles of the CURRENT timeframe. Keyed by symbol+interval; expires by close time.
   */
  function registerTrapVeto(symbol, interval, trap, lastCloseTime) {
    if (!trap || !trap.trap || !Number.isFinite(lastCloseTime)) return;
    var key = symbol + ':' + interval;
    var direction = trap.vetoDirection === 'short' ? 'short' : 'long';
    state.trapVetos = AnalyticsCore.upsertTrapVeto(state.trapVetos, key, direction, lastCloseTime, trap.vetoBars, interval);
  }
  function activeTrapVeto(a) {
    var key = state.symbol + ':' + state.interval;
    var reference = a && a.signalCandle && Number.isFinite(a.signalCandle.closeTime) ? a.signalCandle.closeTime : Date.now();
    return AnalyticsCore.activeTrapVeto(state.trapVetos, key, reference);
  }
  function trapVetoBarsLeft(a) {
    var key = state.symbol + ':' + state.interval;
    var reference = a && a.signalCandle && Number.isFinite(a.signalCandle.closeTime) ? a.signalCandle.closeTime : Date.now();
    return AnalyticsCore.trapVetoBarsLeft(state.trapVetos, key, reference, state.interval);
  }
  function liquidationBiasFor() {
    var summary = liquidationSummary();
    if (!summary.total) return null;
    // Long liquidations are forced sells; short liquidations are forced buys.
    if (summary.longValue > summary.shortValue * 2) return 'sell';
    if (summary.shortValue > summary.longValue * 2) return 'buy';
    return null;
  }
  async function refreshSelected(ticker, premium, chain, force, symbol, interval, requestId, contextPromise) {
    var s = encodeURIComponent(symbol);
    var p = futuresPeriod(interval);
    var results = await Promise.allSettled([
      fetchSpotJSON('/api/v3/klines?symbol=' + s + '&interval=' + interval + '&limit=500', 10000, 'Binance spot'),
      fetchSpotJSON('/api/v3/depth?symbol=' + s + '&limit=100', 10000, 'Binance spot'),
      fetchJSON('https://fapi.binance.com/fapi/v1/openInterest?symbol=' + s, 9000, 'Binance futuros'),
      ticker ? Promise.resolve(ticker) : fetchSpotJSON('/api/v3/ticker/24hr?symbol=' + s, 9000, 'Binance spot'),
      premium ? Promise.resolve(premium) : fetchJSON('https://fapi.binance.com/fapi/v1/premiumIndex?symbol=' + s, 9000, 'Binance futuros'),
      loadDerivativeDetail(symbol, p, !!force),
      loadCoinMetrics(symbol, false),
      loadOptions(symbol, !!force),
      loadInstitutional(symbol, !!force),
      loadMicrostructure(symbol, !!force)
    ]);
    if (!refreshGate.isCurrent(requestId)) return false;
    var candles = parseKlines(value(results[0])), closedCandles = selectClosedCandles(candles);
    if (!closedCandles.length) throw new Error('Sem candles fechados para ' + symbol);
    var coinMetrics = value(results[6]);
    var options = value(results[7]);
    var institutional = value(results[8]);
    var microstructure = value(results[9]);
    var chainAdjustment = 0;
    if (eligibleDataset(coinMetrics)) {
      chainAdjustment += coinMetrics.score;
      var flow = coinMetrics.exchangeFlow, market = eligibleDataset(state.external.marketData) ? selectedMarket(symbol) : null;
      var selectedMarketCap = finiteNumber(market && market.market_cap);
      if (flow && Number.isFinite(flow.netflow7d) && Number.isFinite(selectedMarketCap) && selectedMarketCap > 0) {
        var flowPct = flow.netflow7d / selectedMarketCap * 100;
        chainAdjustment += flowPct > 0.1 ? -2 : flowPct < -0.1 ? 2 : 0;
      }
    }
    var analysis = mergeSelected(symbol, interval, closedCandles, value(results[3]), value(results[1]), value(results[4]), value(results[2]), chain || {}, chainAdjustment);
    analysis.derivativeDetail = value(results[5]) || {};
    analysis.oiPriceChangePct = AnalyticsCore.priceChangeOverWindow(closedCandles, analysis.derivativeDetail.oiWindowStart, analysis.derivativeDetail.oiWindowEnd);
    // Trap engine: sweep+reclaim+flip de delta com confirmacao de OI/liquidacao; registra veto.
    analysis.trap = AnalyticsCore.detectTrap(closedCandles, {
      atr: analysis.atr14,
      priorLow: analysis.priorLow,
      priorHigh: analysis.priorHigh,
      oiChangePct: analysis.derivativeDetail.oiChangePct,
      liquidationBias: liquidationBiasFor()
    });
    if (analysis.trap && analysis.trap.trap) registerTrapVeto(symbol, interval, analysis.trap, last(closedCandles).closeTime);
    analysis.coinMetrics = coinMetrics;
    analysis.options = options;
    analysis.institutional = institutional;
    analysis.microstructure = microstructure;
    analysis.signalCandle = last(closedCandles);
    analysis.liveCandle = last(candles) || analysis.signalCandle;
    analysis.liveClose = analysis.liveCandle.close;
    analysis.hasOpenCandle = !AnalyticsCore.isCandleClosed(analysis.liveCandle, Date.now());
    analysis.nativeChainScore = analysis.mempoolContext.score;
    analysis.chainAdjustment = chainAdjustment;
    var mtf = await loadMultiTimeframe(symbol, interval, false, closedCandles);
    if (!refreshGate.isCurrent(requestId)) return false;
    attachHistory(analysis, state.historyProfiles[symbol]);
    state.klines = candles;
    state.analysis = analysis;
    state.coinMetrics = coinMetrics;
    state.options = options;
    state.optionsFetchedAt = options ? Date.now() : state.optionsFetchedAt;
    state.institutional = institutional;
    state.institutionalFetchedAt = institutional ? Date.now() : state.institutionalFetchedAt;
    state.microstructure = microstructure;
    state.mtf = mtf;
    stampAnalysisSnapshot(analysis, 'selected-refresh', { symbol: symbol, interval: interval, requestId: requestId, signalCloseTime: analysis.signalCandle.closeTime });
    render(value(results[3]), value(results[4]), value(results[2]), chain || {}, value(results[1]));
    connectLiquidationStream(symbol);
    // Journal, alerts and the state machine consume one stabilized closed-candle decision.
    // The UI can paint immediately, but evidence waits until the initial context/history attempts
    // settle so the first partial render cannot become the immutable record for that candle.
    Promise.allSettled([
      ensureHistoricalProfile(symbol, true),
      contextPromise || Promise.resolve(state.external)
    ]).then(function (decisionInputs) {
      if (!refreshGate.isCurrent(requestId) || state.symbol !== symbol || state.interval !== interval || state.analysis !== analysis) return;
      var profile = value(decisionInputs[0]);
      if (profile) attachHistory(analysis, profile);
      applyExternalToAnalysis(symbol, analysis);
      stampAnalysisSnapshot(analysis, 'decision-ready');
      render(value(results[3]), value(results[4]), value(results[2]), chain || {}, value(results[1]));
      var stabilizedConfluence = confluenceFor(analysis);
      maybeRecordSignal(analysis, stabilizedConfluence);
      runSignalMachine(analysis);
      processAlerts(analysis, stabilizedConfluence);
    });
    return true;
  }
  function sortedBoard() {
    var rows = state.board.slice();
    function sortableTicker(item, key) { var value = finiteNumber((item.ticker || {})[key]); return Number.isFinite(value) ? value : -Infinity; }
    if (state.sort === 'change') rows.sort(function (a, b) { return sortableTicker(b, 'priceChangePercent') - sortableTicker(a, 'priceChangePercent'); });
    else if (state.sort === 'volume') rows.sort(function (a, b) { return sortableTicker(b, 'quoteVolume') - sortableTicker(a, 'quoteVolume'); });
    else rows.sort(function (a, b) { return sortableScore(b.analysis) - sortableScore(a.analysis); });
    return rows;
  }
  function renderBoard() {
    var grid = $('assetGrid'); if (!grid) return;
    state.board.forEach(function (item) {
      if (item && item.analysis) buildRadarScore(item.symbol, applyExternalToAnalysis(item.symbol, item.analysis));
    });
    grid.innerHTML = '';
    var rows = sortedBoard();
    var bulls = rows.filter(function (x) { return x.analysis.bias === 'Comprador'; }).length;
    var bears = rows.filter(function (x) { return x.analysis.bias === 'Vendedor'; }).length;
    var renderedInterval = state.boardInterval || (rows[0] && rows[0].interval) || state.interval;
    var boardOutdated = renderedInterval !== state.interval;
    var neutralCount = rows.length - bulls - bears;
    var summary = counted(bulls, 'comprador', 'compradores') + ', ' + counted(bears, 'vendedor', 'vendedores') + ', ' + counted(neutralCount, 'neutro', 'neutros') + ' em ' + intervalLabel(renderedInterval) + '. ';
    if (boardOutdated || state.boardPendingRefresh) summary += 'Leitura anterior mantida; atualizando para ' + intervalLabel(state.interval) + '. ';
    var stalled = stalledBoardSymbols();
    if (stalled.length) summary += counted(stalled.length, 'ativo indisponivel', 'ativos indisponiveis') + ' (' + stalled.map(baseAsset).join(', ') + '), possivel delist; re-teste periodico. ';
    text('boardSummary', summary + 'Radar Score preview: tecnica em candles fechados e contexto do snapshot atual.');
    rows.forEach(function (item) {
      var a = item.analysis, t = item.ticker || {};
      var change24h = finiteNumber(t.priceChangePercent);
      var market = eligibleDataset(state.external.marketData) && state.external.coinMarkets ? state.external.coinMarkets[contextFor(item.symbol).gecko] : null;
      var marketRank = finiteNumber(market && market.market_cap_rank);
      var marketCap = finiteNumber(market && market.market_cap);
      var market7d = finiteNumber(market && market.price_change_percentage_7d_in_currency);
      var market30d = finiteNumber(market && market.price_change_percentage_30d_in_currency);
      var chain = findChainContext(item.symbol);
      var protocol = findProtocolContext(item.symbol);
      var contextName = protocol ? protocol.name : chain ? chain.name : (contextFor(item.symbol).kind || 'Global');
      var contextScore = a.external ? a.external.total : 0;
      var card = document.createElement('button');
      card.className = 'asset-card' + (item.symbol === state.symbol ? ' active' : '');
      card.type = 'button'; card.dataset.symbol = item.symbol; card.dataset.interval = item.interval || renderedInterval;
      card.innerHTML = '<div class="asset-top"><div><span class="asset-symbol">' + baseAsset(item.symbol) + '</span><small>' + (ASSET_NAMES[item.symbol] || item.symbol) + '</small></div><div><span class="asset-score ' + scoreClass(a.bias) + '" title="Radar Score preview ' + MODEL_VERSION + '">' + (Number.isFinite(a.score) ? a.score : '--') + '</span><span class="radar-confidence">DC preview ' + (a.radar ? a.radar.dataConfidence : 0) + '%</span></div></div>' +
        '<div class="asset-row"><div><span>Preco</span><strong class="asset-price">' + money(a.close) + '</strong></div><div><span>24h</span><strong class="' + (Number.isFinite(change24h) ? (change24h >= 0 ? 'up' : 'down') : '') + '">' + percent(change24h) + '</strong></div></div>' +
        sparkline(item.candles) +
        '<div class="asset-meta"><div><span>Bias</span><strong>' + a.bias + '</strong></div><div><span>RSI/MFI</span><strong>' + num(a.rsi14, 0) + ' / ' + num(a.mfi14, 0) + '</strong></div><div><span>Rank/MCap</span><strong>' + (Number.isFinite(marketRank) ? '#' + marketRank + ' ' + compactUsd(marketCap) : '--') + '</strong></div><div><span>7d/30d</span><strong>' + (Number.isFinite(market7d) || Number.isFinite(market30d) ? percent(market7d, 1) + ' / ' + percent(market30d, 1) : '--') + '</strong></div><div><span>Funding</span><strong>' + (Number.isFinite(a.funding) ? percent(a.funding * 100, 4) : '--') + '</strong></div><div><span>Contexto</span><strong>' + signed(contextScore) + '</strong></div><div><span>Historico</span><strong>' + (historyFresh(a.history) ? signed(a.history.score) + ' | ' + a.history.samples + ' amostras' : a.history ? 'stale | fora do score' : 'carregando') + '</strong></div><div><span>Regime</span><strong>' + escapeHTML(a.regime || '--') + '</strong></div></div>' +
        '<div class="asset-context"><span>' + escapeHTML(contextName) + '</span><strong>' + (a.supports[0] ? money(a.supports[0]) : '--') + ' / ' + (a.resistances[0] ? money(a.resistances[0]) : '--') + '</strong></div>';
      grid.appendChild(card);
    });
    renderOverviewDashboard();
  }
  // Light per-tick board update: the 24-card grid only changes on board refresh (60s), sort or
  // interval change, so the 3s pass just moves the active highlight and shows the live price on the
  // selected card instead of rebuilding every card + recomputing 24 radars.
  function updateSelectedBoardCard(livePrice) {
    var grid = $('assetGrid'); if (!grid) return;
    var cards = grid.querySelectorAll('.asset-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var isActive = card.dataset.symbol === state.symbol;
      card.classList.toggle('active', isActive);
      if (isActive && Number.isFinite(livePrice)) {
        var priceEl = card.querySelector('.asset-price');
        if (priceEl) priceEl.textContent = money(livePrice);
      }
    }
  }
  function scoreClass(bias) { return bias === 'Comprador' ? 'bull' : bias === 'Vendedor' ? 'bear' : 'neutral'; }
  function sparkline(candles) {
    var rows = candles.slice(-18);
    var highs = rows.map(function (x) { return x.high; }); var lows = rows.map(function (x) { return x.low; });
    var max = Math.max.apply(null, highs), min = Math.min.apply(null, lows), range = max - min || 1;
    var bars = rows.map(function (bar) { var h = 18 + ((bar.close - min) / range) * 16; return '<span class="' + (bar.close >= bar.open ? 'upbar' : 'downbar') + '" style="height:' + h.toFixed(0) + 'px"></span>'; }).join('');
    return '<div class="asset-mini">' + bars + '</div>';
  }
  function render(ticker, premium, oi, chain, depth) {
    var a = state.analysis;
    var change = finiteNumber(ticker && ticker.priceChangePercent);
    text('chartTitle', 'Price Action ' + state.symbol + ' | ' + intervalLabel(state.interval) + ' | grafico ao vivo');
    var tickerLastPrice = finiteNumber(ticker && ticker.lastPrice);
    var livePrice = Number.isFinite(tickerLastPrice) ? tickerLastPrice : (Number.isFinite(a.liveClose) ? a.liveClose : a.close);
    text('lastPrice', money(livePrice));
    text('priceChange', percent(change) + ' 24h');
    $('priceChange').className = Number.isFinite(change) ? (change >= 0 ? 'up' : 'down') : '';
    text('dayRange', ticker ? money(finiteNumber(ticker.lowPrice)) + ' / ' + money(finiteNumber(ticker.highPrice)) : '--');
    text('weightedAvg', ticker ? 'VWAP 24h ' + money(finiteNumber(ticker.weightedAvgPrice)) : '--');
    text('fundingRate', Number.isFinite(a.funding) ? percent(a.funding * 100, 4) : '--');
    var nextFundingTime = finiteNumber(premium && premium.nextFundingTime);
    text('nextFunding', Number.isFinite(nextFundingTime) ? 'Prox. ' + new Date(nextFundingTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--');
    text('openInterest', Number.isFinite(finiteNumber(oi && oi.openInterest)) ? num(finiteNumber(oi.openInterest), 2) : '--');
    text('basisLine', Number.isFinite(a.basis) ? 'Mark-Index ' + money(a.basis) : '--');
    var mempoolCount = finiteNumber(chain && chain.mempool && chain.mempool.count);
    text('mempoolLine', a.coinMetrics && a.coinMetrics.latest ? compactNumber(metricNumber(a.coinMetrics.latest, 'AdrActCnt')) + ' end. ativos' : Number.isFinite(mempoolCount) ? fmt0.format(mempoolCount) + ' tx BTC' + (state.symbol === 'BTCUSDT' ? '' : ' | proxy') : '--');
    var fastFee = finiteNumber(chain && chain.fees && chain.fees.fastestFee), hourFee = finiteNumber(chain && chain.fees && chain.fees.hourFee);
    var feeFallback = Number.isFinite(fastFee) || Number.isFinite(hourFee) ? 'fee BTC ' + (Number.isFinite(fastFee) ? num(fastFee, 0) : '--') + '/' + (Number.isFinite(hourFee) ? num(hourFee, 0) : '--') + ' sat/vB' + (state.symbol === 'BTCUSDT' ? '' : ' | proxy fora do score') : '--';
    text('feeLine', a.coinMetrics ? 'rede 7d: end. ' + percent(a.coinMetrics.adr7, 1) + ' | tx ' + percent(a.coinMetrics.tx7, 1) : feeFallback);
    text('supportLevels', a.supports.length ? a.supports.map(money).join('  ') : '--');
    text('resistanceLevels', a.resistances.length ? a.resistances.map(money).join('  ') : '--');
    var upTrigger = a.resistances[0], downTrigger = a.supports[0];
    var triggerText = (upTrigger ? 'Alta > ' + money(upTrigger) : '') + (downTrigger ? (upTrigger ? ' | ' : '') + 'Baixa < ' + money(downTrigger) : '');
    text('triggerLine', triggerText || '--');
    var sweep = a.sweepDown ? 'Sweep de baixa absorvido' : a.sweepUp ? 'Sweep de topo rejeitado' : 'Sem sweep relevante';
    var shiftLabel = a.structureShift && a.structureShift.event ? ' | ' + a.structureShift.event + ' ' + (a.structureShift.direction === 'bull' ? 'altista' : 'baixista') + ' em ' + money(a.structureShift.brokenLevel) : '';
    var vwapState = Number.isFinite(a.vwap) ? (a.close > a.vwap ? 'acima' : 'abaixo') + ' do VWAP' : 'VWAP indisponivel';
    text('structureLine', a.structure + shiftLabel + ' | ' + sweep + ' | fechamento confirmado ' + money(a.close) + ' ' + vwapState + (a.hasOpenCandle ? ' | atual ' + money(livePrice) + ' em formacao' : ''));
    text('ema9', money(a.ema9));
    text('ema21', money(a.ema21));
    text('ema50', money(a.ema50));
    text('ema200', money(a.ema200));
    text('rsi14', num(a.rsi14, 1));
    text('stochRsi', num(a.stochRsi14, 1));
    text('macdLine', num(a.macd.hist, 2));
    text('mfi14', num(a.mfi14, 1));
    text('atr14', money(a.atr14));
    text('bbLine', money(a.bb.latestLower) + ' / ' + money(a.bb.latestUpper));
    text('vwapLine', money(a.vwap));
    text('volumeRatio', Number.isFinite(a.avgVol) && a.avgVol ? num(a.lastVol / a.avgVol, 2) + 'x' : '--');
    var divergenceLabel = a.divergence && a.divergence.bearish ? ' | divergencia bearish (maturidade de tendencia)' : a.divergence && a.divergence.bullish ? ' | divergencia bullish (maturidade de tendencia)' : '';
    text('rsiState', (Number.isFinite(a.rsi14) ? (a.rsi14 >= 70 ? 'Sobrecompra' : a.rsi14 <= 30 ? 'Sobrevenda' : 'Neutro') : 'Indisponivel') + divergenceLabel);
    text('macdState', Number.isFinite(a.macd.hist) ? (a.macd.hist > 0 ? 'Acima do sinal' : 'Abaixo do sinal') : 'Indisponivel');
    text('volumeState', Number.isFinite(a.avgVol) && Number.isFinite(a.lastVol) ? (a.lastVol > a.avgVol * 1.35 ? 'Volume alto' : 'Normal') : 'Indisponivel');
    updateScore(a); updateBook(a); updateChain(chain); renderCoinMetrics(a); renderExternalContext(a); renderAdvancedIndicators(a); renderSetupQuality(a); renderLiquidity(a); renderDerivativesDetails(a); renderMultiTimeframe(a); renderHistoricalProfile(a); renderSmartMoney(a); renderConfluence(a); renderWrittenAnalysis(a); renderHistoricalLab(a); renderFuturesConsole(a); renderLiquidations(); renderOptions(); renderExchangeFlows(a); renderInstitutional(); renderMacroFlow(a); renderCorrelation(a); calculatePosition(); drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); updateSelectedBoardCard(livePrice);
    renderSnapshotStamp(a);
    document.title = state.symbol + ' ' + money(a.close);
  }
  function updateScore(a) {
    var c = confluenceFor(a);
    text('scoreValue', String(c.total)); text('scoreBias', c.decision);
    var gauge = $('scoreGauge'); gauge.className = 'score-gauge ' + (c.tone === 'long' ? 'bull' : c.tone === 'avoid' ? 'bear' : 'neutral');
    text('trendSignal', a.trendScore > 10 ? 'Alta' : a.trendScore < -10 ? 'Baixa' : 'Misto');
    text('momentumSignal', a.momScore > 8 ? 'Forte' : a.momScore < -8 ? 'Fraco' : 'Neutro');
    text('volumeSignal', a.flowAvailable ? (a.flowScore > 8 ? 'Compra' : a.flowScore < -8 ? 'Venda' : 'Equilibrio') : 'Sem leitura');
    var bookAvailable = Number.isFinite(a.spreadBps) && Number.isFinite(a.bidQty) && Number.isFinite(a.askQty) && (a.bidQty + a.askQty) > 0;
    text('bookSignal', bookAvailable ? (a.bookScore > 0 ? 'Bid domina' : a.bookScore < 0 ? 'Ask domina' : 'Balanceado') : 'Sem leitura');
    text('derivativesSignal', hasDerivativeData(a.derivativeDetail) ? (a.derivScore > 0 ? 'Leve apoio' : a.derivScore < 0 ? 'Cautela' : 'Neutro') : 'Sem leitura');
    var chainAvailable = eligibleDataset(a.coinMetrics) || !!(a.mempoolContext && a.mempoolContext.eligibleForScore);
    var activeChainScore = eligibleDataset(a.coinMetrics) ? a.chainScore : a.nativeChainScore;
    text('chainSignal', chainAvailable ? (activeChainScore > 0 ? 'Atividade apoia' : activeChainScore < 0 ? 'Atividade enfraquece' : 'Neutro') : 'Sem leitura');
    text('sentimentSignal', eligibleDataset(c.external) ? (c.external.sentiment > 2 ? 'Apoia risco' : c.external.sentiment < -2 ? 'Pressiona' : 'Neutro') : 'Sem leitura');
    text('externalSignal', eligibleDataset(c.external) ? (c.external.total > 6 ? 'Favoravel' : c.external.total < -6 ? 'Contra' : 'Misto') : 'Sem leitura');
    var top = a.resistances[0], base = a.supports[0];
    var plan = buildTradePlan(a);
    text('playbookText', plan.levels.length ? plan.side + ': ' + plan.levels.map(function (level) { return level.label + ' ' + level.value; }).join(' | ') + '.' : plan.rationale);
  }
  function updateBook(a) {
    var total = (a.bidQty || 0) + (a.askQty || 0);
    var bidPct = total ? clamp((a.bidQty / total) * 100, 5, 95) : 0;
    var askPct = total ? 100 - bidPct : 0;
    $('bidBar').style.width = bidPct + '%'; $('askBar').style.width = askPct + '%';
    text('bidDepth', total ? 'Bid ' + num(a.bidQty, 3) + ' ' + baseAsset(state.symbol) : 'Bid --'); text('askDepth', total ? 'Ask ' + num(a.askQty, 3) + ' ' + baseAsset(state.symbol) : 'Ask --');
    text('spreadLine', total && Number.isFinite(a.spread) && Number.isFinite(a.bookImb) ? 'Spread ' + money(a.spread) + ' | Imbalance ' + percent(a.bookImb * 100, 1) : 'Livro indisponivel');
  }
  function updateChain(chain) {
    var height = finiteNumber(chain && chain.height), mempoolCount = finiteNumber(chain && chain.mempool && chain.mempool.count);
    var fastestFee = finiteNumber(chain && chain.fees && chain.fees.fastestFee), minimumFee = finiteNumber(chain && chain.fees && chain.fees.minimumFee);
    text('blockHeight', Number.isFinite(height) && height > 0 ? fmt0.format(height) : '--');
    text('mempoolTx', Number.isFinite(mempoolCount) && mempoolCount >= 0 ? fmt0.format(mempoolCount) : '--');
    text('fastFee', Number.isFinite(fastestFee) && fastestFee >= 0 ? num(fastestFee, 0) + ' sat/vB' : '--');
    text('lowFee', Number.isFinite(minimumFee) && minimumFee >= 0 ? num(minimumFee, 0) + ' sat/vB' : '--');
  }
  function renderCoinMetrics(a) {
    var metrics = a.coinMetrics;
    var latest = metrics && metrics.latest ? metrics.latest : null;
    text('activeAddresses', latest ? compactNumber(metricNumber(latest, 'AdrActCnt')) + ' | 7d ' + percent(metrics.adr7, 1) : '--');
    text('networkTransactions', latest ? compactNumber(metricNumber(latest, 'TxCnt')) + ' | 7d ' + percent(metrics.tx7, 1) : '--');
    text('networkFees', latest ? compactUsd(metricNumber(latest, 'FeeTotUSD')) + ' | 7d ' + percent(metrics.fees7, 1) : '--');
    text('valuationMetrics', latest ? num(metricNumber(latest, 'CapMVRVCur'), 2) + ' / ' + num(metricNumber(latest, 'NVTAdj'), 1) : '--');
    text('coinMetricsStatus', metrics ? metrics.asset.toUpperCase() + ' | ' + datasetStatus(metrics) + (!eligibleDataset(metrics) ? ' | fora do score' : '') : 'sem cobertura');
  }
  function renderAdvancedIndicators(a) {
    text('adxLine', num(a.adx.adx, 1) + ' | +' + num(a.adx.plus, 1) + ' / -' + num(a.adx.minus, 1));
    text('supertrendLine', a.supertrend.trend + ' ' + money(a.supertrend.value));
    text('keltnerLine', money(a.keltner.lower) + ' / ' + money(a.keltner.upper));
    text('donchianLine', money(a.donchian.lower) + ' / ' + money(a.donchian.upper));
    text('bbStatsLine', num(a.bbPctB, 1) + '% | width ' + percent(a.bbWidth, 2).replace('+', ''));
    text('rocLine', percent(a.roc12, 2));
    text('obvLine', compactNumber(a.obv));
    text('cmfLine', num(a.cmf20, 3));
    text('realizedVolLine', percent(a.realizedVol30, 1).replace('+', '') + ' anual.');
    text('zScoreLine', num(a.zScore20, 2));
    text('williamsLine', num(a.williams14, 1));
    text('cciLine', num(a.cci20, 1));
    text('ichimokuLine', a.ichimoku.state + ' | ' + money(a.ichimoku.base));
    text('regimeLine', a.regime);
  }
  function renderMultiTimeframe() {
    var mtf = state.mtf;
    var availableIntervals = mtf && mtf.rows ? MTF_INTERVALS.filter(function (interval) { return mtf.rows.some(function (row) { return row.interval === interval; }); }) : [];
    var missingIntervals = MTF_INTERVALS.filter(function (interval) { return availableIntervals.indexOf(interval) === -1; });
    text('mtfAlignment', mtf ? mtf.bias + ' ' + Math.round(mtf.alignment * 100) + '% | ' + availableIntervals.length + '/' + MTF_INTERVALS.length + ' TF' : '--');
    var node = $('mtfMatrix');
    if (node) node.innerHTML = mtf && mtf.rows.length ? mtf.rows.map(function (row) {
      var cls = row.score >= 12 ? 'good' : row.score <= -12 ? 'bad' : '';
      return '<div class="mtf-cell ' + cls + '"><span>' + escapeHTML(intervalLabel(row.interval)) + '</span><strong>' + escapeHTML(row.bias) + ' ' + signed(row.score) + '</strong><small>RSI ' + num(row.rsi, 0) + ' | ADX ' + num(row.adx, 0) + '</small></div>';
    }).join('') : '<div class="mtf-cell"><span>Aguardando</span><strong>--</strong></div>';
    text('mtfCaption', mtf ? mtf.positive + ' altas, ' + mtf.negative + ' baixas; cobertura canonica ' + availableIntervals.length + '/' + MTF_INTERVALS.length + (missingIntervals.length ? ' (faltam ' + missingIntervals.map(intervalLabel).join(', ') + '; leitura degradada e gate HTF pode ficar indisponivel).' : '; 4h, 1d e 1w recebem maior peso.') : 'Carregando confirmacoes de tendencia.');
  }
  function renderHistoricalProfile(a) {
    var candidate = a.history || state.historyProfiles[state.symbol];
    var profile = historyFresh(candidate) ? candidate : null;
    text('historyCoverage', profile ? profile.candles + ' dias' : 'carregando');
    text('historySamples', profile ? String(profile.samples) : '--');
    text('historyWinRate', profile ? num(profile.winRate7, 1) + '%' : '--');
    text('historyMedian7', profile ? percent(profile.median7, 2) : '--');
    text('historyDrawdown', profile ? percent(profile.maxDrawdown, 1) : '--');
    text('historyCaption', profile ? 'Desde ' + new Date(profile.listingTime).toLocaleDateString('pt-BR') + ' | vol 30d ' + num(profile.realizedVol30, 1) + '% | indicador historico ' + signed(profile.score) + '.' : 'Varrendo o historico diario da Binance.');
  }
  function renderSmartMoney(a) {
    var smart = smartMoneyAnalysis(a);
    text('smartMoneyScore', 'Indicador ' + signed(smart.score));
    text('smartStructure', smart.structure);
    text('smartLiquidity', smart.liquidity);
    text('smartOiPhase', smart.oiPhase);
    text('smartImbalance', smart.imbalance);
    text('smartMoneyCaption', 'Estrutura + liquidez + delta/CMF + OI. Confirmar no fechamento do candle.');
  }
  function renderSetupQuality(a) {
    var q = setupQuality(a);
    text('setupScoreLine', 'Indicador ' + signed(q.total));
    var node = $('setupChecklist');
    if (node) {
      node.innerHTML = q.checks.map(function (item) {
        var cls = item.score > 0 ? 'good' : item.score < 0 ? 'bad' : '';
        return '<div class="setup-row ' + cls + '"><div><strong>' + escapeHTML(item.name) + '</strong><span>' + escapeHTML(item.detail) + '</span></div><em>' + signed(item.score) + '</em></div>';
      }).join('');
    }
    var label = q.total >= 45 ? 'Setup forte, mas ainda exige gatilho e controle de risco.' : q.total >= 20 ? 'Setup construtivo, melhor com confirmacao de rompimento/reteste.' : q.total <= -25 ? 'Setup fraco; evitar entrada antecipada ate melhorar confluencia.' : 'Setup misto; decisao depende de gatilho claro no preco.';
    text('setupCaption', label);
  }
  function renderLiquidity(a) {
    text('spreadBpsLine', Number.isFinite(a.spreadBps) ? num(a.spreadBps, 2) + ' bps' : '--');
    text('micropriceLine', money(a.microprice));
    text('book01Line', a.book01 ? 'Bid ' + compactMoney(a.book01.bidNotional) + ' / Ask ' + compactMoney(a.book01.askNotional) : '--');
    text('book05Line', a.book05 ? 'Bid ' + compactMoney(a.book05.bidNotional) + ' / Ask ' + compactMoney(a.book05.askNotional) : '--');
    text('buySlipLine', Number.isFinite(a.buySlipBps) ? num(a.buySlipBps, 2) + ' bps em ' + compactMoney(a.slippageNotional) : '--');
    text('sellSlipLine', Number.isFinite(a.sellSlipBps) ? num(a.sellSlipBps, 2) + ' bps em ' + compactMoney(a.slippageNotional) : '--');
  }
  function renderExternalContext(a) {
    var ext = state.external || {};
    var ctx = contextFor(state.symbol);
    var market = eligibleDataset(state.external.marketData) ? selectedMarket(state.symbol) : null;
    var chain = findChainContext(state.symbol);
    var protocol = findProtocolContext(state.symbol);
    var externalScore = a && a.external ? a.external : scoreExternalContext(state.symbol);
    text('fearGreedLine', ext.fearGreed ? ext.fearGreed.value + ' ' + ext.fearGreed.label : '--');
    text('globalRiskLine', 'Contexto ' + signed(externalScore.total));
    text('focusAssetKind', ctx.kind || 'Criptoativo');
    text('focusAssetName', (ASSET_NAMES[state.symbol] || baseAsset(state.symbol)) + ' / USDT');
    var marketRank = finiteNumber(market && market.market_cap_rank);
    text('focusRank', Number.isFinite(marketRank) ? '#' + marketRank : '--');
    text('focusNarrative', ctx.narrative || 'Ativo acompanhado por mercado, fluxo, noticias e contexto global.');
    text('focusMarketCap', market ? compactUsd(finiteNumber(market.market_cap)) : '--');
    text('focusChange', market ? percent(finiteNumber(market.price_change_percentage_7d_in_currency), 2) + ' / ' + percent(finiteNumber(market.price_change_percentage_30d_in_currency), 2) : '--');
    text('focusVolume', market ? compactUsd(finiteNumber(market.total_volume)) : '--');
    text('focusShortChange', market ? percent(finiteNumber(market.price_change_percentage_1h_in_currency), 2) + ' / ' + percent(finiteNumber(market.price_change_percentage_24h_in_currency), 2) : '--');
    var athChange = finiteNumber(market && market.ath_change_percentage);
    text('focusAth', Number.isFinite(athChange) ? percent(athChange, 1) : '--');
    var circulatingSupply = finiteNumber(market && market.circulating_supply), maxSupply = finiteNumber(market && market.max_supply);
    text('focusSupply', market ? compactNumber(circulatingSupply) + (Number.isFinite(maxSupply) && maxSupply > 0 ? ' / ' + compactNumber(maxSupply) : '') : '--');
    text('focusChain', chain ? chain.name : (ctx.chain || '--'));
    text('focusChainTvl', chain ? compactUsd(finiteNumber(chain.tvl)) + ' TVL | 7d ' + (AnalyticsCore.toFiniteNumber(chain.change_7d) === null ? '--' : percent(finiteNumber(chain.change_7d), 2)) : 'Sem TVL direto');
    text('focusProtocol', protocol ? protocol.name : (ctx.protocol || '--'));
    text('focusProtocolTvl', protocol ? compactUsd(finiteNumber(protocol.tvl)) + ' TVL | 7d ' + (AnalyticsCore.toFiniteNumber(protocol.change_7d) === null ? '--' : percent(finiteNumber(protocol.change_7d), 2)) : 'Sem protocolo direto');
    renderGlobalContext(ext);
    renderSourceHealth(ext);
  }
  function renderGlobalContext(ext) {
    var global = activeGlobalMarket(ext) || {};
    var paprika = ext.paprikaGlobal || {};
    var totalMcap = firstFinite([global.total_market_cap && global.total_market_cap.usd, paprika.market_cap_usd]);
    var totalVol = firstFinite([global.total_volume && global.total_volume.usd, paprika.volume_24h_usd]);
    var globalChange = firstFinite([global.market_cap_change_percentage_24h_usd, paprika.market_cap_change_24h]);
    var btcDom = btcDominanceValue(ext);
    text('globalMarketCap', compactUsd(totalMcap));
    text('globalVolume', compactUsd(totalVol));
    text('btcDominance', Number.isFinite(btcDom) ? percent(btcDom, 2).replace('+', '') : '--');
    text('defiTvl', compactUsd(finiteNumber(ext.defiTvl)));
    text('stablecoinCap', compactUsd(finiteNumber(ext.stablecoinCap)));
    text('dexVolume', compactUsd(finiteNumber(ext.dexVolume)));
    text('fees24h', compactUsd(finiteNumber(ext.fees24h)));
    text('defiPerpsOi', compactUsd(finiteNumber(ext.perpsOpenInterest)));
    var macroParts = activeMacroParts(ext.macro);
    var treasury = macroParts.treasury;
    var vix = macroParts.vix;
    text('treasuryYields', treasury ? num(treasury.y2, 2) + '% / ' + num(treasury.y10, 2) + '%' : '--');
    text('yieldCurve', treasury ? (treasury.curve10y2y >= 0 ? '+' : '') + num(treasury.curve10y2y, 2) + ' pp' : '--');
    text('vixLevel', vix ? num(vix.close, 2) + ' | 5d ' + percent(vix.change5d, 1) : '--');
    text('macroDataScore', macroSourceAvailable(ext.macro) ? 'Indicador ' + signed(activeMacroScore(ext.macro)) : '--');
    var trending = (ext.trending || []).map(function (item) { return item.symbol ? item.symbol.toUpperCase() : item.name; }).filter(Boolean).slice(0, 5);
    text('trendingLine', (Number.isFinite(globalChange) ? 'Mcap 24h ' + percent(globalChange, 2) + '. ' : '') + (trending.length ? 'Trending: ' + trending.join(', ') : 'Trending indisponivel.'));
    text('externalStatus', ext.fetchedAt ? 'Atualizado ' + new Date(ext.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--');
    text('pairContextUpdated', ext.fetchedAt ? 'Contexto ' + Math.round(EXTERNAL_REFRESH_MS / 1000) + 's' : '--');
  }
  function renderDerivativesDetails(a) {
    var raw = a.derivativeDetail || {}, d = scoreableDerivativeDetail(raw);
    text('oiChangeLine', Number.isFinite(d.oiChangePct) ? percent(d.oiChangePct, 2) + ' no periodo' : '--');
    text('fundingAvgLine', Number.isFinite(d.fundingAvg) ? percent(d.fundingAvg * 100, 4) : '--');
    text('longShortLine', Number.isFinite(d.longShortRatio) ? 'Global ' + num(d.longShortRatio, 2) + 'x' + (Number.isFinite(d.topPositionRatio) ? ' | top pos. ' + num(d.topPositionRatio, 2) + 'x' : '') : '--');
    text('takerRatioLine', Number.isFinite(d.takerRatio) ? num(d.takerRatio, 2) + 'x buy/sell' : '--');
    var detail = [];
    if (Number.isFinite(d.oiChangePct)) detail.push('OI ' + (d.oiChangePct >= 0 ? 'expandindo' : 'reduzindo'));
    if (Number.isFinite(d.longShortRatio)) detail.push(d.longShortRatio > 1.15 ? 'contas mais long' : d.longShortRatio < 0.85 ? 'contas mais short' : 'posicionamento equilibrado');
    if (Number.isFinite(d.takerRatio)) detail.push(d.takerRatio > 1.08 ? 'agressao compradora' : d.takerRatio < 0.92 ? 'agressao vendedora' : 'takers neutros');
    if (Number.isFinite(d.basisRate)) detail.push('basis rate ' + percent(d.basisRate * 100, 4));
    if (raw.period) detail.push('periodo ' + raw.period);
    if (raw.dataStatus) detail.push(datasetStatus(raw) + (!hasDerivativeData(raw) ? ' | fora do score' : ''));
    if (raw.retrievedAt || raw.fetchedAt) detail.push('recuperado ' + new Date(raw.retrievedAt || raw.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    text('derivativesCaption', detail.length ? detail.join(' | ') : 'Dados historicos de derivativos indisponiveis no momento.');
  }
  function buildTradePlan(a) {
    var c = confluenceFor(a), atrValue = Number.isFinite(a.atr14) ? a.atr14 : a.close * 0.02;
    var gates = c.gates || {};
    // Direcional nos DOIS lados, com os mesmos gates do motor: HTF disponivel/nao-contrario e
    // sem veto pos-trap. Setup fortemente negativo agora autoriza plano SHORT (era long-only).
    var side = 'wait';
    if (c.dataConfidence >= 40 && gates.htfAvailable) {
      if (c.total >= 42 && c.multi.score >= 0 && !gates.htfVetoLong && gates.trapVeto !== 'long') side = 'long';
      else if (c.total <= -42 && c.multi.score <= 0 && !gates.htfVetoShort && gates.trapVeto !== 'short') side = 'short';
    }
    if (side === 'wait') {
      return {
        side: 'Aguardar',
        levels: [
          { label: 'Gatilho de alta', value: a.resistances[0] ? money(a.resistances[0]) : '--' },
          { label: 'Gatilho de baixa', value: a.supports[0] ? money(a.supports[0]) : '--' },
          { label: 'Stop', value: 'Apos confirmacao', cls: 'stop' },
          { label: 'Take profits', value: 'Apos confirmacao', cls: 'target' },
          { label: 'Risco/retorno', value: 'Sem operacao' }
        ],
        rationale: c.dataConfidence < 40 ? 'Data Confidence abaixo de 40%: nenhum plano direcional e liberado.'
          : gates.trapVeto ? 'Veto pos-trap ativo: aguardar as barras de resfriamento antes de qualquer plano direcional.'
            : !gates.htfAvailable ? 'Gate HTF indisponivel (1d/1w sem leitura): plano direcional exige o quadro completo.'
              : 'Sem confluencia direcional suficiente: o plano e ativado por rompimento, reteste e alinhamento de fluxo.'
      };
    }
    if (side === 'short') {
      // Stop ESTRUTURAL atras da resistencia (nao ATR generico); invalidacao = reclaim do nivel.
      var shortEntryHigh = Math.min(a.resistances[0] || a.close + atrValue * 0.5, a.close + atrValue * 0.55);
      var shortEntryLow = a.close - atrValue * 0.12;
      var shortStop = (a.resistances[0] || a.close + atrValue) + atrValue * 0.25;
      var shortMid = (shortEntryLow + shortEntryHigh) / 2;
      var shortRisk = shortStop - shortMid;
      // Piso de sanidade: em ativo barato com ATR enorme, um multiplo de R poderia cruzar zero.
      var shortTargets = [1.5, 2.2, 3].map(function (rr) { return Math.max(shortMid - shortRisk * rr, shortMid * 0.05); });
      return {
        side: 'Short condicional',
        levels: [
          { label: 'Entrada', value: money(shortEntryLow) + ' a ' + money(shortEntryHigh) },
          { label: 'Stop / invalidacao', value: money(shortStop) + ' (reclaim da resistencia)', cls: 'stop' },
          { label: 'TP1', value: money(shortTargets[0]), cls: 'target' },
          { label: 'TP2', value: money(shortTargets[1]), cls: 'target' },
          { label: 'TP3', value: money(shortTargets[2]), cls: 'target' }
        ],
        rationale: 'Plano vendedor: setup ' + signed(c.total) + ' com HTF nao-contrario. Stop estrutural atras da resistencia; invalidacao e o reclaim do nivel, nao uma porcentagem.'
      };
    }
    var entryLow = Math.max(a.supports[0] || a.close - atrValue * 0.5, a.close - atrValue * 0.55);
    var entryHigh = a.close + atrValue * 0.12;
    // Stop estrutural: atras do suporte (swing) com buffer de ATR — consistente com o motor v2.
    var structuralStop = Math.max((a.supports[0] || a.close - atrValue) - atrValue * 0.25, a.close * 0.02);
    var invalidation = a.structureShift && Number.isFinite(a.structureShift.brokenLevel) && a.structureShift.direction === 'bull' ? a.structureShift.brokenLevel : null;
    var mid = (entryLow + entryHigh) / 2;
    var longRisk = mid - structuralStop;
    var targets = [1.5, 2.2, 3].map(function (rr) { return mid + longRisk * rr; });
    return {
      side: 'Long condicional',
      levels: [
        { label: 'Entrada', value: money(entryLow) + ' a ' + money(entryHigh) },
        { label: 'Stop / invalidacao', value: money(structuralStop) + (invalidation ? ' (CHoCH em ' + money(invalidation) + ')' : ' (atras do swing)'), cls: 'stop' },
        { label: 'TP1', value: money(targets[0]), cls: 'target' },
        { label: 'TP2', value: money(targets[1]), cls: 'target' },
        { label: 'TP3', value: money(targets[2]), cls: 'target' }
      ],
      rationale: 'Stop estrutural atras do suporte + Setup Score preview ' + signed(c.total) + '. Componentes tecnicos usam candles fechados; fluxo e derivativos usam o snapshot mais recente. Tamanho da posicao deve respeitar o risco por trade.'
    };
  }
  function renderHistoricalLab(a) {
    var mtf = state.mtf;
    text('historicalLabStatus', mtf ? mtf.rows.length + ' timeframes' : 'carregando');
    var table = $('historicalTimeframes');
    if (table) {
      var header = '<div class="timeframe-row header"><span>TF</span><span>Bias</span><span>Indicador</span><span>RSI</span><span>ADX</span><span>Evento</span></div>';
      table.innerHTML = header + (mtf && mtf.rows.length ? mtf.rows.map(function (row) {
        var cls = row.score >= 12 ? 'good' : row.score <= -12 ? 'bad' : '';
        return '<div class="timeframe-row"><strong>' + escapeHTML(intervalLabel(row.interval)) + '</strong><span class="' + cls + '">' + escapeHTML(row.bias) + '</span><span>' + signed(row.score) + '</span><span>' + num(row.rsi, 0) + '</span><span>' + num(row.adx, 0) + '</span><span>' + escapeHTML(row.cross || row.structure || '--') + '</span></div>';
      }).join('') : '<div class="timeframe-row"><span>--</span><span>Aguardando dados</span></div>');
    }
    var patterns = a.patterns || [];
    text('patternCount', patterns.length + ' eventos');
    var list = $('patternList');
    if (list) list.innerHTML = patterns.length ? patterns.map(function (pattern) {
      var cls = pattern.direction === 'bull' ? 'bull' : pattern.direction === 'bear' ? 'bear' : '';
      return '<div class="pattern-item ' + cls + '"><div><strong>' + escapeHTML(pattern.name) + '</strong><span>' + escapeHTML(pattern.detail) + '</span></div><small>forca heuristica ' + pattern.confidence + '/100</small></div>';
    }).join('') : '<div class="pattern-item"><div><strong>Nenhum padrao confirmado</strong><span>Estrutura atual nao atende aos criterios objetivos do detector.</span></div></div>';
    var plan = buildTradePlan(a);
    text('tradePlanSide', plan.side);
    var planGrid = $('tradePlanGrid');
    if (planGrid) planGrid.innerHTML = plan.levels.map(function (level) { return '<div class="trade-level ' + (level.cls || '') + '"><span>' + escapeHTML(level.label) + '</span><strong>' + escapeHTML(level.value) + '</strong></div>'; }).join('');
    text('tradePlanRationale', plan.rationale);
    // Cenarios base/alternativo/range com invalidacao ESTRUTURAL (nivel do CHoCH quando ha).
    var structuralInvalidation = a.structureShift && Number.isFinite(a.structureShift.brokenLevel) ? a.structureShift.brokenLevel : null;
    var scenarios = AnalyticsCore.buildScenarios({
      close: a.close, atr: a.atr14, bias: a.bias,
      supports: a.supports, resistances: a.resistances,
      structuralInvalidation: structuralInvalidation
    });
    if (scenarios.length) {
      var base = scenarios[0], alt = scenarios[1], range = scenarios[2];
      text('scenarioLines', 'Cenario base (' + base.direction + '): gatilho ' + money(base.trigger) + ', alvo ' + money(base.target) + ', invalida em ' + money(base.invalidation) + '. Alternativo (' + alt.direction + '): gatilho ' + money(alt.trigger) + ', alvo ' + money(alt.target) + ', invalida em ' + money(alt.invalidation) + '. Range: ' + money(range.lower) + ' a ' + money(range.upper) + '.');
    } else {
      text('scenarioLines', '--');
    }
  }
  function renderFuturesConsole(a) {
    var detail = scoreableDerivativeDetail(a.derivativeDetail), smart = smartMoneyAnalysis(a);
    var risk = 0, reasons = [];
    if (Number.isFinite(a.funding)) {
      if (a.funding > 0.0003) { risk -= 3; reasons.push({ tone: 'bad', text: 'Funding elevado aumenta custo e risco de long lotado.' }); }
      else if (a.funding < -0.0001) { risk += 1; reasons.push({ tone: 'neutral', text: 'Funding negativo pode favorecer short squeeze, mas nao e gatilho isolado.' }); }
      else reasons.push({ tone: 'good', text: 'Funding sem excesso relevante.' });
    }
    if (Number.isFinite(detail.oiChangePct) && Number.isFinite(a.oiPriceChangePct)) {
      if (detail.oiChangePct > 4 && a.oiPriceChangePct < 0) { risk -= 3; reasons.push({ tone: 'bad', text: 'OI cresce com preco caindo na mesma janela: possivel formacao de shorts.' }); }
      else if (detail.oiChangePct > 4 && a.oiPriceChangePct > 0) { risk += 2; reasons.push({ tone: 'good', text: 'OI cresce com preco subindo na mesma janela: novos longs, com risco de liquidacao se perder suporte.' }); }
      else reasons.push({ tone: 'neutral', text: 'OI sem expansao extrema no periodo.' });
    }
    if (Number.isFinite(detail.longShortRatio) && detail.longShortRatio > 1.7) { risk -= 2; reasons.push({ tone: 'bad', text: 'Long/short muito inclinado para long aumenta risco contrarian.' }); }
    if (Number.isFinite(detail.topPositionRatio) && detail.topPositionRatio > 1.7) { risk -= 2; reasons.push({ tone: 'bad', text: 'Posicoes dos top traders estao concentradas em long.' }); }
    text('futuresRegime', smart.oiPhase);
    var futuresOi = finiteNumber(a.oi && a.oi.openInterest);
    text('futuresOi', Number.isFinite(futuresOi) ? compactNumber(futuresOi) + ' | ' + percent(detail.oiChangePct, 2) : '--');
    // percentiles vem do detail CRU (scoreableDerivativeDetail so copia as metricas pontuaveis).
    var rawPercentiles = a.derivativeDetail && a.derivativeDetail.percentiles ? a.derivativeDetail.percentiles : {};
    var carryInfo = AnalyticsCore.calculateCarryRegime({ fundingAvg: detail.fundingAvg, oiPercentile: rawPercentiles.oi });
    text('futuresFunding', (Number.isFinite(a.funding) ? percent(a.funding * 100, 4) : '--') + ' / ' + (Number.isFinite(detail.fundingAvg) ? percent(detail.fundingAvg * 100, 4) : '--') + (Number.isFinite(carryInfo.annualizedCarryPct) ? ' | carry ' + percent(carryInfo.annualizedCarryPct, 1) + ' a.a.' + (carryInfo.deltaNeutral ? ' (delta-neutro)' : '') : ''));
    text('futuresBasis', Number.isFinite(detail.basisRate) ? percent(detail.basisRate * 100, 4) + ' | ' + money(a.basis) : Number.isFinite(a.basis) ? money(a.basis) : '--');
    text('futuresLongShort', Number.isFinite(detail.longShortRatio) ? 'global ' + num(detail.longShortRatio, 2) + 'x' + (Number.isFinite(detail.topPositionRatio) ? ' | top ' + num(detail.topPositionRatio, 2) + 'x' : '') : '--');
    text('futuresTaker', Number.isFinite(detail.takerRatio) ? num(detail.takerRatio, 2) + 'x' : '--');
    text('futuresPhase', smart.oiPhase);
    text('futuresRiskScore', 'Indicador ' + signed(risk));
    var node = $('futuresRiskList');
    if (node) node.innerHTML = reasons.length ? reasons.map(function (item) { return '<div class="reason-item"><span class="reason-dot ' + (item.tone === 'good' ? 'good' : item.tone === 'bad' ? 'bad' : '') + '"></span><span>' + escapeHTML(item.text) + '</span></div>'; }).join('') : '<div class="reason-item"><span class="reason-dot"></span><span>Dados insuficientes para classificar o risco.</span></div>';
  }
  function liquidationSummary() {
    var now = Date.now(), cutoffHour = now - 60 * 60 * 1000, futureLimit = now + AnalyticsCore.RULESET.clockSkewToleranceMs;
    var rows = state.liquidations.filter(function (row) { return row.symbol === state.symbol && row.time >= cutoffHour && row.time <= futureLimit; });
    var cutoff15 = now - 15 * 60 * 1000;
    var recent = rows.filter(function (row) { return row.time >= cutoff15; });
    var longValue = recent.filter(function (row) { return row.side === 'long'; }).reduce(function (sum, row) { return sum + row.notional; }, 0);
    var shortValue = recent.filter(function (row) { return row.side === 'short'; }).reduce(function (sum, row) { return sum + row.notional; }, 0);
    return { rows: rows, recent: recent, longValue: longValue, shortValue: shortValue, total: longValue + shortValue };
  }
  function renderLiquidations() {
    var summary = liquidationSummary(), rows = summary.rows, longValue = summary.longValue, shortValue = summary.shortValue;
    var total = summary.total, imbalance = total ? ((shortValue - longValue) / total) * 100 : NaN;
    var largest = rows.length ? rows.reduce(function (best, row) { return row.notional > best.notional ? row : best; }, rows[0]) : null;
    text('liquidationStreamStatus', state.liquidationConnected ? 'Live' : state.live ? 'Reconectando' : 'Pausado');
    text('longLiquidations15m', compactMoney(longValue));
    text('shortLiquidations15m', compactMoney(shortValue));
    text('liquidationImbalance', Number.isFinite(imbalance) ? percent(imbalance, 1) + (imbalance >= 0 ? ' short squeeze' : ' long flush') : '--');
    text('largestLiquidation', largest ? compactMoney(largest.notional) + ' ' + largest.side : '--');
    var tape = $('liquidationTape');
    if (tape) tape.innerHTML = rows.length ? rows.slice(0, 12).map(function (row) {
      var label = row.side === 'long' ? 'Long liquidado' : 'Short liquidado';
      var time = new Date(row.time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      return '<div class="liquidation-row ' + row.side + '"><div><strong>' + escapeHTML(label) + '</strong><span>' + escapeHTML(time) + ' | ' + money(row.price) + ' | ' + num(row.quantity, 4) + ' ' + baseAsset(row.symbol) + '</span></div><strong>' + compactMoney(row.notional) + '</strong></div>';
    }).join('') : '<div class="liquidation-row"><div><strong>Nenhuma liquidacao observada</strong><span>O stream esta ativo; eventos aparecerao aqui quando ocorrerem.</span></div></div>';
    text('liquidationCaption', state.liquidationConnected ? rows.length + ' eventos observados na ultima hora. Stream amostrado da Binance; nao representa um heatmap historico.' : 'Tentando conectar ao stream de liquidacoes da Binance.');
  }
  function formatGreeks(book) {
    var greeks = book && book.greeks;
    if (!greeks) return '--';
    return 'D ' + num(finiteNumber(greeks.delta), 2) + ' | G ' + num(finiteNumber(greeks.gamma), 5) + ' | V ' + num(finiteNumber(greeks.vega), 2) + ' | T ' + num(finiteNumber(greeks.theta), 2);
  }
  function renderOptions() {
    var data = state.options, nearest = data && data.nearest, market = data && data.market, dvol = data && data.dvol;
    text('optionsStatus', data ? data.currency + (data.isProxy ? ' proxy informativo | ' + datasetStatus(data) + ' | fora do Setup Score' : ' nativo | ' + datasetStatus(data) + (!eligibleDataset(data) ? ' | fora do score' : '')) : 'sem leitura');
    // toFiniteNumber: +null coage para 0 e o painel afirmaria "DVOL 0.00" quando o indice
    // simplesmente nao existe (caso SOL na Deribit).
    text('dvolLine', dvol && AnalyticsCore.toFiniteNumber(dvol.latest) !== null ? num(finiteNumber(dvol.latest), 2) + ' | 7d ' + (AnalyticsCore.toFiniteNumber(dvol.change7d) !== null ? percent(finiteNumber(dvol.change7d), 1) : '--') : '--');
    var atmIv = finiteNumber(nearest && nearest.atmIv), atmStrike = finiteNumber(nearest && nearest.atmStrike);
    var putCallOi = finiteNumber(market && market.putCallOi), putOi = finiteNumber(market && market.putOi), callOi = finiteNumber(market && market.callOi);
    var putCallVolume = finiteNumber(market && market.putCallVolume), putVolume = finiteNumber(market && market.putVolumeUsd), callVolume = finiteNumber(market && market.callVolumeUsd);
    var maxPain = finiteNumber(nearest && nearest.maxPain), expectedMove = finiteNumber(nearest && nearest.expectedMove), expectedLow = finiteNumber(nearest && nearest.expectedLow), expectedHigh = finiteNumber(nearest && nearest.expectedHigh);
    text('atmIvLine', Number.isFinite(atmIv) ? num(atmIv, 2) + '% @ ' + money(atmStrike) : '--');
    text('putCallOiLine', Number.isFinite(putCallOi) ? num(putCallOi, 2) + 'x | OI ' + num(putOi, 1) + '/' + num(callOi, 1) : '--');
    text('putCallVolumeLine', Number.isFinite(putCallVolume) ? num(putCallVolume, 2) + 'x | ' + compactMoney(putVolume) + '/' + compactMoney(callVolume) : '--');
    text('maxPainLine', Number.isFinite(maxPain) ? money(maxPain) : '--');
    text('expectedMoveLine', Number.isFinite(expectedMove) ? '+/- ' + money(expectedMove) + ' | ' + money(expectedLow) + ' a ' + money(expectedHigh) : '--');
    text('callGreeksLine', nearest ? formatGreeks(nearest.call) : '--');
    text('putGreeksLine', nearest ? formatGreeks(nearest.put) : '--');
    var optionExpiry = finiteNumber(nearest && nearest.expiry), daysToExpiry = finiteNumber(nearest && nearest.daysToExpiry), optionInstruments = finiteNumber(market && market.instruments);
    text('optionsCaption', nearest ? (data.isProxy ? 'Proxy BTC para contexto visual de ' + data.requestedAsset + '; contribuicao e Data Confidence iguais a zero. ' : '') + 'Vencimento ' + (Number.isFinite(optionExpiry) ? new Date(optionExpiry).toLocaleDateString('pt-BR') : '--') + ' (' + num(daysToExpiry, 1) + ' dias) | ' + (Number.isFinite(optionInstruments) ? optionInstruments : '--') + ' instrumentos ativos | expected move por IV ATM.' : 'Opcoes indisponiveis para o ativo; nenhum valor e imputado ao score.');
  }
  function renderExchangeFlows(a) {
    var metrics = a && a.coinMetrics, flow = metrics && metrics.exchangeFlow;
    var hasFlow = flow && Number.isFinite(flow.netflow1d), eligibleFlow = hasFlow && eligibleDataset(metrics);
    text('exchangeFlowStatus', hasFlow ? metrics.asset.toUpperCase() + ' | ' + (flow.time ? new Date(flow.time).toLocaleDateString('pt-BR') : 'diario') + (flow.status ? ' | ' + flow.status : '') + (eligibleFlow ? '' : ' | stale/fora do score') : 'sem cobertura');
    text('exchangeInflow1d', hasFlow ? compactMoney(flow.inflow1d) : '--');
    text('exchangeOutflow1d', hasFlow ? compactMoney(flow.outflow1d) : '--');
    text('exchangeNetflow1d', hasFlow ? compactMoney(flow.netflow1d) : '--');
    text('exchangeNetflow7d', flow && Number.isFinite(flow.netflow7d) ? compactMoney(flow.netflow7d) + ' (' + flow.flowCoverageDays + '/' + flow.flowWindowDays + 'd)' : flow && flow.flowWindowDays ? 'cobertura ' + flow.flowCoverageDays + '/' + flow.flowWindowDays + 'd insuficiente' : '--');
    text('exchangeSupply', flow && Number.isFinite(flow.supplyNative) ? compactNumber(flow.supplyNative) + ' ' + baseAsset(state.symbol) : '--');
    var signal = !hasFlow ? 'Indisponivel' : !Number.isFinite(flow.netflow7d) ? 'Cobertura insuficiente' : flow.netflow7d > 0 ? 'Net inflow / oferta potencial' : flow.netflow7d < 0 ? 'Net outflow / retirada liquida' : 'Equilibrado';
    text('exchangeFlowSignal', signal);
  }
  function nestedRows(payload, depth) {
    if (!payload || (depth || 0) > 6) return [];
    if (Array.isArray(payload)) return payload;
    var keys = ['data', 'flows', 'items', 'results', 'history', 'days', 'rows'];
    for (var i = 0; i < keys.length; i++) if (Array.isArray(payload[keys[i]]) && payload[keys[i]].length) return payload[keys[i]];
    for (var j = 0; j < keys.length; j++) {
      var nested = payload[keys[j]];
      if (nested && typeof nested === 'object') {
        var rows = nestedRows(nested, (depth || 0) + 1);
        if (rows.length) return rows;
      }
    }
    return [];
  }
  function etfFlowValue(row) {
    if (!row) return NaN;
    var millions = finiteNumber(row.netFlowUsdM);
    if (Number.isFinite(millions)) return millions * 1000000;
    var candidates = [row.flow_usd, row.net_flow_usd, row.netFlowUsd, row.net_flow, row.flow, row.total];
    for (var i = 0; i < candidates.length; i++) {
      var value = finiteNumber(candidates[i]);
      if (Number.isFinite(value)) return value;
    }
    return NaN;
  }
  function etfReportedRow(row) {
    return !!AnalyticsCore.classifyEtfFlowObservation(row, etfFlowValue(row)).reported;
  }
  function latestEtfFlow(institutional) {
    if (!eligibleDataset(institutional)) return NaN;
    var rows = institutional && institutional.etf ? nestedRows(institutional.etf.flows) : [];
    var reported = rows.filter(etfReportedRow);
    var latest = AnalyticsCore.latestTimestampedRow(reported, ['date', 'day', 'timestamp', 'time'], Date.now());
    return latest ? etfFlowValue(latest) : NaN;
  }
  function renderInstitutional() {
    var data = state.institutional || { configured: {} }, configured = data.configured || {};
    var etfReady = !!(configured.etf && data.etf);
    var etfEligible = etfReady && eligibleDataset(data);
    text('institutionalStatus', etfReady ? (etfEligible ? 'Fonte gratuita fresh' : 'Fonte stale | fora do score') : configured.etf ? 'Fonte indisponivel' : 'Ativo sem ETF coberto');
    text('etfStatus', etfReady ? (etfEligible ? 'Conectado' : 'Stale') : configured.etf ? 'Falhou' : 'Ativo sem ETF coberto');
    var etfNode = $('etfStatus');
    if (etfNode) etfNode.className = etfEligible ? 'status-ready' : etfReady ? 'status-key' : configured.etf ? 'status-fail' : 'status-key';
    var etfRows = data.etf ? nestedRows(data.etf.flows) : [];
    var displayEtfRows = etfRows.filter(etfReportedRow);
    displayEtfRows = displayEtfRows.slice().sort(function (a, b) { return timestampMs(a && (a.date || a.day || a.timestamp || a.time)) - timestampMs(b && (b.date || b.day || b.timestamp || b.time)); });
    var etfList = $('etfFlowList');
    if (etfList) etfList.innerHTML = displayEtfRows.length ? displayEtfRows.slice(-10).reverse().map(function (row) {
      var date = row.date || row.day || row.timestamp || row.time || '--';
      var flow = etfFlowValue(row);
      return '<div class="institutional-row"><div><strong>' + escapeHTML(String(date).slice(0, 10)) + '</strong><span>' + escapeHTML(row.asset || baseAsset(state.symbol)) + ' ETF net flow</span></div><strong class="' + (flow >= 0 ? 'up' : 'down') + '">' + compactMoney(flow) + '</strong></div>';
    }).join('') : '<div class="institutional-row"><div><strong>' + (configured.etf ? 'Sem fluxos retornados' : 'Ativo sem ETF coberto') + '</strong><span>A fonte publica cobre BTC, ETH, SOL, XRP e HYPE.</span></div></div>';
    var errors = data.errors || {};
    text('institutionalCaption', errors.etf ? 'CryptoETF publico: ' + errors.etf + '.' : 'Dados obtidos por fonte publica sem chave; placeholders de fins de semana e feriados dos EUA ficam fora do score.');
    var cftc = data.cftc && data.cftc.latest;
    var cftcObservedAt = finiteNumber(data.cftc && data.cftc.observedAt);
    var cftcFresh = AnalyticsCore.classifyFreshness(cftcObservedAt, 10 * 24 * 60 * 60 * 1000, Date.now()).eligibleForScore;
    text('cftcStatus', cftc ? (cftcFresh ? 'Semanal fresh | informativo' : 'Stale | informativo') : 'Indisponivel');
    var nonCommNet = finiteNumber(cftc && cftc.nonCommercialNet), nonCommChange = finiteNumber(cftc && cftc.changeNonCommercialNet), commercialNet = finiteNumber(cftc && cftc.commercialNet), cftcOi = finiteNumber(cftc && cftc.openInterest);
    text('cftcNonCommNet', Number.isFinite(nonCommNet) ? signed(nonCommNet) + ' contratos' : '--');
    text('cftcNonCommChange', Number.isFinite(nonCommChange) ? signed(nonCommChange) + ' contratos' : '--');
    text('cftcCommercialNet', Number.isFinite(commercialNet) ? signed(commercialNet) + ' contratos' : '--');
    text('cftcOpenInterest', Number.isFinite(cftcOi) ? num(cftcOi, 0) + ' contratos' : '--');
    text('cftcCaption', cftc ? 'CFTC Legacy Futures Only, CME Bitcoin, data do relatorio ' + new Date(cftcObservedAt).toLocaleDateString('pt-BR') + '. Contratos nao equivalem diretamente a BTC ou USD e ainda nao alteram os scores.' : errors.cftc ? 'CFTC: ' + errors.cftc + '.' : 'CFTC sem leitura.');
  }
  function renderMacroFlow(a) {
    var ext = state.external || {}, markets = ext.coinMarkets || {};
    function marketChange(id, field) { var row = markets[id]; return finiteNumber(row && row[field]); }
    var btc7 = marketChange('bitcoin', 'price_change_percentage_7d_in_currency');
    var eth7 = marketChange('ethereum', 'price_change_percentage_7d_in_currency');
    var selected7 = marketChange(contextFor(state.symbol).gecko, 'price_change_percentage_7d_in_currency');
    var stable7 = ext.stablecoinChanges ? ext.stablecoinChanges.week : NaN;
    var defi7Rows = (ext.chains || []).filter(function (row) { return Number.isFinite(finiteNumber(row && row.change_7d)) && finiteNumber(row && row.tvl) > 100000000; }).slice(0, 20);
    var defi7 = defi7Rows.length ? avg(defi7Rows.map(function (row) { return +row.change_7d; })) : NaN;
    var nodes = [
      { name: 'Bitcoin', value: btc7, suffix: '7d' },
      { name: 'Ethereum', value: eth7, suffix: '7d' },
      { name: 'Stablecoins', value: stable7, suffix: 'supply 7d' },
      { name: 'DeFi chains', value: defi7, suffix: 'TVL 7d' },
      { name: 'DEX', value: ext.dexChange, suffix: 'volume 24h' }
    ];
    if (state.symbol !== 'BTCUSDT' && state.symbol !== 'ETHUSDT') nodes.splice(2, 0, { name: baseAsset(state.symbol), value: selected7, suffix: '7d' });
    var rotationComparator = state.symbol === 'BTCUSDT' ? eth7 : selected7;
    var rotation = Number.isFinite(btc7) && Number.isFinite(rotationComparator) ? (rotationComparator > btc7 + 4 ? 'Rotacao para alts' : btc7 > rotationComparator + 4 ? 'Preferencia por BTC' : 'Fluxo equilibrado') : 'Cobertura parcial';
    text('moneyFlowRegime', rotation);
    var grid = $('moneyFlowGrid');
    if (grid) grid.innerHTML = nodes.map(function (item) {
      var cls = item.value > 0.5 ? 'good' : item.value < -0.5 ? 'bad' : '';
      return '<div class="flow-node ' + cls + '"><span>' + escapeHTML(item.name) + ' | ' + escapeHTML(item.suffix) + '</span><strong>' + percent(item.value, 2) + '</strong></div>';
    }).join('');
    var tradfi = activeTradFiAssets(ext.tradfi);
    text('tradfiStatus', tradfi.length ? tradfi.length + ' mercados EOD' : 'sem leitura');
    var tradfiGrid = $('tradfiGrid');
    if (tradfiGrid) tradfiGrid.innerHTML = tradfi.length ? tradfi.map(function (item) {
      return '<div class="tradfi-item"><span>' + escapeHTML(item.symbol + ' | ' + item.group) + '</span><strong>' + money(finiteNumber(item.close)) + ' | 5d ' + percent(finiteNumber(item.change5d), 2) + '</strong></div>';
    }).join('') : '<div class="tradfi-item"><span>Fonte EOD</span><strong>Indisponivel agora</strong></div>';
    renderMicrostructure(a);
    renderCoverage(a);
  }
  function renderMicrostructure(a) {
    var data = a && a.microstructure || state.microstructure;
    var eligible = eligibleDataset(data);
    var flow = data && data.orderFlow || {};
    var flowEligible = eligible && sourceObservationFresh(flow.observedAt || flow.lastTradeAt, MICROSTRUCTURE_STALE_MS);
    var venuesEligible = eligible && sourceObservationFresh(data && data.venuesObservedAt, MICROSTRUCTURE_STALE_MS);
    var venueCount = data && Array.isArray(data.venues) ? data.venues.length : 0;
    var failedSources = data && data.errors ? Object.keys(data.errors) : [];
    text('microstructureStatus', data ? datasetStatus(data) + ' | ' + venueCount + '/4 venues | informativo' : 'sem leitura');
    var cvdUsd = finiteNumber(flow.cvdUsd), imbalancePct = finiteNumber(flow.imbalancePct), coinbasePremium = finiteNumber(data && data.coinbasePremiumBps), dispersion = finiteNumber(data && data.dispersionBps);
    text('cvdUsdLine', flowEligible && Number.isFinite(cvdUsd) ? compactMoney(cvdUsd) : '--');
    text('takerImbalanceLine', flowEligible && Number.isFinite(imbalancePct) ? percent(imbalancePct, 1) : '--');
    text('coinbasePremiumLine', venuesEligible && Number.isFinite(coinbasePremium) ? num(coinbasePremium, 2) + ' bps' : '--');
    text('venueDispersionLine', venuesEligible && Number.isFinite(dispersion) ? num(dispersion, 2) + ' bps' : '--');
    var rows = $('venuePriceRows');
    if (rows) rows.innerHTML = venuesEligible && data && Array.isArray(data.venues) && data.venues.length ? data.venues.map(function (venue) {
      var price = finiteNumber(venue.price), premiumBps = finiteNumber(venue.premiumBps);
      return '<div class="institutional-row"><div><strong>' + escapeHTML(venue.name) + '</strong><span>premium vs mediana | ' + escapeHTML(venue.quoteCurrency || 'USDT') + '</span></div><strong>' + money(price) + ' | ' + (Number.isFinite(premiumBps) ? num(premiumBps, 2) + ' bps' : '--') + '</strong></div>';
    }).join('') : '<div class="institutional-row"><div><strong>Sem venues</strong><span>Fonte publica indisponivel agora</span></div></div>';
    var failureNote = failedSources.length ? ' Fontes indisponiveis: ' + failedSources.join(', ') + '.' : '';
    var firstTradeAt = finiteNumber(flow.firstTradeAt), lastTradeAt = finiteNumber(flow.lastTradeAt);
    var comparisonNote = ' Coinbase USD e convertido pela cotacao USDT-USD; venues fora da janela de 30s sao excluidos.';
    text('microstructureCaption', (flowEligible && Number.isFinite(firstTradeAt) && Number.isFinite(lastTradeAt)
      ? flow.trades + ' aggTrades Binance entre ' + new Date(firstTradeAt).toLocaleTimeString('pt-BR') + ' e ' + new Date(lastTradeAt).toLocaleTimeString('pt-BR') + '. CVD e premiums sao informativos e nao alteram o Setup Score.'
      : 'CVD e premiums sao informativos e nao alteram o Setup Score.') + comparisonNote + failureNote);
  }
  function renderCoverage(a) {
    var freshNewsCount = freshNewsItems().length;
    var derivativeCoverageInfo = AnalyticsCore.derivativeCoverage(scoreableDerivativeDetail(a.derivativeDetail));
    var checks = [
      { name: 'Candles Binance', ok: state.klines.length >= 220, detail: state.klines.length + ' candles' },
      { name: 'Multi-timeframe', ok: !!(state.mtf && state.mtf.rows.length >= 5), detail: state.mtf ? state.mtf.rows.length + ' TFs' : 'aguardando' },
      { name: 'Historico completo', ok: historyFresh(a.history), detail: historyFresh(a.history) ? a.history.candles + ' dias' : 'carregando ou stale' },
      // UX-001: status por metrica real — nada de OR de 6 metricas com rotulo estatico.
      { name: 'Derivativos', ok: derivativeCoverageInfo.state === 'ok', warn: derivativeCoverageInfo.state === 'partial', detail: derivativeCoverageInfo.label },
      { name: 'On-chain no score', ok: eligibleDataset(a.coinMetrics) || !!(a.mempoolContext && a.mempoolContext.eligibleForScore), detail: a.coinMetrics ? a.coinMetrics.asset.toUpperCase() + ' | ' + datasetStatus(a.coinMetrics) : a.mempoolContext && a.mempoolContext.eligibleForScore ? 'mempool BTC nativo' : 'sem cobertura' },
      { name: 'Livro e execucao', ok: Number.isFinite(a.spreadBps), detail: Number.isFinite(a.spreadBps) ? num(a.spreadBps, 2) + ' bps' : 'sem leitura' },
      { name: 'Microestrutura informativa', ok: !!(a.microstructure && eligibleDataset(a.microstructure)), detail: a.microstructure && Array.isArray(a.microstructure.venues) ? a.microstructure.venues.length + ' venues + CVD' : 'sem leitura' },
      { name: 'Noticias', ok: freshNewsCount > 0, detail: freshNewsCount + ' itens fresh' },
      { name: 'Macro oficial', ok: externalContextFresh() && macroSourceAvailable(state.external.macro), detail: externalContextFresh() && macroSourceAvailable(state.external.macro) ? 'Treasury / VIX' : 'stale' },
      { name: 'TradFi', ok: externalContextFresh() && activeTradFiAssets(state.external.tradfi).length > 0, detail: externalContextFresh() && activeTradFiAssets(state.external.tradfi).length ? 'acoes e ETFs EOD' : 'stale' },
      { name: 'Liquidacoes reais', ok: state.liquidationConnected, detail: 'Binance forceOrder live' },
      { name: 'Opcoes / IV no score', ok: !!(state.options && state.options.market && eligibleDataset(state.options)), detail: state.options && state.options.isProxy ? 'proxy BTC apenas informativo' : 'Deribit options e DVOL' },
      { name: 'Exchange flows no score', ok: !!(eligibleDataset(a.coinMetrics) && a.coinMetrics.exchangeFlow && Number.isFinite(a.coinMetrics.exchangeFlow.netflow1d)), detail: 'Coin Metrics diario' },
      { name: 'ETF flows no score', ok: !!(eligibleDataset(state.institutional) && state.institutional.etf), detail: state.institutional && state.institutional.configured && state.institutional.configured.etf ? 'CryptoETF conectado' : 'ativo sem ETF coberto' }
    ];
    var covered = checks.filter(function (check) { return check.ok; }).length;
    text('coverageSummary', covered + '/' + checks.length + ' blocos');
    var grid = $('coverageGrid');
    if (grid) grid.innerHTML = checks.map(function (check) {
      var stateClass = check.ok ? 'ok' : check.warn ? 'warn' : 'fail';
      var prefix = check.ok ? 'Coberto | ' : check.warn ? 'Parcial | ' : '';
      return '<div class="coverage-item ' + stateClass + '"><span>' + escapeHTML(check.name) + '</span><strong>' + escapeHTML(prefix + check.detail) + '</strong></div>';
    }).join('');
  }
  function calculatorNumber(id) { var node = $(id); if (!node || String(node.value).trim() === '') return NaN; var value = +node.value; return Number.isFinite(value) ? value : NaN; }
  function calculatorValue(id, fallback) { var value = calculatorNumber(id); return Number.isFinite(value) ? value : fallback; }
  function calculatePosition() {
    var modeNode = $('calcMode'), sideNode = $('calcSide');
    var calculatorMode = modeNode ? modeNode.value : 'spot';
    if (sideNode) {
      if (calculatorMode === 'spot') sideNode.value = 'long';
      sideNode.disabled = calculatorMode === 'spot';
      sideNode.title = calculatorMode === 'spot' ? 'Spot usa compra/long; short exige a modalidade Futuros.' : '';
    }
    var currentQty = calculatorNumber('calcCurrentQty');
    var currentPrice = calculatorNumber('calcCurrentPrice');
    var rawAddMultiple = calculatorValue('calcAddMultiple', 0);
    var addMultiple = Math.max(0, rawAddMultiple);
    var addPrice = calculatorNumber('calcAddPrice');
    var addLegIncomplete = addMultiple > 0 && (!Number.isFinite(addPrice) || addPrice <= 0);
    if (addLegIncomplete) addMultiple = 0;
    var baseIncomplete = !Number.isFinite(currentQty) || currentQty <= 0 || !Number.isFinite(currentPrice) || currentPrice <= 0;
    if (baseIncomplete) {
      ['calcFinalQty', 'calcAveragePrice', 'calcNotional', 'calcFees', 'calcMargin', 'calcBreakEven', 'calcLiquidation'].forEach(function (id) { text(id, '--'); });
      text('calculatorModeLabel', calculatorMode === 'futures' ? 'Futuros' : 'Spot');
      text('calculatorNote', 'Preencha quantidade e preco atuais com valores maiores que zero para calcular a posicao.');
      return;
    }
    var rawCalculator = {
      mode: calculatorMode,
      side: sideNode ? sideNode.value : 'long',
      currentQty: currentQty,
      currentPrice: currentPrice,
      addMultiple: addMultiple,
      addPrice: calculatorValue('calcAddPrice', 0),
      entryFeePct: calculatorValue('calcEntryFee', 0),
      exitFeePct: calculatorValue('calcExitFee', 0),
      leverage: calculatorValue('calcLeverage', 1),
      fundingRatePct: calculatorValue('calcFunding', 0),
      fundingPeriods: calculatorValue('calcFundingPeriods', 0),
      maintenancePct: calculatorValue('calcMaintenance', 0)
    };
    var result = AnalyticsCore.calculatePosition(rawCalculator);
    var boundsAdjusted = result.currentQty !== rawCalculator.currentQty
      || result.currentPrice !== rawCalculator.currentPrice
      || result.addMultiple !== rawCalculator.addMultiple
      || result.addPrice !== rawCalculator.addPrice
      || result.entryFeePct !== rawCalculator.entryFeePct
      || result.exitFeePct !== rawCalculator.exitFeePct
      || result.leverage !== rawCalculator.leverage
      || result.fundingRatePct !== rawCalculator.fundingRatePct
      || result.fundingPeriods !== Math.floor(rawCalculator.fundingPeriods)
      || result.maintenancePct !== rawCalculator.maintenancePct;
    text('calculatorModeLabel', result.mode === 'futures' ? 'Futuros ' + num(result.leverage, 0) + 'x' : 'Spot');
    text('calcFinalQty', num(result.quantity, 8) + ' ' + baseAsset(state.symbol));
    text('calcAveragePrice', money(result.averageWithEntryFee));
    text('calcNotional', compactMoney(result.notional));
    text('calcFees', money(result.totalCosts));
    text('calcMargin', money(result.margin));
    text('calcBreakEven', money(result.breakEven));
    text('calcLiquidation', Number.isFinite(result.liquidationPrice) && result.leverage > 1 ? money(Math.max(0, result.liquidationPrice)) + ' aprox.' : '--');
    text('calculatorNote', (boundsAdjusted ? 'Valores fora dos limites declarados foram ajustados antes do calculo. ' : '') + (rawAddMultiple < 0 ? 'Multiplo negativo ajustado para zero. ' : '') + (addLegIncomplete ? 'Preco da nova entrada vazio ou invalido; calculando sem a nova perna. ' : '') + 'Funding positivo: long paga e short recebe; funding negativo inverte os lados. Custos liquidos positivos sao pagos pela posicao e negativos representam credito. Liquidacao continua aproximada.');
  }
  function applyIndicatorHelp() {
    var help = {
      'EMA 9': 'Media exponencial curta. Preco acima sugere impulso de curto prazo; cruzamentos isolados geram ruido.',
      'EMA 21': 'Media exponencial de curto/medio prazo, util para pullbacks e direcao taticos.',
      'EMA 50': 'Media de tendencia intermediaria. A relacao com a EMA 200 forma golden/death crosses.',
      'EMA 200': 'Referencia estrutural de longo prazo. Preco e EMA 50 acima dela favorecem regime de alta.',
      'RSI 14': 'Momentum de 0 a 100. Acima de 70 pode indicar esticamento; abaixo de 30, sobrevenda. Leia junto da tendencia.',
      'Stoch RSI': 'Posicao do RSI dentro de sua faixa recente. E rapido e sensivel; funciona melhor como timing.',
      'MACD': 'Diferenca entre EMAs 12 e 26. Histograma acima de zero indica momentum acelerando para cima.',
      'MFI': 'RSI ponderado por volume. Ajuda a observar pressao compradora ou vendedora com fluxo.',
      'ATR 14': 'Volatilidade media verdadeira. Serve para dimensionar stop, alvo e tamanho da posicao; nao indica direcao.',
      'Bandas BB': 'Envelope de dois desvios em torno da media de 20. Largura mede compressao/expansao de volatilidade.',
      'VWAP': 'Preco medio ponderado por volume na janela. Acima sugere aceitacao compradora; abaixo, pressao vendedora.',
      'Vol/Media': 'Volume do candle atual dividido pela media recente. Acima de 1,35x fortalece rompimentos.',
      'ADX / DI': 'ADX mede forca, nao direcao. DI+ acima de DI- favorece alta; ADX acima de 25 indica tendencia mais forte.',
      'Supertrend': 'Filtro de tendencia baseado em ATR. Mudancas devem ser confirmadas no fechamento do candle.',
      'Keltner': 'Canal por EMA e ATR. Ajuda a separar tendencia, compressao e movimentos esticados.',
      'Donchian': 'Maxima e minima da janela. Rompimentos mostram expansao, mas exigem confirmacao para evitar traps.',
      'BB %B / Width': '%B localiza o preco dentro das Bandas; Width mede compressao ou expansao de volatilidade.',
      'ROC 12': 'Variacao percentual em 12 candles. Mostra velocidade do movimento e divergencias de momentum.',
      'OBV': 'Volume acumulado pela direcao do fechamento. Divergencias podem antecipar perda de tendencia.',
      'CMF 20': 'Fluxo de Chaikin entre -1 e 1. Acima de 0,05 sugere acumulacao; abaixo de -0,05, distribuicao.',
      'Vol realizada': 'Volatilidade anualizada dos retornos recentes. Eleva risco e amplia stops necessarios.',
      'Z-score 20': 'Distancia do preco para a media em desvios-padrao. Extremos ajudam a medir esticamento, nao reversao garantida.',
      'Williams %R': 'Oscilador de -100 a 0. Abaixo de -80 indica sobrevenda; acima de -20, sobrecompra.',
      'CCI 20': 'Desvio do preco tipico em relacao a media. Leituras acima de 100 ou abaixo de -100 mostram impulso forte.',
      'Ichimoku': 'Conjunto de tendencia, suporte e momentum. Preco acima da nuvem favorece alta; abaixo favorece baixa.',
      'Regime': 'Classificacao conjunta de tendencia estrutural, forca e volatilidade.',
      'Longs liquidados 15m': 'Notional das liquidacoes de posicoes long observadas no stream Binance nos ultimos 15 minutos.',
      'Shorts liquidados 15m': 'Notional das liquidacoes de posicoes short observadas no stream Binance nos ultimos 15 minutos.',
      'Imbalance 15m': 'Positivo indica maior liquidacao de shorts; negativo indica maior liquidacao de longs.',
      'DVOL / 7d': 'Indice de volatilidade implicita da Deribit e sua variacao em sete dias.',
      'IV ATM': 'Volatilidade implicita media das opcoes call e put mais proximas do preco do ativo.',
      'Put/Call OI': 'Open interest de puts dividido pelo de calls. Nao e sinal direcional isolado.',
      'Put/Call volume': 'Volume em USD de puts dividido pelo de calls nas ultimas 24 horas.',
      'Max pain': 'Strike que minimiza o pagamento teorico agregado no vencimento selecionado.',
      'Expected move': 'Movimento de um desvio estimado pela IV ATM ate o vencimento; nao e intervalo garantido.',
      'Inflows 1d': 'Valor enviado para enderecos de exchanges no dia, segundo rotulagem da Coin Metrics.',
      'Outflows 1d': 'Valor retirado de enderecos de exchanges no dia, segundo rotulagem da Coin Metrics.',
      'Netflow 7d': 'Inflows menos outflows em sete dias. Positivo representa entrada liquida em exchanges.'
    };
    document.querySelectorAll('.metric-grid > div').forEach(function (card) {
      var label = card.querySelector('span');
      if (!label) return;
      var description = help[label.textContent.trim()];
      if (!description) return;
      card.setAttribute('data-help', description);
      card.setAttribute('title', description);
      card.tabIndex = 0;
    });
  }
  function renderOverviewDashboard() {
    if (!state.board.length) return;
    var rows = state.board.slice().sort(function (a, b) { return sortableScore(b.analysis) - sortableScore(a.analysis); });
    var scored = rows.filter(function (item) { return Number.isFinite(item.analysis.score); });
    var best = scored[0], worst = scored[scored.length - 1];
    var ext = state.external || {};
    var global = activeGlobalMarket(ext) || {};
    var paprika = ext.paprikaGlobal || {};
    var totalMcap = firstFinite([global.total_market_cap && global.total_market_cap.usd, paprika.market_cap_usd]);
    var globalChange = firstFinite([global.market_cap_change_percentage_24h_usd, paprika.market_cap_change_24h]);
    text('overviewBestAsset', best ? baseAsset(best.symbol) : '--');
    text('overviewBestScore', best ? 'Radar Score ' + signed(best.analysis.score) + ' | ' + best.analysis.bias + ' | DC preview ' + best.analysis.radar.dataConfidence + '%' : '--');
    text('overviewRiskAsset', worst ? baseAsset(worst.symbol) : '--');
    text('overviewRiskScore', worst ? 'Radar Score ' + signed(worst.analysis.score) + ' | ' + worst.analysis.bias + ' | DC preview ' + worst.analysis.radar.dataConfidence + '%' : '--');
    text('overviewMarketCap', compactUsd(totalMcap));
    text('overviewMarketMove', Number.isFinite(globalChange) ? '24h ' + percent(globalChange, 2) : '--');
    text('overviewDefiTvl', compactUsd(finiteNumber(ext.defiTvl)));
    text('overviewDexVolume', 'DEX 24h ' + compactUsd(finiteNumber(ext.dexVolume)));
    text('overviewFearGreed', fearGreedEligible(ext) ? ext.fearGreed.value + ' ' + ext.fearGreed.label : '--');
    text('overviewContextScore', 'Contexto ' + (state.analysis && eligibleDataset(state.analysis.external) ? signed(state.analysis.external.total) : '--'));
    text('overviewUpdated', ext.fetchedAt ? (externalContextFresh() ? 'Atualizado ' : 'Stale desde ') + new Date(ext.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--');
    var bulls = rows.filter(function (x) { return x.analysis.score >= 35; }).length;
    var bears = rows.filter(function (x) { return x.analysis.score <= -35; }).length;
    text('overviewSummary', counted(bulls, 'ativo com viés comprador', 'ativos com viés comprador') + ', ' + counted(bears, 'ativo com pressão vendedora', 'ativos com pressão vendedora') + '. Clique em um ativo para abrir a análise individual.');
    renderOverviewList('overviewLeaders', rows.slice(0, 5), true);
    renderOverviewList('overviewRisks', rows.slice(-5).reverse(), false);
    text('leadersCount', String(Math.min(5, rows.length)));
    text('risksCount', String(Math.min(5, rows.length)));
  }
  function renderOverviewList(id, rows, leaders) {
    var node = $(id); if (!node) return;
    node.innerHTML = rows.map(function (item) {
      var a = item.analysis;
      var desc = (leaders ? a.bias : 'Risco') + ' | RSI ' + num(a.rsi14, 0) + ' | contexto ' + signed(a.external ? a.external.total : 0) + ' | DC ' + (a.radar ? a.radar.dataConfidence : 0) + '%';
      return '<div class="compact-row"><button type="button" data-symbol="' + escapeHTML(item.symbol) + '"><span class="token">' + escapeHTML(baseAsset(item.symbol)) + '</span><span class="desc">' + escapeHTML(desc) + '</span><span class="score">' + (Number.isFinite(a.score) ? signed(a.score) : '--') + '</span></button></div>';
    }).join('');
  }
  function renderSourceHealth(ext) {
    function tracked(name, fallbackOk, fallbackDetail) {
      var item = state.apiHealth[name];
      var ok = item ? item.ok : !!fallbackOk;
      var stale = item && !item.ok && item.lastSuccess;
      return { name: name, ok: ok, status: ok ? 'ok' : stale ? 'warn' : 'fail', detail: item && !item.ok ? item.detail + (stale ? ' | ultimo sucesso sem garantia de atualidade' : '') : (fallbackDetail || (ok ? 'online' : 'sem leitura')) };
    }
    var profileCount = Object.keys(state.historyProfiles).filter(function (symbol) { return historyFresh(state.historyProfiles[symbol]); }).length;
    var institution = state.institutional || { configured: {} }, configured = institution.configured || {};
    var exchangeFlow = state.coinMetrics && state.coinMetrics.exchangeFlow;
    var sources = [
      tracked('Binance spot', !!state.klines.length, intervalLabel(state.interval) + ' / ' + state.klines.length + ' candles'),
      tracked('Binance MTF', !!(state.mtf && state.mtf.rows.length), state.mtf ? state.mtf.rows.length + ' timeframes' : 'aguardando'),
      tracked('Binance futuros', hasDerivativeData(state.analysis && state.analysis.derivativeDetail), 'OI/funding/long-short'),
      tracked('Binance liquidations', state.liquidationConnected, state.liquidationConnected ? 'forceOrder live' : 'reconectando'),
      tracked('Binance historico', profileCount > 0, profileCount + '/' + ASSETS.length + ' ativos'),
      { name: 'Coin Metrics', ok: eligibleDataset(state.coinMetrics), status: eligibleDataset(state.coinMetrics) ? 'ok' : state.coinMetrics ? 'warn' : 'fail', detail: state.coinMetrics ? state.coinMetrics.asset.toUpperCase() + ' | ' + datasetStatus(state.coinMetrics) : 'sem cobertura do ativo' },
      { name: 'Coin Metrics flows', ok: !!(eligibleDataset(state.coinMetrics) && exchangeFlow && Number.isFinite(exchangeFlow.netflow1d)), status: eligibleDataset(state.coinMetrics) && exchangeFlow && Number.isFinite(exchangeFlow.netflow1d) ? 'ok' : state.coinMetrics ? 'warn' : 'fail', detail: exchangeFlow && Number.isFinite(exchangeFlow.netflow1d) ? 'exchange netflow diario | ' + datasetStatus(state.coinMetrics) : 'sem cobertura do ativo' },
      { name: 'Deribit options', ok: !!(state.options && state.options.market && (state.options.isProxy ? datasetStatus(state.options) === 'informational' : eligibleDataset(state.options))), status: state.options && state.options.market && (state.options.isProxy ? datasetStatus(state.options) === 'informational' : eligibleDataset(state.options)) ? 'ok' : state.options ? 'warn' : 'fail', detail: state.options ? state.options.currency + (state.options.isProxy ? ' proxy ' + datasetStatus(state.options) : ' | ' + datasetStatus(state.options)) : 'sem leitura' },
      tracked('mempool.space', !!(state.chain && state.chain.height), state.chain && state.chain.height ? 'BTC on-chain' : 'sem leitura'),
      { name: 'Noticias RSS', ok: freshNewsItems().length > 0, status: freshNewsItems().length > 0 ? 'ok' : state.news.length ? 'warn' : 'fail', detail: freshNewsItems().length + ' noticias fresh' },
      { name: 'Crypto ETF flows', ok: !!(configured.etf && institution.etf && eligibleDataset(institution)), status: configured.etf ? (institution.etf && eligibleDataset(institution) ? 'ok' : institution.etf ? 'warn' : 'fail') : 'warn', detail: configured.etf ? (institution.etf ? datasetStatus(institution) : 'falhou') : 'ativo sem ETF coberto' },
      { name: 'Motor quantitativo', ok: !!(state.quantChecks && state.quantChecks.ok), status: state.quantChecks && state.quantChecks.ok ? 'ok' : 'fail', detail: state.quantChecks ? state.quantChecks.passed + '/' + state.quantChecks.total + ' testes' : 'nao testado' }
    ].concat(((ext && ext.sources) || []).map(function (item) {
      var copy = Object.assign({}, item);
      if (!externalContextFresh()) {
        copy.ok = false;
        copy.status = 'warn';
        copy.detail = (copy.detail || 'fonte externa') + ' | stale';
      } else copy.status = copy.ok ? 'ok' : 'warn';
      return copy;
    }));
    var ok = sources.filter(function (item) { return item.ok; }).length;
    text('sourceCount', ok + '/' + sources.length + ' online');
    var list = $('dataSources');
    if (!list) return;
    list.innerHTML = sources.map(function (item) {
      var cls = item.status || (item.ok ? 'ok' : 'warn');
      return '<div class="source-pill ' + cls + '"><strong>' + escapeHTML(item.name) + '</strong><span>' + escapeHTML(item.detail) + '</span></div>';
    }).join('');
  }
  function setupCanvas(canvas) {
    var box = canvas.getBoundingClientRect(); var dpr = window.devicePixelRatio || 1;
    if (box.width < 1 || box.height < 1) return null;
    canvas.width = Math.max(320, Math.floor(box.width * dpr)); canvas.height = Math.max(220, Math.floor(box.height * dpr));
    var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx: ctx, w: box.width, h: box.height };
  }
  function drawPriceChart() {
    var canvas = $('priceCanvas'); if (!canvas || !state.klines.length) return;
    var c = setupCanvas(canvas); if (!c) return;
    var ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, w, h);
    var allCandles = state.klines, visibleCount = clamp(+state.chart.candles || 120, 30, 500);
    var candles = allCandles.slice(-visibleCount), closeSeries = allCandles.map(function (q) { return q.close; });
    var ema9Rows = emaSeries(closeSeries, 9), ema21Rows = emaSeries(closeSeries, 21), ema50Rows = emaSeries(closeSeries, 50), ema200Rows = emaSeries(closeSeries, 200);
    var bb = bollinger(closeSeries, 20, 2), vwapRows = rollingVwapSeries(allCandles, 48);
    var compactChart = w < 500;
    var pad = compactChart ? { l: 18, r: 64, t: 42, b: 78 } : { l: 58, r: 78, t: 42, b: 94 }, ch = h - pad.t - pad.b;
    var highs = candles.map(function (x) { return x.high; }), lows = candles.map(function (x) { return x.low; });
    var overlayValues = [];
    [state.chart.ema9 ? ema9Rows : [], state.chart.ema21 ? ema21Rows : [], state.chart.ema50 ? ema50Rows : [], state.chart.ema200 ? ema200Rows : [], state.chart.vwap ? vwapRows : [], state.chart.bb ? bb.upper : [], state.chart.bb ? bb.lower : []].forEach(function (series) {
      overlayValues = overlayValues.concat(series.slice(-candles.length).filter(Number.isFinite));
    });
    highs = highs.concat(overlayValues); lows = lows.concat(overlayValues);
    var max = Math.max.apply(null, highs), min = Math.min.apply(null, lows), range = max - min || 1; max += range * 0.08; min -= range * 0.08;
    function y(p) { return pad.t + (max - p) / (max - min) * ch; }
    function x(i) { return pad.l + i * ((w - pad.l - pad.r) / Math.max(1, candles.length - 1)); }
    ctx.strokeStyle = '#232a33'; ctx.lineWidth = 1; ctx.font = '12px Inter, sans-serif'; ctx.fillStyle = '#9da7b3';
    for (var g = 0; g <= 5; g++) { var yy = pad.t + ch * g / 5; ctx.beginPath(); ctx.moveTo(pad.l, yy); ctx.lineTo(w - pad.r, yy); ctx.stroke(); var price = max - (max - min) * g / 5; ctx.textAlign = 'right'; ctx.fillText(money(price), w - 4, yy + 4); }
    var dateTicks = Math.min(compactChart ? 3 : 6, candles.length);
    for (var tick = 0; tick < dateTicks; tick++) {
      var index = Math.round(tick * (candles.length - 1) / Math.max(1, dateTicks - 1)), xxTick = x(index);
      ctx.strokeStyle = 'rgba(48,55,65,.42)'; ctx.beginPath(); ctx.moveTo(xxTick, pad.t); ctx.lineTo(xxTick, h - pad.b + 58); ctx.stroke();
      var date = new Date(candles[index].time);
      var isDailyChart = ['1d', '3d', '1w', '1M'].indexOf(state.interval) !== -1;
      var dateLabel = isDailyChart ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : compactChart ? date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit' }).replace(',', '') + 'h' : date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      ctx.fillStyle = '#8f99a6'; ctx.font = (compactChart ? '10px' : '11px') + ' Inter, sans-serif'; ctx.textAlign = tick === 0 ? 'left' : tick === dateTicks - 1 ? 'right' : 'center'; ctx.fillText(dateLabel, xxTick, h - 10);
    }
    ctx.textAlign = 'left';
    var bw = Math.max(3, ((w - pad.l - pad.r) / candles.length) * 0.58);
    candles.forEach(function (bar, i) { var xx = x(i); var up = bar.close >= bar.open; ctx.strokeStyle = up ? '#22c783' : '#ff5c70'; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(xx, y(bar.high)); ctx.lineTo(xx, y(bar.low)); ctx.stroke(); var top = y(Math.max(bar.open, bar.close)); var bot = y(Math.min(bar.open, bar.close)); ctx.fillRect(xx - bw / 2, top, bw, Math.max(2, bot - top)); });
    if (state.chart.ema9) drawLine(ctx, candles, ema9Rows, x, y, '#4fd3c4');
    if (state.chart.ema21) drawLine(ctx, candles, ema21Rows, x, y, '#55a7ff');
    if (state.chart.ema50) drawLine(ctx, candles, ema50Rows, x, y, '#f5b84b');
    if (state.chart.ema200) drawLine(ctx, candles, ema200Rows, x, y, '#e7e9ee');
    if (state.chart.bb) {
      drawLine(ctx, candles, bb.upper, x, y, 'rgba(169,139,255,.72)');
      drawLine(ctx, candles, bb.mid, x, y, 'rgba(169,139,255,.42)');
      drawLine(ctx, candles, bb.lower, x, y, 'rgba(169,139,255,.72)');
    }
    if (state.chart.vwap) drawLine(ctx, candles, vwapRows, x, y, '#f07aa6');
    var a = state.analysis;
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#f4f0e8'; ctx.beginPath(); ctx.moveTo(pad.l, y(a.close)); ctx.lineTo(w - pad.r, y(a.close)); ctx.stroke(); ctx.setLineDash([]);
    if (state.chart.levels) a.supports.concat(a.resistances).forEach(function (level) { ctx.strokeStyle = level < a.close ? 'rgba(34,199,131,.55)' : 'rgba(255,92,112,.55)'; ctx.beginPath(); ctx.moveTo(pad.l, y(level)); ctx.lineTo(w - pad.r, y(level)); ctx.stroke(); });
    if (state.chart.supertrend && Number.isFinite(a.supertrend.value)) {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = a.supertrend.trend === 'Alta' ? '#22c783' : '#ff5c70'; ctx.beginPath(); ctx.moveTo(pad.l, y(a.supertrend.value)); ctx.lineTo(w - pad.r, y(a.supertrend.value)); ctx.stroke(); ctx.setLineDash([]);
    }
    if (state.chart.fib) {
      var swingHigh = Math.max.apply(null, candles.map(function (bar) { return bar.high; })), swingLow = Math.min.apply(null, candles.map(function (bar) { return bar.low; }));
      [0.236, 0.382, 0.5, 0.618, 0.786].forEach(function (ratio) {
        var level = swingHigh - (swingHigh - swingLow) * ratio;
        ctx.strokeStyle = 'rgba(245,184,75,.32)'; ctx.beginPath(); ctx.moveTo(pad.l, y(level)); ctx.lineTo(w - pad.r, y(level)); ctx.stroke();
        ctx.fillStyle = '#c8a65c'; ctx.font = '10px Inter, sans-serif'; ctx.fillText('Fib ' + ratio, pad.l + 4, y(level) - 3);
      });
    }
    if (state.chart.patterns) {
      (a.patterns || []).slice(0, 3).forEach(function (pattern, patternIndex) {
        var visibleIndex = candles.findIndex(function (bar) { return bar.time === pattern.time; });
        if (visibleIndex < 0) return;
        var markerY = y(pattern.price);
        ctx.fillStyle = pattern.direction === 'bull' ? '#22c783' : pattern.direction === 'bear' ? '#ff5c70' : '#f5b84b';
        ctx.beginPath(); ctx.arc(x(visibleIndex), markerY, 4, 0, Math.PI * 2); ctx.fill();
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText('P' + (patternIndex + 1), Math.min(w - pad.r - 18, x(visibleIndex) + 7), markerY - 7 - patternIndex * 10);
      });
    }
    var maxVol = Math.max.apply(null, candles.map(function (q) { return q.volume; })) || 1, vh = 48, vy = h - 76;
    candles.forEach(function (bar, i) { var height = (bar.volume / maxVol) * vh; ctx.fillStyle = bar.close >= bar.open ? 'rgba(34,199,131,.28)' : 'rgba(255,92,112,.28)'; ctx.fillRect(x(i) - bw / 2, vy + vh - height, bw, height); });
    var legendX = pad.l, legendY = 18;
    [
      { on: state.chart.ema9, label: 'EMA9', color: '#4fd3c4' },
      { on: state.chart.ema21, label: 'EMA21', color: '#55a7ff' },
      { on: state.chart.ema50, label: 'EMA50', color: '#f5b84b' },
      { on: state.chart.ema200, label: 'EMA200', color: '#e7e9ee' },
      { on: state.chart.bb, label: 'BB20', color: '#a98bff' },
      { on: state.chart.vwap, label: 'VWAP', color: '#f07aa6' },
      { on: state.chart.supertrend, label: 'ST', color: a.supertrend.trend === 'Alta' ? '#22c783' : '#ff5c70' },
      { on: state.chart.fib, label: 'FIB', color: '#f5b84b' }
    ].forEach(function (item) {
      if (!item.on) return;
      if (legendX > w - 150) { legendX = pad.l; legendY += 16; }
      ctx.fillStyle = '#9da7b3'; ctx.fillText(item.label, legendX, legendY);
      ctx.fillStyle = item.color; ctx.fillRect(legendX + item.label.length * 7 + 8, legendY - 8, 16, 3);
      legendX += item.label.length * 7 + 42;
    });
  }
  function drawLine(ctx, candles, series, x, y, color) { ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath(); var started = false; series.slice(-candles.length).forEach(function (v, i) { if (v == null) return; if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v)); }); ctx.stroke(); }
  function drawFlowChart() {
    var canvas = $('flowCanvas'); if (!canvas || !state.klines.length) return;
    var c = setupCanvas(canvas); if (!c) return;
    var ctx = c.ctx, w = c.w, h = c.h; ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#101318'; ctx.fillRect(0, 0, w, h);
    var rows = state.klines.slice(-48).map(function (bar) {
      if (!Number.isFinite(bar.takerBuy) || !Number.isFinite(bar.volume)) return null;
      return bar.takerBuy - Math.max(0, bar.volume - bar.takerBuy);
    });
    var finiteRows = rows.filter(function (v) { return v !== null; });
    var max = Math.max.apply(null, finiteRows.map(Math.abs).concat([1])), mid = h / 2, bw = Math.max(3, w / rows.length * .62);
    ctx.strokeStyle = '#303741'; ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(w, mid); ctx.stroke();
    rows.forEach(function (v, i) { if (v === null) return; var x = i * (w / rows.length) + 3; var height = Math.abs(v) / max * (h * .42); ctx.fillStyle = v >= 0 ? '#22c783' : '#ff5c70'; ctx.fillRect(x, v >= 0 ? mid - height : mid, bw, height); });
    var sum = finiteRows.reduce(function (a, b) { return a + b; }, 0);
    text('flowCaption', finiteRows.length ? 'Delta taker aprox. ' + num(sum, 3) + ' ' + baseAsset(state.symbol) + ' nos ultimos candles' + (finiteRows.length < rows.length ? ' (' + finiteRows.length + '/' + rows.length + ' com dado de taker)' : '') : 'Sem dado de taker nos candles recentes');
  }
  function drawRsiChart() {
    var canvas = $('rsiCanvas'); if (!canvas || !state.analysis) return;
    var c = setupCanvas(canvas); if (!c) return;
    var ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#11161d'; ctx.fillRect(0, 0, w, h);
    var values = state.analysis.rsiValues.slice(-120);
    var pad = { l: 28, r: 18, t: 10, b: 20 };
    function y(v) { return pad.t + (100 - v) / 100 * (h - pad.t - pad.b); }
    function x(i) { return pad.l + i * ((w - pad.l - pad.r) / Math.max(1, values.length - 1)); }
    [70, 50, 30].forEach(function (level) {
      ctx.strokeStyle = level === 50 ? '#303741' : 'rgba(245,184,75,.35)';
      ctx.beginPath(); ctx.moveTo(pad.l, y(level)); ctx.lineTo(w - pad.r, y(level)); ctx.stroke();
      ctx.fillStyle = '#9da7b3'; ctx.font = '11px Inter, sans-serif'; ctx.fillText(String(level), 4, y(level) + 4);
    });
    ctx.strokeStyle = '#55a7ff'; ctx.lineWidth = 1.8; ctx.beginPath();
    var started = false;
    values.forEach(function (v, i) {
      if (v == null) return;
      if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();
  }
  function drawMacdChart() {
    var canvas = $('macdCanvas'); if (!canvas || !state.analysis) return;
    var c = setupCanvas(canvas); if (!c) return;
    var ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#11161d'; ctx.fillRect(0, 0, w, h);
    var data = state.analysis.macdData;
    var line = data.line.slice(-120), signal = data.signal.slice(-120), hist = data.hist.slice(-120);
    var values = line.concat(signal).concat(hist).filter(function (v) { return Number.isFinite(v); });
    var maxAbs = Math.max.apply(null, values.map(Math.abs).concat([1]));
    var pad = { l: 24, r: 14, t: 12, b: 20 };
    var mid = pad.t + (h - pad.t - pad.b) / 2;
    function y(v) { return mid - (v / maxAbs) * ((h - pad.t - pad.b) / 2); }
    function x(i) { return pad.l + i * ((w - pad.l - pad.r) / Math.max(1, hist.length - 1)); }
    ctx.strokeStyle = '#303741'; ctx.beginPath(); ctx.moveTo(pad.l, mid); ctx.lineTo(w - pad.r, mid); ctx.stroke();
    var bw = Math.max(2, ((w - pad.l - pad.r) / hist.length) * .62);
    hist.forEach(function (v, i) {
      if (v == null) return;
      ctx.fillStyle = v >= 0 ? 'rgba(34,199,131,.76)' : 'rgba(255,92,112,.76)';
      var yy = y(v);
      ctx.fillRect(x(i) - bw / 2, Math.min(mid, yy), bw, Math.max(1, Math.abs(yy - mid)));
    });
    drawMiniLine(ctx, line, x, y, '#55a7ff');
    drawMiniLine(ctx, signal, x, y, '#f5b84b');
  }
  function drawVolumeChart() {
    var canvas = $('volumeCanvas'); if (!canvas || !state.klines.length) return;
    var c = setupCanvas(canvas); if (!c) return;
    var ctx = c.ctx, w = c.w, h = c.h;
    ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#11161d'; ctx.fillRect(0, 0, w, h);
    var rows = state.klines.slice(-96);
    var maxVol = Math.max.apply(null, rows.map(function (bar) { return bar.volume; }).concat([1]));
    var pad = { l: 22, r: 14, t: 12, b: 22 };
    var bw = Math.max(2, ((w - pad.l - pad.r) / rows.length) * .7);
    rows.forEach(function (bar, i) {
      if (!Number.isFinite(bar.volume)) return;
      var x = pad.l + i * ((w - pad.l - pad.r) / Math.max(1, rows.length - 1));
      var height = (bar.volume / maxVol) * (h - pad.t - pad.b);
      var hasTaker = Number.isFinite(bar.takerBuy);
      var delta = hasTaker ? bar.takerBuy - Math.max(0, bar.volume - bar.takerBuy) : NaN;
      ctx.fillStyle = !hasTaker ? 'rgba(157,167,179,.5)' : delta >= 0 ? 'rgba(34,199,131,.72)' : 'rgba(255,92,112,.72)';
      ctx.fillRect(x - bw / 2, h - pad.b - height, bw, height);
    });
    var mean = avg(rows.map(function (bar) { return bar.volume; }).filter(Number.isFinite));
    var meanY = h - pad.b - (mean / maxVol) * (h - pad.t - pad.b);
    ctx.strokeStyle = 'rgba(245,184,75,.72)'; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(pad.l, meanY); ctx.lineTo(w - pad.r, meanY); ctx.stroke(); ctx.setLineDash([]);
  }
  function drawMiniLine(ctx, values, x, y, color) {
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath();
    var started = false;
    values.forEach(function (v, i) {
      if (v == null) return;
      if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();
  }
  function setIntervalChoice(interval) {
    if (BINANCE_INTERVALS.indexOf(interval) === -1) return;
    state.interval = interval; $('intervalSelect').value = interval;
    if (state.boardRefreshing) state.boardPendingRefresh = true;
    syncIntervalButtons(interval);
    renderBoard();
    refresh(true);
  }
  function syncIntervalButtons(interval) {
    Array.from($('timeTabs').querySelectorAll('button')).forEach(function (btn) { var active = btn.dataset.interval === interval; btn.classList.toggle('active', active); btn.setAttribute('aria-pressed', String(active)); });
  }
  function syncSortButtons(sort) {
    [['sortScoreButton', 'score'], ['sortChangeButton', 'change'], ['sortVolumeButton', 'volume']].forEach(function (entry) {
      var button = $(entry[0]); if (!button) return;
      var active = sort === entry[1]; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    });
  }
  function setSort(sort) {
    state.sort = sort;
    syncSortButtons(sort);
    renderBoard();
  }
  function setView(view) {
    state.view = view === 'asset' ? 'asset' : 'dashboard';
    document.body.setAttribute('data-view', state.view);
    var dashboard = $('viewDashboardButton'), asset = $('viewAssetButton');
    if (dashboard) { dashboard.classList.toggle('active', state.view === 'dashboard'); dashboard.setAttribute('aria-pressed', String(state.view === 'dashboard')); }
    if (asset) { asset.classList.toggle('active', state.view === 'asset'); asset.setAttribute('aria-pressed', String(state.view === 'asset')); }
    setTimeout(function () { drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); }, 0);
  }
  function setAssetTab(tab, reveal) {
    var allowed = ['summary', 'chart', 'history', 'futures', 'institutional', 'macro', 'signals', 'calculator'];
    state.assetTab = allowed.indexOf(tab) === -1 ? 'summary' : tab;
    document.body.setAttribute('data-asset-tab', state.assetTab);
    document.querySelectorAll('#assetTabs [data-asset-tab]').forEach(function (button) { var active = button.dataset.assetTab === state.assetTab; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    if (state.assetTab === 'chart') setTimeout(function () { drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); }, 0);
    if (state.assetTab === 'signals') renderSignals();
    if (reveal !== false) setTimeout(function () {
      var tabs = $('assetTabs');
      if (tabs && state.view === 'asset') tabs.scrollIntoView({ block: 'start', behavior: 'auto' });
    }, 0);
  }
  function selectSymbol(symbol, openAsset) {
    var nextSymbol = normalizeSymbol(symbol);
    if (nextSymbol !== state.symbol) {
      closeLiquidationStream();
      state.liquidations = [];
      renderLiquidations();
    }
    state.symbol = nextSymbol;
    $('symbolSelect').value = state.symbol;
    if (openAsset) { setAssetTab('summary'); setView('asset'); }
    refresh(true);
  }
  function populateAssetSelect() {
    var select = $('symbolSelect');
    if (!select) return;
    select.innerHTML = ASSETS.map(function (symbol) {
      return '<option value="' + symbol + '">' + baseAsset(symbol) + ' - ' + (ASSET_NAMES[symbol] || symbol) + '</option>';
    }).join('');
    select.value = state.symbol;
  }
  var SIGNAL_JOURNAL_KEY = 'cld-signal-journal:' + MODEL_VERSION;
  var SIGNAL_SYNC_ID_KEY = 'cld-signal-sync-id:v1';
  var SIGNAL_JOURNAL_LOCK = 'cld-signal-journal-lock:' + MODEL_VERSION;
  var SIGNAL_MACHINE_LOCK = 'cld-signal-machine-lock:' + MODEL_VERSION;
  var signalSyncClient = null;
  // ===== Motor de sinais v2 (Ciclo C): state machine por par+TF, trades simulados =====
  var SIGNAL_MACHINE_KEY = 'cld-signal-machine:' + MODEL_VERSION;
  var TRADE_JOURNAL_KEY = 'cld-signal-trades:' + MODEL_VERSION;
  var TRADE_JOURNAL_CAP = 500;
  function loadMachineStates() { return AnalyticsCore.normalizeSignalMachineMap(safeStorageGet(SIGNAL_MACHINE_KEY)); }
  function saveMachineStates(map) { safeStorageSet(SIGNAL_MACHINE_KEY, map); }
  function normalizeTradeJournal(rows) {
    var byIdentity = new Map();
    (Array.isArray(rows) ? rows : []).forEach(function (row) {
      var entryTime = finiteNumber(row && row.entryTime), exitTime = finiteNumber(row && row.exitTime);
      var valid = row && (row.side === 'long' || row.side === 'short')
        && typeof row.symbol === 'string' && /^[A-Z0-9]{1,15}USDT$/.test(row.symbol)
        && BINANCE_INTERVALS.indexOf(row.interval) !== -1
        && finiteNumber(row.entryPrice) > 0 && finiteNumber(row.exitPrice) > 0
        && Number.isFinite(finiteNumber(row.pnlPct))
        && Number.isFinite(entryTime) && Number.isFinite(exitTime) && entryTime >= 0 && exitTime >= entryTime;
      if (!valid) return;
      var identity = [row.symbol, row.interval, row.side, entryTime, exitTime].join(':');
      // The first persisted exit is canonical. Concurrent tabs that observe the same transition
      // cannot create duplicate evidence or replace its fill assumptions afterward.
      if (!byIdentity.has(identity)) byIdentity.set(identity, row);
    });
    return Array.from(byIdentity.values()).slice(-TRADE_JOURNAL_CAP);
  }
  function loadTradeJournal() { return normalizeTradeJournal(safeStorageGet(TRADE_JOURNAL_KEY)); }
  function saveTradeJournal(records) { safeStorageSet(TRADE_JOURNAL_KEY, normalizeTradeJournal(records)); }
  /**
   * One evaluation per CLOSED candle per par+TF. The machine consumes the same confluence the
   * panel shows (score, gates, veto) plus the closed candle OHLC — no intra-candle churn.
   */
  function runSignalMachine(analysis) {
    if (!analysis || !analysis.signalCandle || !Number.isFinite(analysis.signalCandle.closeTime)) return;
    var machineSymbol = analysis.snapshot && analysis.snapshot.symbol || state.symbol;
    var machineInterval = analysis.snapshot && analysis.snapshot.interval || state.interval;
    var key = machineSymbol + ':' + machineInterval;
    var closeTime = analysis.signalCandle.closeTime;
    if (state.signalMachineEval[key] === closeTime) return;
    var confluence = confluenceFor(analysis);
    var transitionSnapshot = {
      symbol: machineSymbol,
      interval: machineInterval,
      total: confluence.total,
      open: analysis.signalCandle.open,
      close: analysis.signalCandle.close,
      high: analysis.signalCandle.high,
      low: analysis.signalCandle.low,
      closeTime: analysis.signalCandle.closeTime,
      atr: analysis.atr14,
      regime: analysis.regime,
      supports: analysis.supports,
      resistances: analysis.resistances,
      structureShift: analysis.structureShift,
      divergence: analysis.divergence,
      trap: analysis.trap,
      squeeze: analysis.squeeze,
      gates: confluence.gates,
      inputSnapshotId: analysis.snapshot ? analysis.snapshot.inputSnapshotId : null
    };
    return withCrossTabLock(SIGNAL_MACHINE_LOCK, function runSignalMachineExclusive() {
      if (state.signalMachineEval[key] === closeTime) return;
    var machines = loadMachineStates();
    var persisted = machines[key] || null;
    // Idempotencia PERSISTIDA: tanto o estado ACTIVE quanto o tombstone FLAT guardam o ultimo
    // candle processado. Web Locks serializa abas compativeis; o tombstone tambem protege reload
    // e repeticoes sequenciais do candle que acabou de gerar um exit.
    if (persisted && Number.isFinite(persisted.lastCloseTime) && closeTime <= persisted.lastCloseTime) return;
    var activeState = persisted && persisted.phase === 'ACTIVE' ? persisted : null;
    // DC<40 bloqueia ENTRADAS; uma posicao ativa continua sendo gerida (stop/alvo/tempo sao
    // leituras de preco do candle fechado — congelar exits distorceria as base rates).
    if (!activeState && confluence.dataConfidence < 40) {
      state.signalMachineEval[key] = closeTime;
      machines[key] = { phase: 'FLAT', lastCloseTime: closeTime };
      saveMachineStates(machines);
      renderTradeEngine();
      return;
    }
    var result = AnalyticsCore.evaluateSignalTransition(activeState, transitionSnapshot);
    state.signalMachineEval[key] = closeTime;
    // FLAT vira tombstone com o carimbo do candle (nunca delete: o marcador de idempotencia
    // precisa sobreviver ao exit).
    machines[key] = result.state || { phase: 'FLAT', lastCloseTime: closeTime };
    saveMachineStates(machines);
    if (result.event && result.event.type === 'exit') {
      var journal = loadTradeJournal();
      journal.push(result.event.record);
      saveTradeJournal(journal);
    }
    renderTradeEngine();
    }).catch(function (error) {
      health('Concorrencia multiaba', false, 'falha ao serializar motor de sinais: ' + (error && error.message || 'erro'));
    });
  }
  function renderTradeEngine() {
    var machines = loadMachineStates();
    var slot = machines[state.symbol + ':' + state.interval];
    var active = slot && slot.phase === 'ACTIVE' ? slot : null;
    text('activeTradeLine', active
      ? 'Posicao simulada ' + active.side.toUpperCase() + ' em ' + money(active.entryPrice) + ' (gatilho ' + active.trigger + ', score ' + signed(active.entryScore) + ') | stop ' + money(active.stopPrice) + ' | alvo ' + money(active.targetPrice) + ' | ' + active.barsHeld + '/' + active.maxBars + ' barras | MFE ' + percent(active.mfePct, 2) + ' MAE ' + percent(active.maePct, 2)
      : 'Sem posicao simulada aberta neste par/TF.');
    var journal = loadTradeJournal();
    var rowsNode = $('tradeRows');
    if (rowsNode) {
      rowsNode.innerHTML = journal.length ? journal.slice(-25).reverse().map(function (row) {
        var pnl = finiteNumber(row.pnlPct), rMultiple = finiteNumber(row.rMultiple), mae = finiteNumber(row.maePct), mfe = finiteNumber(row.mfePct), duration = finiteNumber(row.durationBars);
        return '<tr><td>' + escapeHTML(AnalyticsCore.formatDisplayTimestamp(row.exitTime, DISPLAY_TIME_ZONE, 'full')) + '</td><td>' + escapeHTML(baseAsset(row.symbol || '')) + '</td><td>' + escapeHTML(intervalLabel(row.interval || '--')) + '</td><td>' + escapeHTML(row.side || '--') + '</td><td>' + escapeHTML(row.trigger || '--') + '</td><td>' + escapeHTML(row.regime || '--') + '</td><td class="' + (pnl >= 0 ? 'up' : 'down') + '">' + percent(pnl, 2) + '</td><td>' + (Number.isFinite(rMultiple) ? num(rMultiple, 2) + 'R' : '--') + '</td><td>' + percent(mae, 1) + ' / ' + percent(mfe, 1) + '</td><td>' + (Number.isFinite(duration) ? duration : '--') + '</td><td>' + escapeHTML(row.exitReason || '--') + '</td></tr>';
      }).join('') : '<tr><td colspan="11">Nenhum trade simulado fechado nesta versao do modelo.</td></tr>';
    }
    var summaryNode = $('tradeSummaryRows');
    if (summaryNode) {
      var summary = AnalyticsCore.summarizeTradeJournal(journal);
      summaryNode.innerHTML = summary.cells.length ? summary.cells.slice(0, 12).map(function (cell) {
        return '<tr><td>' + escapeHTML(cell.regime) + '</td><td>' + escapeHTML(cell.trigger) + '</td><td>' + escapeHTML(cell.band) + '</td><td>' + cell.count + '</td><td>' + cell.hitRate + '%' + (cell.hitRateInterval ? ' <small>[' + num(cell.hitRateInterval.lower, 0) + '–' + num(cell.hitRateInterval.upper, 0) + ']</small>' : '') + '</td><td>' + (Number.isFinite(cell.avgR) ? num(cell.avgR, 2) + 'R' : '--') + '</td><td>' + (cell.sufficient ? 'ok' : 'insuficiente') + '</td></tr>';
      }).join('') : '<tr><td colspan="7">--</td></tr>';
    }
  }
  async function runLagBacktest() {
    // Captura o simbolo NO CLIQUE: trocar de ativo durante o await nao pode misturar dados/label.
    var symbol = state.symbol;
    text('lagBacktestLine', 'Rodando backtest de lag sobre o historico diario de ' + baseAsset(symbol) + '...');
    await delay(30); // deixa o status pintar antes do loop sincrono
    try {
      await ensureHistoricalProfile(symbol, true);
      var daily = state.historyCandles[symbol];
      if (!daily || daily.length < 260) { text('lagBacktestLine', 'Historico diario insuficiente para o backtest de ' + baseAsset(symbol) + '.'); return; }
      var lag = AnalyticsCore.backtestDetectorLag(daily);
      text('lagBacktestLine', 'Lag do CHoCH em ' + baseAsset(symbol) + ' (diario): topos ' + lag.tops.detected + '/' + lag.tops.count + ' detectados, mediana ' + (Number.isFinite(lag.tops.medianLagBars) ? lag.tops.medianLagBars + ' barras' : '--') + ' | fundos ' + lag.bottoms.detected + '/' + lag.bottoms.count + ', mediana ' + (Number.isFinite(lag.bottoms.medianLagBars) ? lag.bottoms.medianLagBars + ' barras' : '--') + '.');
    } catch (error) {
      text('lagBacktestLine', 'Backtest indisponivel: ' + (error && error.message || 'erro'));
    }
  }
  var SIGNAL_JOURNAL_CAP = 500;
  function validSignalRecord(record) {
    var closeTime = finiteNumber(record && record.signalCloseTime), price = finiteNumber(record && record.price);
    return !!(record && typeof record === 'object'
      && typeof record.symbol === 'string' && /^[A-Z0-9]{1,15}USDT$/.test(record.symbol)
      && BINANCE_INTERVALS.indexOf(record.interval) !== -1
      && Number.isFinite(closeTime) && closeTime >= 0 && closeTime <= Date.now() + AnalyticsCore.RULESET.clockSkewToleranceMs
      && Number.isFinite(price) && price > 0);
  }
  function loadSignalJournal() {
    var records = safeStorageGet(SIGNAL_JOURNAL_KEY);
    return Array.isArray(records) ? records.filter(validSignalRecord) : [];
  }
  function validSignalSyncId(value) { return SignalSync.validSyncId(value); }
  function setSignalSyncStatus(message, configured) {
    text('signalSyncStatus', message);
  }
  function handleSignalSyncStatus(status) {
    var messages = {
      syncing: 'Sincronizando journal com o servidor...',
      synced: (status.details.count || 0) + ' sinais persistidos no servidor e conciliados neste dispositivo.',
      unconfigured: 'Armazenamento duravel ainda nao provisionado; o journal local foi preservado.',
      'sync-failed': 'Falha na sincronizacao duravel; o journal local foi preservado.',
      cleared: 'Journal removido do servidor e deste dispositivo.',
      'clear-unconfigured': 'Servidor duravel nao provisionado; apenas o journal local foi limpo.',
      'clear-failed': 'Exclusao duravel falhou; o journal local foi restaurado para permitir nova tentativa.'
    };
    setSignalSyncStatus(messages[status.code] || 'Estado de sincronizacao desconhecido.', status.configured);
  }
  function createSignalSyncClient() {
    return SignalSync.createClient({
      fetchJSON: fetchJSON,
      validRecord: validSignalRecord,
      compactRecords: function (records, asOf) { return AnalyticsCore.compactSignalJournal(records, asOf, SIGNAL_JOURNAL_CAP); },
      mergeOutcome: AnalyticsCore.mergeSignalOutcome,
      readRecords: loadSignalJournal,
      writeRecords: function (records) {
        if (!safeStorageSet(SIGNAL_JOURNAL_KEY, records)) setSignalSyncStatus('Journal disponivel apenas nesta sessao; o armazenamento local esta indisponivel.', false);
      },
      readSyncId: function () { return safeStorageGet(SIGNAL_SYNC_ID_KEY); },
      writeSyncId: function (id) {
        if (!safeStorageSet(SIGNAL_SYNC_ID_KEY, id)) setSignalSyncStatus('Codigo privado disponivel apenas nesta sessao; copie-o antes de recarregar.', false);
      },
      runExclusive: function (task) { return withCrossTabLock(SIGNAL_JOURNAL_LOCK, task); },
      cryptoApi: window.crypto,
      onStatus: handleSignalSyncStatus,
      onRecordsUpdated: function () { if (state.assetTab === 'signals') renderSignals(); }
    });
  }
  function currentSignalSyncClient() {
    if (!signalSyncClient) signalSyncClient = createSignalSyncClient();
    return signalSyncClient;
  }
  function signalSyncId() { return currentSignalSyncClient().syncId(); }
  function syncDurableSignalJournal(records) { return currentSignalSyncClient().sync(records); }
  function scheduleDurableSignalSync(records) { currentSignalSyncClient().schedule(records); }
  function clearDurableSignalJournal() { return currentSignalSyncClient().clear(); }
  function initDurableSignalSync() {
    var id = signalSyncId();
    var input = $('signalSyncCode');
    if (input) input.value = id;
    syncDurableSignalJournal(loadSignalJournal());
  }
  function saveSignalJournal(records, options) {
    var compacted = AnalyticsCore.compactSignalJournal(records, Date.now(), SIGNAL_JOURNAL_CAP);
    if (!safeStorageSet(SIGNAL_JOURNAL_KEY, compacted)) setSignalSyncStatus('Journal disponivel apenas nesta sessao; o armazenamento local esta indisponivel.', false);
    if (!options || options.durable !== false) scheduleDurableSignalSync(compacted);
  }
  function maybeRecordSignal(analysis, confluence) {
    if (!analysis || !confluence || !analysis.snapshot) return;
    var candidate = { symbol: analysis.snapshot.symbol, interval: analysis.snapshot.interval, signalCloseTime: analysis.snapshot.signalCloseTime };
    var candidateRecord = {
      recordedAt: Date.now(),
      inputSnapshotId: analysis.snapshot.inputSnapshotId,
      modelVersion: MODEL_VERSION,
      rulesetHash: RULESET_HASH,
      symbol: candidate.symbol,
      interval: candidate.interval,
      signalCloseTime: candidate.signalCloseTime,
      price: analysis.signalCandle ? analysis.signalCandle.close : analysis.close,
      setupScore: confluence.total,
      radarScore: analysis.radar ? analysis.radar.score : null,
      dataConfidence: confluence.dataConfidence,
      decision: confluence.decision,
      schemaVersion: 2,
      inputComponents: analysis.snapshot.inputComponents || null,
      inputComponentsHash: AnalyticsCore.stableHash(analysis.snapshot.inputComponents || {}),
      scoreComponents: (confluence.components || []).map(function (component) { return { name: component.name, ruleId: component.ruleId, contribution: component.contribution, cap: component.max, status: component.status, scope: component.scope, isProxy: component.isProxy, sources: component.sources }; }),
      gates: confluence.gates || null,
      outcome: null
    };
    return withCrossTabLock(SIGNAL_JOURNAL_LOCK, function recordSignalExclusive() {
      var records = loadSignalJournal();
      var lastForPair = null;
      for (var index = records.length - 1; index >= 0; index -= 1) {
        if (records[index].symbol === candidate.symbol && records[index].interval === candidate.interval) { lastForPair = records[index]; break; }
      }
      if (!AnalyticsCore.shouldRecordSignal(lastForPair, candidate)) return false;
      records.push(candidateRecord);
      saveSignalJournal(records);
      if (state.assetTab === 'signals') renderSignals();
      return true;
    }).catch(function (error) {
      health('Concorrencia multiaba', false, 'falha ao serializar journal de sinais: ' + (error && error.message || 'erro'));
      return false;
    });
  }
  function renderSignals() {
    var rows = $('signalRows');
    if (!rows) return;
    renderTradeEngine();
    var records = loadSignalJournal();
    var visible = records.slice(-40).reverse();
    var pct = function (value) { var parsed = finiteNumber(value); return Number.isFinite(parsed) ? percent(parsed, 2) : '--'; };
    rows.innerHTML = visible.length ? visible.map(function (record) {
      // "Quando" e o fechamento do candle que confirmou o sinal (a identidade do sinal), nao a
      // hora em que o navegador gravou o registro. Formatacao com fuso explicito (UX-005).
      var when = Number.isFinite(+record.signalCloseTime) ? +record.signalCloseTime : record.recordedAt;
      var setupScore = finiteNumber(record.setupScore), confidence = finiteNumber(record.dataConfidence);
      return '<tr><td>' + AnalyticsCore.formatDisplayTimestamp(when, DISPLAY_TIME_ZONE, 'short') + '</td><td>' + escapeHTML(baseAsset(record.symbol)) + '</td><td>' + escapeHTML(intervalLabel(record.interval)) + '</td><td>' + (Number.isFinite(setupScore) ? signed(setupScore) : '--') + '</td><td>' + (Number.isFinite(confidence) ? num(confidence, 0) : '--') + '%</td><td>' + escapeHTML(record.decision) + '</td><td>' + money(finiteNumber(record.price)) + '</td><td>' + pct(record.outcome && record.outcome.r1h) + '</td><td>' + pct(record.outcome && record.outcome.r24h) + '</td><td>' + pct(record.outcome && record.outcome.r7d) + '</td></tr>';
    }).join('') : '<tr><td colspan="10">Nenhum sinal registrado ainda nesta versao do modelo.</td></tr>';
    var signalNow = Date.now();
    var due = records.filter(function (record) { return AnalyticsCore.signalOutcomeState(record, signalNow) === 'due'; }).length;
    var waiting = records.filter(function (record) { return AnalyticsCore.signalOutcomeState(record, signalNow) === 'waiting'; }).length;
    text('signalsStatus', records.length + ' sinais registrados (' + MODEL_VERSION + ') | ' + due + ' prontos para avaliacao | ' + waiting + ' aguardando o horizonte | avaliacao usa candles 1m para 1h e candles 15m para 24h/7d | horarios em ' + DISPLAY_TIME_ZONE + '.');
    var summaryRows = $('signalSummaryRows');
    if (summaryRows) {
      var summary = AnalyticsCore.summarizeSignalJournal(records);
      summaryRows.innerHTML = summary.map(function (row) {
        return '<tr><td>' + escapeHTML(row.band) + '</td><td>' + row.total + '</td><td>' + row.evaluated + '</td><td>' + (row.hitRate === null ? '--' : num(row.hitRate, 0) + '%' + (row.hitRateInterval ? ' <small>[' + num(row.hitRateInterval.lower, 0) + '–' + num(row.hitRateInterval.upper, 0) + ']</small>' : '')) + '</td><td>' + (row.median24h === null ? '--' : percent(row.median24h, 2)) + '</td><td>' + (row.evaluated ? (row.sufficient ? 'OK' : '&lt; 20') : '--') + '</td></tr>';
      }).join('');
      text('signalSummaryCount', records.length + ' sinais');
    }
  }
  async function evaluateSignalOutcomes() {
    if (state.evaluatingSignals) { text('signalsStatus', 'Avaliacao de sinais ja esta em andamento.'); return; }
    state.evaluatingSignals = true;
    var evaluateButton = $('evaluateSignalsButton');
    if (evaluateButton) evaluateButton.disabled = true;
    try {
      var records = loadSignalJournal();
      var evaluationNow = Date.now();
      var pending = records.filter(function (record) { return AnalyticsCore.signalOutcomePending(record, evaluationNow); }).slice(0, 10);
      if (!pending.length) {
        var waiting = records.filter(function (record) { return AnalyticsCore.signalOutcomeState(record, evaluationNow) === 'waiting'; }).length;
        text('signalsStatus', waiting ? 'Nenhum horizonte venceu ainda; ' + waiting + ' sinal(is) aguardando o tempo minimo.' : 'Nenhum sinal pendente: todos os horizontes decorridos foram avaliados.');
        return;
      }
      text('signalsStatus', 'Avaliando ' + pending.length + ' sinais...');
      var deferred = 0;
      for (var index = 0; index < pending.length; index += 1) {
        var record = pending[index];
        var existing = record.outcome || {};
        var needs1h = AnalyticsCore.toFiniteNumber(existing.r1h) === null && record.signalCloseTime + 3600000 <= evaluationNow;
        var needsLong = (AnalyticsCore.toFiniteNumber(existing.r24h) === null && record.signalCloseTime + 86400000 <= evaluationNow)
          || (AnalyticsCore.toFiniteNumber(existing.r7d) === null && record.signalCloseTime + 7 * 86400000 <= evaluationNow);
        var requests = [];
        if (needs1h) {
          var minuteStart = record.signalCloseTime + 3600000 - 60000;
          requests.push({ interval: '1m', promise: fetchSpotJSON('/api/v3/klines?symbol=' + encodeURIComponent(record.symbol) + '&interval=1m&startTime=' + minuteStart + '&limit=3', 10000, 'Binance spot') });
        }
        // 15m keeps the 24h/7d marks within one quarter-hour while still fitting the full 7-day
        // horizon in Binance's 1000-row limit (672 bars). The former 1h series could evaluate a
        // horizon almost 60 minutes late solely because exchange candles are clock-aligned.
        if (needsLong) requests.push({ interval: '15m', promise: fetchSpotJSON('/api/v3/klines?symbol=' + encodeURIComponent(record.symbol) + '&interval=15m&startTime=' + record.signalCloseTime + '&limit=700', 12000, 'Binance spot') });
        var results = await Promise.allSettled(requests.map(function (request) { return request.promise; }));
        var outcome = existing;
        var signalDeferred = false;
        results.forEach(function (result, resultIndex) {
          if (result.status !== 'fulfilled') { signalDeferred = true; return; }
          var candles = AnalyticsCore.selectClosedCandles(parseKlines(result.value), Date.now());
          var request = requests[resultIndex];
          var horizons = request.interval === '1m' ? ['r1h'] : ['r24h', 'r7d'];
          var intervalMs = request.interval === '1m' ? 60000 : 15 * 60000;
          outcome = AnalyticsCore.mergeSignalOutcome(outcome, AnalyticsCore.evaluateSignalOutcome(record, candles, {
            horizons: horizons,
            maxLagMs: intervalMs + AnalyticsCore.RULESET.clockSkewToleranceMs
          }));
        });
        if (signalDeferred) deferred += 1;
        await withCrossTabLock(SIGNAL_JOURNAL_LOCK, function saveEvaluatedSignalExclusive() {
          var stored = loadSignalJournal();
          var match = stored.find(function (row) { return row.inputSnapshotId === record.inputSnapshotId && row.signalCloseTime === record.signalCloseTime; });
          if (match) {
            match.outcome = AnalyticsCore.mergeSignalOutcome(match.outcome, outcome);
            match.evaluatedAt = Date.now();
            saveSignalJournal(stored);
          }
        });
      }
      renderSignals();
      if (deferred) text('signalsStatus', deferred + ' de ' + pending.length + ' sinais tiveram ao menos um horizonte adiado por fonte indisponivel; tente novamente em instantes.');
    } catch (error) {
      text('signalsStatus', 'Falha ao avaliar sinais: ' + (error && error.message || 'erro inesperado'));
    } finally {
      state.evaluatingSignals = false;
      if (evaluateButton) evaluateButton.disabled = false;
    }
  }
  function exportSignalsJournal() {
    try {
      // Conjuntos arquivados por versoes anteriores do modelo (purgeStaleStorage renomeia em vez
      // de apagar); cada registro ja carrega modelVersion + rulesetHash, entao a analise externa
      // consegue segmentar por versao sem misturar regras (contrato §11).
      var archived = [];
      for (var index = 0; index < localStorage.length; index += 1) {
        var key = localStorage.key(index);
        if (!key) continue;
        var isJournal = key.indexOf('archived:cld-signal-journal:') === 0;
        var isTrades = key.indexOf('archived:cld-signal-trades:') === 0;
        if (!isJournal && !isTrades) continue;
        var parsed = null;
        try { parsed = JSON.parse(localStorage.getItem(key)); } catch (parseError) { /* conjunto ilegivel fica de fora */ }
        if (Array.isArray(parsed) && parsed.length) {
          archived.push({ modelVersion: key.slice(key.lastIndexOf(':') + 1), kind: isJournal ? 'signals' : 'trades', records: parsed });
        }
      }
      var payload = {
        exportedAt: Date.now(),
        modelId: AnalyticsCore.RULESET.modelId,
        modelVersion: MODEL_VERSION,
        rulesetHash: RULESET_HASH,
        disclaimer: 'Sinais e trades simulados, segmentados por versao do modelo; hit rates sao base rates observadas, nao probabilidade calibrada nem recomendacao.',
        signals: loadSignalJournal(),
        trades: loadTradeJournal(),
        archived: archived
      };
      var json = JSON.stringify(payload, null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'sinais-' + MODEL_VERSION + '-' + Date.now() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
      text('signalsStatus', payload.signals.length + ' sinais e ' + payload.trades.length + ' trades exportados' + (archived.length ? ' (+' + archived.length + ' conjunto(s) arquivado(s) de versoes anteriores)' : '') + '.');
    } catch (error) {
      text('signalsStatus', 'Falha ao exportar sinais: ' + (error && error.message || 'erro inesperado'));
    }
  }
  var alertState = { enabled: false, lastBySymbol: {}, lastFiredAt: {}, recent: [] };
  function alertRulesConfig() {
    var config = {};
    document.querySelectorAll('[data-alert-rule]').forEach(function (input) { config[input.dataset.alertRule] = input.checked; });
    return config;
  }
  function captureAlertSnapshot(analysis, confluence) {
    var liq = liquidationSummary();
    return {
      symbol: analysis.snapshot ? analysis.snapshot.symbol : state.symbol,
      interval: analysis.snapshot ? analysis.snapshot.interval : state.interval,
      setupScore: confluence.total,
      bias: analysis.bias,
      regime: analysis.regime,
      funding: analysis.funding,
      liquidation15m: liq.total
    };
  }
  function notifyAlert(alert) {
    var log = $('alertLog');
    if (log) {
      // Historico curto: duas regras podem disparar no mesmo ciclo (ex.: score + regime) e o
      // painel mostrava so a ultima; mantem as 4 mais recentes, mais recente primeiro.
      alertState.recent.unshift(new Date().toLocaleTimeString('pt-BR') + ' | ' + alert.message);
      alertState.recent = alertState.recent.slice(0, 4);
      log.innerHTML = alertState.recent.map(escapeHTML).join('<br>');
    }
    if (alertState.enabled && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try { new Notification('Crypto Live Desk', { body: alert.message, tag: alert.id }); } catch (error) { /* notificacao opcional */ }
    }
  }
  function processAlerts(analysis, confluence) {
    if (!analysis || !confluence) return;
    var current = captureAlertSnapshot(analysis, confluence);
    var stateKey = current.symbol + ':' + current.interval;
    var previous = alertState.lastBySymbol[stateKey];
    alertState.lastBySymbol[stateKey] = current;
    if (!previous) return;
    var alerts = AnalyticsCore.evaluateAlertTransitions(previous, current, alertRulesConfig());
    alerts.forEach(function (alert) {
      var key = alert.id + ':' + stateKey;
      var lastFired = alertState.lastFiredAt[key] || 0;
      if (Date.now() - lastFired < 300000) return;
      alertState.lastFiredAt[key] = Date.now();
      notifyAlert(alert);
    });
  }
  function exportSnapshot() {
    var analysis = state.analysis;
    if (!analysis || !analysisMatchesSelection(analysis)) { text('analysisQuality', 'Aguarde o snapshot atual carregar antes de exportar.'); return; }
    var confluence = confluenceFor(analysis);
    var datasets = {
      derivativeDetail: analysis.derivativeDetail ? { status: datasetStatus(analysis.derivativeDetail), observedAt: analysis.derivativeDetail.observedAt || null } : null,
      coinMetrics: analysis.coinMetrics ? { status: datasetStatus(analysis.coinMetrics), observedAt: analysis.coinMetrics.observedAt || null } : null,
      options: analysis.options ? { status: datasetStatus(analysis.options), observedAt: analysis.options.observedAt || null, isProxy: !!analysis.options.isProxy } : null,
      institutional: analysis.institutional ? { status: datasetStatus(analysis.institutional), observedAt: analysis.institutional.observedAt || null } : null,
      microstructure: analysis.microstructure ? { status: datasetStatus(analysis.microstructure), observedAt: analysis.microstructure.observedAt || null, informational: true } : null,
      cftc: analysis.institutional && analysis.institutional.cftc ? { observedAt: analysis.institutional.cftc.observedAt || null, informational: true } : null,
      external: state.external && state.external.fetchedAt ? { observedAt: state.external.observedAt || null, observedAtProvenance: state.external.observedAtProvenance || null, fetchedAt: state.external.fetchedAt, dataStatus: state.external.dataStatus || 'fresh' } : null,
      news: { fetchedAt: state.newsFetchedAt || null, mode: state.newsMode, provenance: state.newsMode === 'auto' ? 'rss-auto' : 'manual-user-session', overrideAt: state.newsOverrideAt, overrideAuthor: state.newsOverrideAuthor, overrideReason: state.newsOverrideReason }
    };
    var payload = AnalyticsCore.buildAnalyticsExport({
      exportedAt: Date.now(),
      modelVersion: MODEL_VERSION,
      rulesetHash: RULESET_HASH,
      snapshot: analysis.snapshot,
      confluence: confluence,
      radar: analysis.radar || null,
      datasets: datasets,
      evidence: analysis.snapshot ? analysis.snapshot.inputComponents : null,
      rawEvidence: analysis.rawEvidence || null
    });
    var json = JSON.stringify(payload, null, 2);
    try {
      var blob = new Blob([json], { type: 'application/json' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'snapshot-' + baseAsset(state.symbol) + '-' + state.interval + '-' + Date.now() + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
    } catch (error) { /* download opcional */ }
    var summary = 'Snapshot ' + baseAsset(state.symbol) + ' ' + intervalLabel(state.interval) + ' | Setup ' + signed(confluence.total) + ' (' + confluence.decision + ') | DC ' + confluence.dataConfidence + '% | modelo ' + MODEL_VERSION + ' | ' + (analysis.snapshot ? analysis.snapshot.inputSnapshotId : '--');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(summary).catch(function () { /* clipboard opcional */ });
  }
  function boardClosedCandles(symbol) {
    var item = state.board.find(function (row) { return row.symbol === symbol; });
    return item && item.interval === state.interval && Array.isArray(item.candles) ? selectClosedCandles(item.candles) : null;
  }
  function dailyDateKey(candle) { return new Date(candle.time).toISOString().slice(0, 10); }
  function renderCorrelation(a) {
    var ownCandles = selectClosedCandles(state.klines);
    var formatCorr = function (value) { return Number.isFinite(value) ? num(value, 2) : '--'; };
    var pairStatus = [];
    ['BTCUSDT', 'ETHUSDT'].forEach(function (benchmark) {
      var id = benchmark === 'BTCUSDT' ? 'corrBtcLine' : 'corrEthLine';
      if (state.symbol === benchmark) { text(id, '1.00 (proprio)'); return; }
      var benchCandles = boardClosedCandles(benchmark);
      if (!benchCandles || !ownCandles.length) {
        text(id, '--');
        if (benchmark === 'BTCUSDT') { text('betaBtcLine', '--'); text('rsBtcLine', '--'); }
        return;
      }
      var aligned = AnalyticsCore.alignedReturns(ownCandles, benchCandles);
      var correlation = AnalyticsCore.pearsonCorrelation(aligned.returnsA, aligned.returnsB);
      text(id, Number.isFinite(correlation) ? num(correlation, 2) + ' (' + aligned.samples + ' retornos)' : '--');
      if (benchmark === 'BTCUSDT') {
        text('betaBtcLine', formatCorr(AnalyticsCore.betaCoefficient(aligned.returnsA, aligned.returnsB)));
        var strength = AnalyticsCore.relativeStrength(aligned.returnsA, aligned.returnsB, 20);
        text('rsBtcLine', Number.isFinite(strength) ? percent(strength, 2) : '--');
      }
      pairStatus.push(benchmark);
    });
    if (state.symbol === 'BTCUSDT') { text('betaBtcLine', '1.00 (proprio)'); text('rsBtcLine', '0.00%'); }
    var daily = state.historyCandles[state.symbol];
    var tradfi = state.external.tradfi;
    ['QQQ', 'SPY'].forEach(function (benchmark) {
      var id = benchmark === 'QQQ' ? 'corrQqqLine' : 'corrSpyLine';
      var series = tradfi && Array.isArray(tradfi.assets) ? (tradfi.assets.find(function (asset) { return asset.symbol === benchmark; }) || {}).series : null;
      if (!daily || !daily.length || !series || !series.length) { text(id, '--'); return; }
      var dailyRows = daily.slice(-90).map(function (candle) { return { time: dailyDateKey(candle), close: candle.close }; });
      var benchRows = series.map(function (row) { return { time: row.date, close: row.close }; });
      var aligned = AnalyticsCore.alignedReturns(dailyRows, benchRows);
      var correlation = AnalyticsCore.pearsonCorrelation(aligned.returnsA, aligned.returnsB);
      text(id, Number.isFinite(correlation) ? num(correlation, 2) + ' (' + aligned.samples + 'd)' : '--');
    });
    text('correlationStatus', ownCandles.length ? intervalLabel(state.interval) + ' | ' + ownCandles.length + ' candles fechados' : '--');
  }
  function on(id, eventName, handler) {
    var node = $(id);
    if (!node) { if (typeof console !== 'undefined' && console.warn) console.warn('bind: elemento ausente #' + id); return; }
    node.addEventListener(eventName, handler);
  }
  function bind() {
    populateAssetSelect();
    setAssetTab(state.assetTab, false);
    setView(state.view);
    syncIntervalButtons(state.interval);
    syncSortButtons(state.sort);
    on('viewDashboardButton', 'click', function () { setView('dashboard'); });
    on('viewAssetButton', 'click', function () { setView('asset'); });
    on('refreshButton', 'click', function () { refresh(true); });
    on('intervalSelect', 'change', function (e) { setIntervalChoice(e.target.value); });
    on('symbolSelect', 'change', function (e) { selectSymbol(e.target.value, true); });
    on('liveButton', 'click', function () {
      state.live = !state.live;
      var live = $('liveButton');
      if (live) { live.classList.toggle('is-on', state.live); live.setAttribute('aria-pressed', String(state.live)); }
      if (state.live) connectLiquidationStream(state.symbol); else closeLiquidationStream();
      renderLiquidations();
    });
    on('timeTabs', 'click', function (e) { if (e.target.dataset.interval) setIntervalChoice(e.target.dataset.interval); });
    on('assetTabs', 'click', function (e) { if (e.target.dataset.assetTab) setAssetTab(e.target.dataset.assetTab); });
    on('assetGrid', 'click', function (e) { var card = e.target.closest('.asset-card'); if (card) selectSymbol(card.dataset.symbol, true); });
    on('overviewLeaders', 'click', function (e) { var row = e.target.closest('[data-symbol]'); if (row) selectSymbol(row.dataset.symbol, true); });
    on('overviewRisks', 'click', function (e) { var row = e.target.closest('[data-symbol]'); if (row) selectSymbol(row.dataset.symbol, true); });
    on('sortScoreButton', 'click', function () { setSort('score'); });
    on('sortChangeButton', 'click', function () { setSort('change'); });
    on('sortVolumeButton', 'click', function () { setSort('volume'); });
    on('newsModeSelect', 'change', function (e) {
      var manual = e.target.value !== 'auto';
      showNewsOverrideEditor(manual);
      if (!manual) {
        applyNewsMode('auto');
        var author = $('newsOverrideAuthor'), reason = $('newsOverrideReason');
        if (author) { author.value = ''; author.removeAttribute('aria-invalid'); }
        if (reason) { reason.value = ''; reason.removeAttribute('aria-invalid'); }
        setNewsOverrideFeedback('Modo automatico restaurado; autoria e motivo foram removidos do snapshot.', false);
      } else {
        var authorInput = $('newsOverrideAuthor'), reasonInput = $('newsOverrideReason');
        if (authorInput && state.newsOverrideAuthor) authorInput.value = state.newsOverrideAuthor;
        if (reasonInput && state.newsOverrideReason) reasonInput.value = state.newsOverrideReason;
        setNewsOverrideFeedback('Preencha autoria e motivo; o score so muda depois de aplicar.', false);
        if (authorInput) authorInput.focus();
      }
    });
    on('newsOverridePanel', 'submit', function (e) {
      e.preventDefault();
      var authorInput = $('newsOverrideAuthor'), reasonInput = $('newsOverrideReason'), selector = $('newsModeSelect');
      var author = cleanNewsOverrideText(authorInput && authorInput.value, 80);
      var reason = cleanNewsOverrideText(reasonInput && reasonInput.value, 180);
      if (authorInput) authorInput.setAttribute('aria-invalid', author ? 'false' : 'true');
      if (reasonInput) reasonInput.setAttribute('aria-invalid', reason ? 'false' : 'true');
      if (!author || !reason || !selector || selector.value === 'auto') {
        setNewsOverrideFeedback('Informe autor e motivo antes de aplicar o override.', true);
        if (!author && authorInput) authorInput.focus(); else if (!reason && reasonInput) reasonInput.focus();
        return;
      }
      authorInput.value = author;
      reasonInput.value = reason;
      if (applyNewsMode(selector.value, author, reason)) setNewsOverrideFeedback('Override aplicado e registrado no snapshot/export.', false);
    });
    ['newsOverrideAuthor', 'newsOverrideReason'].forEach(function (id) {
      on(id, 'input', function (e) {
        if (cleanNewsOverrideText(e.target.value, id === 'newsOverrideAuthor' ? 80 : 180)) e.target.setAttribute('aria-invalid', 'false');
      });
    });
    on('newsRefreshButton', 'click', async function () {
      text('newsStatus', 'Atualizando noticias e macro...');
      await loadNewsIfNeeded(true);
      if (state.analysis && analysisMatchesSelection(state.analysis)) {
        stampAnalysisSnapshot(state.analysis, 'news-refresh');
        renderConfluence(state.analysis);
        renderWrittenAnalysis(state.analysis);
        updateScore(state.analysis);
      }
    });
    on('externalRefreshButton', 'click', async function () {
      text('externalStatus', 'Atualizando...');
      await loadExternalContext(true);
      reapplyExternalContext();
    });
    document.querySelectorAll('[data-overlay]').forEach(function (input) {
      input.addEventListener('change', function (e) {
        state.chart[e.target.dataset.overlay] = e.target.checked;
        drawPriceChart();
      });
    });
    on('candleCountSelect', 'change', function (e) { state.chart.candles = +e.target.value || 120; drawPriceChart(); });
    on('evaluateSignalsButton', 'click', evaluateSignalOutcomes);
    on('exportSignalsButton', 'click', exportSignalsJournal);
    on('syncSignalsButton', 'click', function () {
      var input = $('signalSyncCode');
      var id = String(input && input.value || '').trim();
      if (!validSignalSyncId(id)) { setSignalSyncStatus('Codigo invalido: use de 32 a 128 letras, numeros, _ ou -.', false); return; }
      currentSignalSyncClient().setSyncId(id);
      syncDurableSignalJournal(loadSignalJournal());
    });
    on('copySignalSyncCodeButton', 'click', function () {
      var id = signalSyncId();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(id).then(function () { setSignalSyncStatus('Codigo privado copiado. Guarde-o como uma senha.', currentSignalSyncClient().state.configured); }).catch(function () { setSignalSyncStatus('Nao foi possivel copiar o codigo automaticamente.', false); });
    });
    on('clearSignalsButton', 'click', async function () {
      if (state.evaluatingSignals) { text('signalsStatus', 'Aguarde a avaliacao em andamento antes de limpar o journal.'); return; }
      if (!window.confirm('Limpar definitivamente o registro local e o journal duravel deste codigo?')) return;
      currentSignalSyncClient().cancelScheduled();
      await clearDurableSignalJournal();
      renderSignals();
    });
    on('lagBacktestButton', 'click', runLagBacktest);
    on('clearTradesButton', 'click', async function () {
      if (!window.confirm('Limpar definitivamente os trades simulados e os estados de posicao deste modelo?')) return;
      try {
        await withCrossTabLock(SIGNAL_MACHINE_LOCK, function clearTradesExclusive() {
          saveTradeJournal([]);
          saveMachineStates({});
        });
      } catch (error) {
        health('Concorrencia multiaba', false, 'falha ao limpar trades: ' + (error && error.message || 'erro'));
        return;
      }
      renderTradeEngine();
    });
    on('exportSnapshotButton', 'click', exportSnapshot);
    on('alertsEnabled', 'change', function (e) {
      if (!e.target.checked) { alertState.enabled = false; text('alertsStatus', 'Desativados'); return; }
      if (typeof Notification === 'undefined') { alertState.enabled = false; e.target.checked = false; text('alertsStatus', 'Navegador sem suporte'); return; }
      if (Notification.permission === 'granted') { alertState.enabled = true; text('alertsStatus', 'Ativos'); return; }
      Notification.requestPermission().then(function (permission) {
        alertState.enabled = permission === 'granted';
        e.target.checked = alertState.enabled;
        text('alertsStatus', alertState.enabled ? 'Ativos' : 'Permissao negada');
      }).catch(function () {
        alertState.enabled = false;
        e.target.checked = false;
        text('alertsStatus', 'Falha ao solicitar permissao');
      });
    });
    document.querySelectorAll('.position-calculator input').forEach(function (input) { input.addEventListener('input', calculatePosition); });
    document.querySelectorAll('.position-calculator select').forEach(function (select) { select.addEventListener('change', calculatePosition); });
    applyIndicatorHelp();
    calculatePosition();
    var resizeDrawTimer = null;
    window.addEventListener('resize', function () {
      if (resizeDrawTimer) clearTimeout(resizeDrawTimer);
      resizeDrawTimer = setTimeout(function () { drawPriceChart(); drawRsiChart(); drawMacdChart(); drawVolumeChart(); drawFlowChart(); }, 100);
    });
    window.addEventListener('beforeunload', closeLiquidationStream);
    document.addEventListener('visibilitychange', function () { if (state.live && !document.hidden) refresh(true); });
    state.timer = setInterval(function () { if (state.live && !document.hidden) refresh(); }, REFRESH_MS);
  }
  function runQuantSelfCheck() {
    var rising = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
    var flat = Array.from({ length: 24 }, function () { return 5; });
    var sampleCandles = rising.map(function (value, index) { return { time: index, open: value - 0.2, high: value + 0.5, low: value - 0.5, close: value, volume: 100 + index, takerBuy: 55 + index / 2 }; });
    var emaTest = emaSeries([1, 2, 3, 4, 5], 3);
    var bbTest = bollinger(flat, 20, 2);
    var noDerivativeData = buildCoreAnalysis(sampleCandles, null, null, { interval: '1M' });
    var radarTest = buildRadarScore('BTCUSDT', noDerivativeData);
    var derivativeNow = Date.now();
    var derivativeOrderTest = normalizeDerivativeDetail([
      { timestamp: derivativeNow - 1_000, sumOpenInterestValue: '200' },
      { timestamp: derivativeNow - 2_000, sumOpenInterestValue: '100' }
    ], [], [], [], [], [], []);
    var checks = [
      lastFinite(emaTest) === 4,
      rsi(rising, 14) === 100,
      bbTest.latestMid === 5 && bbTest.latestUpper === 5 && bbTest.latestLower === 5,
      Math.abs(atr(sampleCandles, 14) - 1.5) < 0.000001,
      williamsR(sampleCandles, 14) <= 0 && williamsR(sampleCandles, 14) >= -100,
      noDerivativeData.derivScore === 0,
      radarTest.radar.components.find(function (part) { return part.name === 'Derivativos'; }).available === false,
      derivativeOrderTest.oiChangePct === 100 && derivativeOrderTest.oiWindowStart === derivativeNow - 2_000,
      normalizeSymbol('eth') === 'ETHUSDT' && normalizeSymbol('X'.repeat(100)) === 'BTCUSDT',
      Math.abs(((98000 + 3 * 60000) / 4) - 69500) < 0.000001
    ];
    return { ok: checks.every(Boolean), passed: checks.filter(Boolean).length, total: checks.length };
  }
  state.quantChecks = runQuantSelfCheck();
  reportLegacyStorage();
  bind(); initDurableSignalSync(); refresh();
})();
