# Crypto Live Desk - cobertura analitica

## Modelo analitico 1.0.0-preview.8

Esta e uma versao de migracao parcial. O contrato normativo completo esta em `ANALYTIC_CONTRACT_V1.md`. A interface distingue:

- Radar Score para comparacao e ordenacao dos ativos.
- Setup Score para a confluencia do ativo selecionado.
- Data Confidence para cobertura dos dados, sem interpretar o valor como probabilidade de acerto.

Indicadores e eventos confirmados usam apenas candles fechados. Opcoes e mempool BTC exibidos para altcoins sao proxies informativos e possuem contribuicao zero nos scores especificos e no Data Confidence do ativo.

## Estado local CX-012 — em revisao

- A rota `market.overview.v1` e o primeiro piloto do envelope unificado: contrato, tempos de observacao/disponibilidade/recuperacao, status, cobertura, qualidade, SLA, proveniencia, fallback e hash do payload.
- A interface possui um bloco inicial `Saude dos dados` para o piloto. Ele declara a migracao parcial e nao transforma qualidade em sinal direcional.
- Erros publicos passam por sanitizacao central; perda do lease entre abas interrompe sincronizacao antes do commit; o Redis possui limite global atomico de 10.000 registros alem do limite por namespace.
- Mercado e macro possuem validacao de schema observada; macro publica `availableAt`, `vintageAt` e `backtestSafe:false` enquanto os upstreams atuais nao fornecerem a primeira publicacao. O health registry piloto mede p50/p95, erro, cache, fallback e ultimo sucesso com escopo explicitamente `instance`.
- Gate Codex: 336/336 testes; cobertura 97,49% linhas, 82,03% branches e 96,87% funcoes. Estado: **AGUARDANDO CLAUDE CODE**; nenhuma mudanca CX-012/CX-013 foi publicada.

## Mudancas do 1.0.0-preview.6 (podem alterar resultados vs preview.5)

Correcoes de logica direcional e double-counting apontadas pela revisao cruzada do Claude Code (RC-001) e aplicadas apos verificacao adversarial independente (RC-003). Como mudam a semantica de score, `rulesetHash` e a versao do modelo foram incrementados; o journal de sinais da preview.5 e segmentado por versao (nao agregado ao da preview.6).

1. Risco: sobrevenda (banda inferior + RSI extremo) passa de -6 para +8, espelhando a sobrecompra (-8) — a sobrevenda e risco de repique contra shorts, nao confirmacao de baixa. RSI 32 espelha o gatilho 68 em torno de 50.
2. Fluxo: sweep de maxima passa a exigir rejeicao abaixo do VWAP para o peso cheio (-8), espelhando o reclaim exigido no sweep de minima; antes o sweep de maxima pontuava -8 incondicional.
3. Fluxo: delta/CMF deixam de ser recontados no smart money (ja pontuam em flowScore), eliminando double-count dentro do componente de fluxo.
4. Risco: sweep puro sai do bloco de risco (ja pontua em fluxo via smart money); os termos sweep+liquidacao, que exigem tambem desequilibrio de liquidacoes, permanecem.
5. Fluxo: volume relativo alto deixa de somar +5 direcionless (um selloff de volume alto nao e altista); o volume ainda marca cobertura e a leitura direcional volume x delta segue no bloco de risco. Normalizacao do Radar Fluxo ajustada de /18 para /13.
6. Derivativos: carry ganha degrau de capitulacao (backwardation < -30% a.a. -> +3), dando ao lado negativo a mesma estrutura de dois degraus do lado positivo; o piso de +2 permanece em -10% a.a. porque o funding neutro ja anualiza a ~+11%.
7. Derivativos: as duas lentes de funding (percentil vs propria historia, ate +/-6, e carry anualizado, ate +/-3) passam a ser combinadas com clamp conjunto de +/-7 — cada lente mantem autoridade plena sozinha; apenas a cauda correlacionada (euforia/capitulacao, quando co-disparam) e limitada, para um unico dado nao dominar o bucket de +/-12.
8. Data Confidence: fonte de fallback equivalente (CoinPaprika no lugar da CoinGecko) passa a receber credito de proveniencia parcial (fator 0.8 registrado no ruleset) no bloco Fundamental do Radar e no contexto do Setup — o DC cai levemente quando o contexto de mercado esta coberto apenas pelo fallback. Nenhum score direcional muda por isso.

