# Crypto Live Desk

Dashboard de acompanhamento de mercado cripto com radar multiativos, leitura tecnica, derivativos, contexto macro, dados institucionais e calculadora de posicao.

Producao atual: https://crypto-live-desk.vercel.app

> **Transicao de desenvolvimento:** mudancas posteriores ao commit `803eb67` estao sendo realizadas pelo Codex e permanecem sujeitas a revisao independente no Claude Code. O marco, a autoria, os testes e o estado de cada conjunto de mudancas estao em [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md).

## Estado do modelo

O modelo analitico em estabilizacao usa a versao de migracao `1.0.0-preview.6`. Ela implementa parte do contrato v1, sem declarar conformidade completa, e separa tres conceitos:

- **Radar Score:** ordena os 24 ativos no dashboard.
- **Setup Score:** explica a confluencia do ativo e timeframe selecionados.
- **Data Confidence:** mede cobertura dos dados; nao e probabilidade de acerto.

Sinais confirmados usam apenas candles fechados. O candle em formacao continua visivel como preco/grafico ao vivo. Proxies BTC para altcoins sao apenas informativos e nao entram no Setup Score nem no Data Confidence do ativo.

Cada dataset controlado registra `observedAt`, `retrievedAt` e `cacheStoredAt`. A elegibilidade e recalculada no instante do score: dados `stale`, ausentes, invalidos ou usados como proxy permanecem visiveis quando ajudam a explicar o contexto, mas deixam de contribuir para score e cobertura.

O ativo selecionado recebe um `inputSnapshotId` e uma revisao visivel. Quando historico, noticias ou contexto externo alteram o resultado, a revisao e o horario do snapshot tambem mudam; o painel nao reaproveita o horario de um calculo anterior.

As regras normativas e os criterios de aceitacao estao em [`ANALYTIC_CONTRACT_V1.md`](ANALYTIC_CONTRACT_V1.md).

## Execucao local

Requer Node.js 22 ou superior.

```powershell
npm.cmd run dev
```

Abra `http://127.0.0.1:5173`.

## Testes

Testes unitarios e de integracao, sem dependencias externas:

```powershell
node --test
```

O smoke test inicia um servidor local temporario quando necessario, controla o Microsoft Edge em modo headless e valida carregamento, console, os 24 ativos, troca rapida de ativo e timeframe, identidade dos cards e snapshots, candles fechados, nomenclatura dos scores, proxy BTC, calculadora e layout movel sem overflow:

```powershell
node scripts/browser-smoke.cjs
```

Os mesmos comandos estao disponiveis como `npm test` e `npm run test:browser` quando a politica do PowerShell permite executar `npm.ps1`.

O workflow `.github/workflows/quality.yml` executa a suite deterministica em Node.js 22 (ubuntu) em cada pull request e push na `main`. O smoke do Edge headless roda como job informativo nao bloqueante: os runners hospedados do GitHub ficam em regiao geo-restringida pela Binance (HTTP 451), entao o gate autoritativo do smoke e executado localmente e contra o deploy antes de cada release.

## Estrutura

- `lib/analytics-core.js`: funcoes puras e testaveis do motor.
- `app.js`: orquestracao de dados, estado e interface.
- `api/`: proxies e normalizadores executados na Vercel.
- `test/`: contratos unitarios e integracoes isoladas.
- `scripts/browser-smoke.cjs`: verificacao funcional no navegador.
- `ANALYTICS_COVERAGE.md`: fontes e cobertura analitica.

## Funcionalidades analiticas

- Aba **Sinais**: registro local (por versao do modelo) de cada Setup Score confirmado por candle fechado, com avaliacao posterior do retorno em 1h/24h/7d e acerto por faixa de score. E a base de dados para o backtesting walk-forward futuro.
- **Alertas** opcionais do navegador em transicoes confirmadas: cruzamento de score, mudanca de vies/regime, funding extremo e pico de liquidacoes.
- **Exportar snapshot**: JSON auditavel com envelope completo (modelo, hash de regras, snapshot de entradas, contribuicoes por componente e frescor dos datasets).
- **Correlacao cross-asset**: correlacao, beta e forca relativa vs BTC/ETH no timeframe atual e correlacao diaria vs QQQ/SPY.
- **Microestrutura cross-venue**: CVD dos 1.000 aggTrades mais recentes e comparacao informativa de preco entre Binance, Coinbase, Bybit e OKX; ainda fora dos scores.
- **CFTC COT**: posicionamento semanal oficial do Bitcoin CME em contratos, exibido como contexto institucional e ainda fora dos scores.
- Painel "Como este score foi calculado?": regra, contribuicao, limite, estado, escopo e fontes de cada componente, com reconciliacao da soma.

## Limites

- Scores sao heuristicas direcionais, nao recomendacoes ou probabilidades calibradas.
- Preco de liquidacao e aproximado; brackets e taxas reais dependem da conta.
- Backtesting walk-forward e calibracao de probabilidade exigem meses de sinais acumulados pela aba Sinais; ainda nao ha validacao estatistica.
- O diretorio Git real do repositorio e `.gitdir` (relocado por causa de interferencia do OneDrive). Para confiabilidade duradoura, o repositorio deve ser clonado fora de uma pasta sincronizada.
