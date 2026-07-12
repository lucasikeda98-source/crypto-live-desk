# Crypto Live Desk

Dashboard de acompanhamento de mercado cripto com radar multiativos, leitura tecnica, derivativos, contexto macro, dados institucionais e calculadora de posicao.

Producao atual: https://crypto-live-desk.vercel.app

## Estado do modelo

O modelo analitico em estabilizacao usa a versao de migracao `1.0.0-preview.2`. Ela implementa parte do contrato v1, sem declarar conformidade completa, e separa tres conceitos:

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

O workflow `.github/workflows/quality.yml` executa a suite deterministica em Node.js 22 a cada push e pull request. O smoke do Edge fica separado como canario local, pois depende de navegador e fontes externas reais.

## Estrutura

- `lib/analytics-core.js`: funcoes puras e testaveis do motor.
- `app.js`: orquestracao de dados, estado e interface.
- `api/`: proxies e normalizadores executados na Vercel.
- `test/`: contratos unitarios e integracoes isoladas.
- `scripts/browser-smoke.cjs`: verificacao funcional no navegador.
- `ANALYTICS_COVERAGE.md`: fontes e cobertura analitica.

## Limites

- Scores sao heuristicas direcionais, nao recomendacoes ou probabilidades calibradas.
- Preco de liquidacao e aproximado; brackets e taxas reais dependem da conta.
- Backtesting walk-forward, registro persistente de sinais e calibracao ainda fazem parte das proximas entregas.
- A metadata Git possui uma copia de seguranca em `.gitdir` por causa de interferencia do OneDrive. Para confiabilidade duradoura, o repositorio deve ser clonado fora de uma pasta sincronizada.