## Mudancas da auditoria preview.7-codex.2

1. Entradas analiticas e de API passaram a rejeitar timestamps futuros, valores negativos impossiveis, campos ausentes convertidos em zero, OHLCV incoerente, duplicatas e ordem temporal invalida.
2. A identidade do snapshot inclui as entradas em tempo real que alteram o Setup Score; o export schema 3 agora carrega tambem um envelope bruto imutavel com 12 datasets, series integrais normalizadas, manifesto e hashes verificaveis apos round-trip.
3. Candles fechados, outcomes de 1h/24h/7d, gaps, volatilidade realizada, multi-timeframe, traps, stops e journal receberam testes causais, adversariais e de simetria long/short.
4. APIs usam deadline absoluto, erros semanticos e parciais tipados, allowlists de ativos, cabecalhos coerentes, politica same-origin e limite local; quando Redis existe, o mesmo gate adiciona sliding window distribuido.
5. Cache, tentativa/backoff e coalescencia reduzem fan-out; todas as chamadas do cliente compartilham budget de concorrencia, janela global, fatia por fonte, prioridade e fila. A limitacao distribuida foi posteriormente ativada e sondada em producao para `preview.8`; alteracoes do CX-012 continuam locais.
6. Interface recebeu estados indisponiveis explicitos, cobertura MTF, timezone explicito (header, journal, trades, sinais e noticias formatados via `formatDisplayTimestamp` com o fuso rotulado; UX-005 corrigido pos-REV-CC-01 com teste de virada de dia), foco visivel, alvos de toque, grafico mobile adaptativo e calculadora limitada contra `NaN`/infinito.
7. A suite deterministica inclui fuzz com sementes fixas e contratos de API; navegador integrado validou os fluxos principais em desktop e 390 x 844 px.
8. O registro normativo `SOURCE_REGISTRY` descreve 22 fontes com metricas, unidades, validadores, escopo, relogio, TTL, fallback, proveniencia, cache, indisponibilidade e elegibilidade; sua versao integra o ruleset e o export.
9. Fluxos ETF recebem `reported`/`reportReason` por flag do provedor ou calendario de sessoes dos EUA; o parser atravessa envelopes MCP aninhados e preserva zero reportado em dia de negociacao.
10. Override manual de noticias exige autor e motivo antes de mudar o score e registra ambos no snapshot, export e explicacao; voltar a `Auto` remove a trilha manual ativa.
11. O envelope bruto foi exercitado no browser e reaberto fora da UI: BTC/5m continha 500 candles spot, seis series MTF, sete series de derivativos e 3.252 candles historicos; os 12 hashes e o hash global foram validados em um arquivo de 3.524.193 bytes.
12. O journal ganhou cliente de sincronizacao isolado, backend Redis, retencao que nunca sacrifica horizontes pendentes e worker cron para outcomes sem aba. Storage, segredo, concorrencia e limpeza foram posteriormente sondados em producao para `preview.8`; o CX-012 amplia os limites locais sem afirmar deploy.
13. Rede/orcamento e sincronizacao/persistencia foram extraidos do `app.js` para modulos UMD independentes, incluindo regressao contra vazamento entre codigos privados concorrentes.
14. Esta rodada foi feita via Codex e recebeu revisao cruzada parcial do Claude Code (REV-CC-01, checkpoint `887ec57`): 41 achados `REVISADO PELO CLAUDE CODE`, 24 ainda `AGUARDANDO CLAUDE CODE` com correcao exigida, 7 `CONFIRMADO`. Nao declara conformidade integral com o contrato v1 e nao esta pronta para producao (2 defeitos P1). Ver `CODEX_HANDOFF.md` REV-CC-01.
15. A persistencia adota o snapshot canonico remoto no primeiro sync, usa merge+schedule atomico em Lua e serializa limpeza contra GET/POST em voo. A ressalva original da REV-CC-01 foi corrigida em CC-FIX-01: os scripts de producao executam em VM Lua nos testes e a sonda remota confirmou o primeiro snapshot canonico.
16. O worker compartilha janelas de mercado, le a fila em pipeline, usa lease distribuido e processa ate 300 itens/24s. Isso cobre um cliente 5m continuo, mas nao transforma o cron Hobby diario em arquitetura multiusuario escalavel.
17. O gate do checkpoint historico foi revisado no Claude Code. O lote local CX-012 possui 329 testes aprovados pelo Codex e cobertura de 97,45% linhas, 81,71% branches e 96,72% funcoes, com os mesmos pisos bloqueantes; o denominador continua sem `app.js` (ver OPS-014).

