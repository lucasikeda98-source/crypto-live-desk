# Crypto Live Desk

Dashboard de acompanhamento de mercado cripto com radar multiativos, leitura tecnica, derivativos, contexto macro, dados institucionais e calculadora de posicao.

Producao atual: https://crypto-live-desk.vercel.app

> **Divergencia operacional conhecida:** a producao ainda responde com um contrato anterior e nao contem a arvore Codex descrita abaixo. O checkpoint remoto mais novo inspecionado e um preview `READY` do commit `b124fcb`; nenhuma mudanca desta rodada foi publicada ou promovida. A arvore desta rodada foi commitada e pushada como `887ec57` (branch `codex/cycle-d-sources`), mas **nao deployada**: nao existe preview nem producao para esse commit.

> **Transicao de desenvolvimento:** mudancas posteriores ao commit `803eb67` estao sendo realizadas pelo Codex e permanecem sujeitas a revisao independente no Claude Code. O marco, a autoria, os testes e o estado de cada conjunto de mudancas estao em [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md).

## Estado do modelo

O modelo analitico em estabilizacao usa a versao `1.0.0-preview.8` — merge do `1.0.0-preview.6` (main, RC-001..RC-009) com o `1.0.0-preview.7-codex.2` (ciclo D via Codex, revisado na REV-CC-01 e corrigido integralmente no CC-FIX-01; ver [`CODEX_HANDOFF.md`](CODEX_HANDOFF.md)). Ela implementa parte do contrato v1, sem declarar conformidade completa, e separa tres conceitos:

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
npm.cmd ci
npm.cmd run dev
```

Abra `http://127.0.0.1:5173`.

## Testes

O checkpoint atual possui 250 testes unitarios/de integracao deterministas (reexecutados de forma independente pelo Claude Code em Node 24), com fontes remotas substituidas por fixtures/mocks. O CI tambem bloqueia cobertura abaixo de 95% linhas, 75% branches e 90% funcoes e audita dependencias (nota: o denominador de cobertura nao inclui `app.js`, que roda so no navegador — ver `OPS-014`):

```powershell
npm.cmd test
npm.cmd run test:coverage
npm.cmd audit --audit-level=low
```

O smoke test inicia um servidor local temporario quando necessario, controla o Microsoft Edge em modo headless e valida carregamento, console, os 24 ativos, troca rapida de ativo e timeframe, identidade dos cards e snapshots, candles fechados, nomenclatura dos scores, proxy BTC, calculadora e layout movel sem overflow:

```powershell
node scripts/browser-smoke.cjs
```

Os mesmos comandos estao disponiveis como `npm test` e `npm run test:browser` quando a politica do PowerShell permite executar `npm.ps1`.

O workflow `.github/workflows/quality.yml` executa a suite deterministica em Node.js 22/24 em cada pull request e push na `main`, e um **boot-check de navegador bloqueante** (`npm run test:boot`): Chromium headless valida que o app carrega sem excecao nao capturada mesmo com todas as fontes de rede indisponiveis, com o DOM esperado e sem overflow em 390 px — este gate independe da Binance e roda em runner geo-restringido. O smoke completo do Edge headless segue como job advisory (OPS-003/REV-CC-01): os runners hospedados do GitHub ficam em regiao geo-restringida pela Binance (HTTP 451), entao o gate autoritativo do smoke e executado localmente e contra o deploy antes de cada release.

## Estrutura

- `lib/analytics-core.js`: funcoes puras e testaveis do motor.
- `lib/request-client.js`: rede do navegador, budget, cooldown e fallback.
- `lib/signal-sync-client.js`: identidade, conciliacao e sincronizacao do journal.
- `lib/durable-signals.js`: schema, retencao e fila duravel Redis.
- `app.js`: estado, composicao das fontes e interface; rede/persistencia ja possuem fronteiras extraidas.
- `api/`: proxies e normalizadores executados na Vercel.
- `test/`: contratos unitarios e integracoes isoladas.
- `scripts/browser-smoke.cjs`: verificacao funcional no navegador.
- `ANALYTICS_COVERAGE.md`: fontes e cobertura analitica.

## Funcionalidades analiticas

- Aba **Sinais**: registro segmentado por versao do modelo, com avaliacao posterior do retorno em 1h/24h/7d e acerto por faixa. Pendentes sao protegidos do cap. O codigo inclui sincronizacao privada Redis, merge atomico e worker independente da aba com lease, janelas compartilhadas e ate 300 itens/24s por invocacao; sem Redis/cron provisionados na Vercel, a UI preserva o fallback local e declara que a durabilidade remota esta indisponivel.
- **Alertas** opcionais do navegador em transicoes confirmadas: cruzamento de score, mudanca de vies/regime, funding extremo e pico de liquidacoes.
- **Exportar snapshot**: JSON schema 3 com modelo, hash de regras, registro versionado das 22 fontes, identificacao e componentes do snapshot, contribuicoes e um envelope bruto schema 1. O envelope congela 12 grupos de entradas normalizadas (incluindo candles spot/MTF/historicos e series de derivativos), registra fontes/horarios, cria manifesto por dataset e detecta adulteracao por hashes apos round-trip. Implementacao Codex ainda aguarda revisao independente do Claude Code (`ANL-002`).
- **Correlacao cross-asset**: correlacao, beta e forca relativa vs BTC/ETH no timeframe atual e correlacao diaria vs QQQ/SPY.
- **Microestrutura cross-venue**: CVD dos 1.000 aggTrades mais recentes e comparacao informativa de preco entre Binance, Coinbase, Bybit e OKX; ainda fora dos scores.
- **CFTC COT**: posicionamento semanal oficial do Bitcoin CME em contratos, exibido como contexto institucional e ainda fora dos scores.
- Painel "Como este score foi calculado?": regra, contribuicao, limite, estado, escopo e fontes normativas de cada componente, com reconciliacao da soma.
- **Override de noticias/macro**: modos manuais exigem autor e motivo antes de alterar o Setup Score; a trilha entra no snapshot/export e e removida ao voltar para `Auto`.
- **Orcamento de requisicoes**: chamadas do navegador compartilham concorrencia, janela global e limite por fonte. APIs usam sliding window Upstash quando Redis existe e publicam `X-RateLimit-Scope`; sem credenciais, degradam explicitamente para `instance` (`API-006`).

## Ativacao da persistencia

O backend duravel exige `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` e um `CRON_SECRET` com ao menos 24 caracteres. Consulte [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) antes de configurar preview/producao. Codigo implementado sem credenciais e teste com storage falso nao equivalem a persistencia comprovada.

## Limites

- Scores sao heuristicas direcionais, nao recomendacoes ou probabilidades calibradas.
- Preco de liquidacao e aproximado; brackets e taxas reais dependem da conta.
- Backtesting walk-forward e calibracao de probabilidade ainda nao existem. O backend duravel esta implementado, mas nao foi ativado nem comprovado em ambiente remoto; ate la, os registros efetivos continuam sujeitos aos limites do navegador. Persistencia tambem nao substitui tamanho amostral, segmentacao por versao e validacao fora da amostra.
- O cron Hobby diario cobre aproximadamente um unico cliente 5m continuamente aberto; multiusuario, timeframes curtos e backlog acumulado exigem execucao mais frequente ou fila/workflow duravel (`OPS-012`).
- O diretorio Git atual e `.git`, mas o repositorio continua dentro do OneDrive. O runbook define a migracao por clone limpo depois de commit/push autorizado; a pasta suja nao deve ser movida manualmente.