## Mudancas do preview.6

1. Microestrutura: CVD recente usa os ultimos 1.000 `aggTrades` da Binance e classifica o lado agressor pelo campo `m` da API.
2. Cross-venue: Binance, Coinbase, Bybit e OKX sao normalizadas em uma leitura de mediana, dispersao e Coinbase premium vs Binance.
3. As novas leituras sao informativas: nao alteram Radar Score, Setup Score ou Data Confidence enquanto nao houver historico e validacao suficientes.
4. Falhas parciais permanecem explicitas por venue; ausencia de uma fonte nao vira preco zero nem sinal direcional.
5. CFTC COT: posicionamento semanal oficial do contrato Bitcoin CME exibe non-commercial net, variacao semanal, commercial net e open interest em contratos, sem conversao enganosa para BTC ou USD.

## Mudancas acumuladas do preview.3 ao preview.5

1. Derivativos: semantica de funding, long/short e quadrante OI x preco reconciliada em uma unica regra, com percentis por ativo quando ha historico suficiente.
2. Estrutura: detectores de CHoCH/BOS, divergencia, climax de volume, squeeze, carry e traps passam a alimentar gates e vetos direcionais.
3. Multi-timeframe: alinhamento e gates HTF consideram explicitamente a direcao compradora ou vendedora, sem tratar disponibilidade como confirmacao.
4. Historico: amostras independentes, excesso contra base rate, decay temporal e comparacao por tercil de volatilidade reduzem vies de selecao.
5. Sinais v2: maquina de estados por par e timeframe, entradas com gatilho nomeado, stops/alvos estruturais, saidas conservadoras e journal local de trades simulados.
6. Validacao: cenarios bidirecionais e estudo do lag do CHoCH foram adicionados como diagnosticos; eles nao constituem backtest de rentabilidade nem probabilidade calibrada.

## Mudancas do 1.0.0-preview.2 (podem alterar resultados vs preview.1)

1. Noticias: palavras-chave agora exigem fronteira de palavra ("ban" nao casa mais "bank", "war" nao casa "warns") e a relevancia de ativo exige ticker maiusculo exato ou nome completo ("sui" nao casa mais "lawsuit"; "near"/"op" em prosa nao contam). Efeito esperado: score de noticias menos negativo em manchetes bancarias comuns e menos falsos positivos por ativo.
2. Radar Score: sem nenhum bloco disponivel o resultado agora e `null`/`Indisponivel` (antes exibia 0/Neutro). Ativos sem dados vao para o fim da ordenacao.
3. Data Confidence do Radar: passa a ser graduado por qualidade de cada bloco (cobertura de candles, cobertura de taker, amostras do historico), nao mais a soma binaria dos pesos presentes.
4. On-chain: os ajustes de Coin Metrics e netflow entram ANTES da agregacao do score central; `score`, `coreScore` e `bias` voltam a reconciliar com os componentes.
5. Protocolo DeFiLlama: match implicito por nome/ticker exige TVL >= $1M; protocolos homonimos de $0 nao geram mais contexto nem "+0.00%".
6. Ichimoku: a nuvem atual usa os spans projetados de 26 barras atras (definicao padrao). Leituras de reversao mudam.
7. Netflow 7d: exige cobertura de pelo menos 5 dos 7 dias; abaixo disso o valor fica indisponivel em vez de subestimado.
8. Fluxo de candles: o delta taker exige cobertura de pelo menos 50% da janela de 40 candles.
9. Contexto externo: variacoes ausentes de mercado/chain/protocolo nao contam mais como 0% observado; falha total das 11 fontes preserva a leitura anterior como stale em vez de fabricar um zero fresco.
10. `observedAt` de opcoes/contexto tolera apenas o skew explicitamente aceito; timestamps futuros alem dessa tolerancia ficam invalidos. `fetchedAt` nao substitui o instante observado. ETF usa a data da ultima linha realmente reportada e fica indisponivel quando ela nao existe.
11. `inputSnapshotId` passa a ser derivado apenas das entradas (candle fechado + carimbo de cada dataset + modo de noticias); o horario do calculo e a revisao ficam em campos separados.

## Atualidade e elegibilidade

O horario em que a fonte observou o dado (`observedAt`) e separado do horario em que o painel o recuperou (`retrievedAt`) e o guardou em cache (`cacheStoredAt`). Somente a idade da observacao decide se o dado pode alterar o score. A elegibilidade e reavaliada a cada calculo, inclusive com o modo ao vivo desligado.

| Dataset | Atualizacao de rede | Limite de observacao para score |
| --- | ---: | ---: |
| Derivativos historicos | 15 s | 2x o timeframe, minimo 45 s |
| Opcoes Deribit | 60 s | 5 min |
| Coin Metrics diario | 15 min | 48 h |
| ETF / institucional | 5 min | 96 h |
| Microestrutura cross-venue | 15 s | 60 s, apenas informativo |
| CFTC COT Bitcoin CME | 5 min no cliente / 6 h no proxy | 10 dias, apenas informativo |
| Noticias RSS | 5 min | 36 h por noticia |
| Contexto externo agregado | 2 min | 10 min |
| Perfil historico | 6 h | 48 h apos o ultimo candle diario fechado |

Estados `stale`, `missing`, `invalid`, `error` e `informational` tem contribuicao zero. Respostas em cache nao renovam artificialmente o horario observado.

## Principios

- O score mede confluencia, nao probabilidade garantida de lucro.
- Dados ausentes sao neutros e reduzem a confianca; nao recebem nota negativa.
- Market cap perdido nao representa, por si so, dinheiro que saiu do ativo.
- Padroes graficos sao hipoteses. Um padrao so e operacional depois de confirmacao no fechamento, volume e invalidacao objetiva.
- Liquidacoes, fluxo de exchanges e opcoes nao devem ser estimados sem uma fonte propria.
- CVD recente nao e CVD historico completo: cobre apenas a janela de `aggTrades` declarada na interface.
- Posicoes CFTC sao contratos do CME; o painel nao as apresenta como BTC ou USD.

## Score do radar multiativos

O radar usa o mesmo conjunto de pesos para todos os ativos e renormaliza apenas pelos blocos presentes.

| Bloco | Peso | Dados |
| --- | ---: | --- |
| Tecnica do timeframe | 30% | EMAs, RSI, MACD, ADX e estrutura |
| Fluxo | 15% | Delta taker aproximado, volume e CMF |
| Derivativos | 10% | Funding e basis Binance |
| Fundamental/contexto | 15% | CoinGecko e DeFiLlama por ativo/rede |
| Macro e noticias | 10% | Sentimento, Treasury, VIX, TradFi e RSS |
| Historico | 15% | Regimes semelhantes no historico diario completo |
| Momentum de 24h | 5% | Ticker Binance |

Formula:

score = soma(score_normalizado_do_bloco * peso_disponivel) / soma(pesos_disponiveis)

confianca = soma(pesos_disponiveis)

Os thresholds atuais sao:

- >= +35: vies comprador.
- <= -35: vies vendedor.
- Entre os dois: neutro.

## Dados conectados e utilizados

### Binance Spot

- Candles OHLCV e quote volume.
- Numero de trades.
- Taker buy base volume.
- Ticker 24h, range, VWAP e volume.
- Livro de ofertas com profundidade de 0,1% e 0,5%.
- Spread, microprice e slippage aproximado.
- Historico diario completo por ativo.
- Todos os timeframes publicos: 1s a 1M.

### Binance Futures

- Open interest atual e historico.
- Funding atual e historico.
- Premium, mark price, index price e basis.
- Long/short global.
- Long/short de contas de top traders.
- Long/short das posicoes de top traders.
- Taker buy/sell ratio.
- Liquidacoes reais observadas pelo stream forceOrder do par.

### Deribit

- DVOL e variacao de sete dias.
- Open interest e volume put/call.
- IV ATM e IV ponderada.
- Max pain aproximado por open interest.
- Expected move ate o vencimento.
- Delta, gamma, vega e theta das opcoes ATM.
- Cobertura nativa de score apenas para BTC, ETH e SOL. Para os demais ativos, BTC pode aparecer somente como proxy visual explicitamente excluido do Setup Score.

### Coin Metrics Community

- Enderecos ativos.
- Transacoes.
- Valor transferido ajustado.
- Fees em USD.
- MVRV e NVT quando cobertos pelo ativo.
- Exchange inflows, outflows, netflow e supply em exchanges quando cobertos.

### DeFiLlama

- TVL por rede e protocolo.
- Stablecoin supply e variacoes.
- Volume DEX e variacao.
- Fees e open interest de perps DeFi.

### Macro, noticias e mercados correlatos

- US Treasury 2Y, 10Y e 30Y.
- Curva 10Y-2Y.
- VIX e variacao de cinco dias.
- Fear & Greed.
- Mercado global CoinGecko/CoinPaprika.
- RSS cripto e macro.
- COIN, MSTR, MARA, RIOT, HOOD, NVDA, QQQ, SPY, GLD e TLT em fechamento diario.

## Indicadores calculados atualmente

### Tendencia e estrutura

- EMA 9, 20, 21, 50 e 200.
- Golden cross e death cross.
- ADX, DI+ e DI-.
- Supertrend.
- Ichimoku.
- Donchian e Keltner.
- HH/HL, LH/LL e range.
- Suportes, resistencias e pivots.
- Fibonacci no grafico.
- Regime estrutural, forca e volatilidade.

### Momentum

- RSI de Wilder.
- Stochastic RSI.
- MACD e histograma.
- MFI.
- ROC.
- Williams %R.
- CCI.
- Z-score.

### Volume, fluxo e execucao

- Volume relativo.
- OBV.
- CMF.
- Delta taker aproximado.
- VWAP movel.
- Volume profile POC aproximado.
- Imbalance do livro.
- Microprice, spread e slippage.

### Volatilidade

- ATR de Wilder.
- Bollinger Bands, %B e bandwidth.
- Volatilidade realizada anualizada.
- Squeeze por Bollinger/Keltner.

### Smart money e padroes

- Sweeps de maxima/minima.
- Fair value gaps.
- Deslocamento por corpo, ATR e volume.
- Fases de preco + OI.
- Topo/fundo duplo.
- OCO/OCO invertido potencial.
- Cunhas.
- Bull trap e bear trap.
- Doji, martelo e estrela cadente.

## Indicadores adicionais calculaveis com a base atual

### Preco e tendencia

- SMA, WMA, HMA, DEMA e TEMA.
- Parabolic SAR.
- Aroon e Vortex.
- Choppiness Index.
- TRIX, TSI e KST.
- Elder Ray e Fisher Transform.
- Pivot points classicos, Camarilla e Woodie.
- Canais de regressao e slope normalizado por ATR.

### Volume e microestrutura

- Accumulation/Distribution Line.
- Chaikin Oscillator.
- Force Index e Ease of Movement.
- Volume Price Trend.
- Negative/Positive Volume Index.
- Klinger Volume Oscillator.
- Anchored VWAP por pivot, rompimento ou evento.
- Value Area High/Low e volume profile por sessao.
- CVD aproximado por candles.
- Book imbalance por multiplas bandas e resiliencia do book.

### Volatilidade e risco

- Parkinson, Garman-Klass, Rogers-Satchell e Yang-Zhang.
- Percentil de volatilidade.
- Volatility cone por timeframe.
- Ulcer Index.
- Calmar, Sortino e Sharpe historicos.
- Expected shortfall e Value at Risk.
- Maximum adverse/favorable excursion por setup.

### Cross-asset

- Correlacao e beta rolantes contra BTC, ETH, QQQ, SPY, GLD e TLT.
- Forca relativa contra BTC e ETH.
- Breadth de altcoins.
- Dispersao de retornos.
- Regimes de dominancia e rotacao.
- Lead/lag entre cripto, mineradoras e Nasdaq.

### Derivativos

- Funding anualizado e percentil historico.
- Z-score do open interest.
- Divergencias preco/OI.
- Basis anualizada.
- Crowding entre global e top traders.
- Alavancagem implicita por OI/volume.
- Probabilidade historica de squeeze, validada por eventos observados.

## Gaps que exigem outra fonte

### Dados que nao devem ser fabricados

- Liquidation heatmap historico e liquidacoes por nivel futuro.
- Carteiras rotuladas de baleias e entidades, mantidas fora do produto enquanto nao houver uma fonte gratuita auditavel.
- Fluxos por exchange individual alem da cobertura agregada da Coin Metrics.
- Detalhamento por ticker de ETF quando a fonte publica nao fornecer a abertura.
- Skew 25-delta e term structure completos sem consolidacao adicional.
- Livro consolidado de varias exchanges.
- Taxa exata da conta Binance.
- Brackets exatos de manutencao e preco oficial de liquidacao da posicao.

### Fontes gratuitas candidatas

- FRED, BLS, ECB e bancos centrais: calendario e series macro publicas.
- CFTC e SEC: posicionamento, filings e eventos regulatorios publicos.
- APIs publicas de exchanges: livro, trades, derivativos e liquidacoes observadas em tempo real.
- DeFiLlama e protocolos: TVL, stablecoins, bridges, DEX e fees publicos.
- Binance autenticada, somente leitura e no backend: comissoes, VIP e brackets da propria conta.

## Conector institucional gratuito

- CryptoETF public MCP: fluxos diarios de ETFs de BTC, ETH, SOL, XRP e HYPE sem chave.
- Nao ha dependencia de API paga nesse bloco.

## Roadmap recomendado

1. Backtesting walk-forward por ativo, timeframe e regime.
2. Registro de cada sinal, versao do modelo e resultado posterior.
3. Calibracao de probabilidade, nao apenas score.
4. Alertas por mudanca de regime e nao por oscilacao de um unico indicador.
5. Portfolio risk: correlacao, exposicao agregada, drawdown e risco por setor.
6. Calendario de eventos: macro, unlocks, upgrades, julgamentos e earnings.
7. Manter liquidation heatmap, skew completo e whales rotuladas fora do score ate existir uma fonte gratuita auditavel.
8. Integracao autenticada isolada no servidor para taxas reais da conta, sem expor chaves no navegador.
