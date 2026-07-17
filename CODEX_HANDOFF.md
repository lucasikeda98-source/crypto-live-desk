# Registro de transicao Codex -> Claude Code

> **Proxima sessao:** o plano de continuidade (itens em aberto + recomendacoes) esta em
> `HANDOFF_PROXIMA_SESSAO.md`. As revisoes do Claude Code estao ao final deste arquivo
> (RC-001 a RC-007).

## Estado local atual — CX-014 (2026-07-13)

- Base versionada: `e25ec34` em `main`; arvore local deliberadamente nao commitada e nao publicada.
- Plano ativo: Fase 0 com gate de codigo verde e Fase 1 em execucao com pilotos de mercado/macro, validadores, schema drift e telemetria por instancia; ver `SYSTEM_EVOLUTION_PLAN.md`.
- Suite Codex: **336/336** testes; cobertura **97,49% linhas / 82,03% branches / 96,87% funcoes** (pisos 95/75/90, exit 0).
- `rulesetHash` permanece no golden `4efe8ce2`; a extracao do throttle de rede nao alterou regra de score.
- Estado de revisao deste lote: **REVISADO PELO CLAUDE CODE — COM RESSALVAS** (2026-07-17, ver REV-CC-02 ao final; correcoes exigidas A-L antes de promover o contrato de dados como confiavel). As revisoes historicas abaixo continuam validas somente para os commits e escopos que registram.
- Producao observada: modelo `1.0.0-preview.8`. Nenhuma mudanca do CX-012/CX-013/CX-014 foi promovida.

## Objetivo

Este arquivo evidencia as mudancas realizadas pelo Codex a partir do marco abaixo. Todas essas mudancas devem ser revisadas pelo Claude Code quando o acesso estiver disponivel novamente, antes de serem consideradas alinhadas definitivamente com a linha de raciocinio anterior do projeto.

Revisao pelo Claude Code significa revisao independente de codigo, regras analiticas, testes, documentacao e impactos no modelo. A aprovacao nao deve ser presumida apenas porque os testes passaram.

## Estado atual (2026-07-13, atualizado por CC-FIX-01) — leia antes de continuar

- Checkpoint anterior: commit `887ec57` (REV-CC-01). Correcoes: **CC-FIX-01** (secao "Revisoes do Claude Code", ao final) fechou TODOS os 8 defeitos da secao A da REV-CC-01 e converteu os guardas fracos da secao B em testes de comportamento. **Nao deployado.**
- Suite: **303/303** testes, cobertura 97,95/81,46/96,54 (pisos 95/75/90, exit 0). Os 3 scripts Lua de producao agora sao EXECUTADOS por teste (VM Lua fengari, devDependency).
- Pendencias que continuam abertas (nao sao codigo): provisionar Redis/`CRON_SECRET`, cron do worker, sair do OneDrive, rodar CI em runner hospedado para confirmar o comportamento 451 do browser-smoke (job agora e advisory), exercitar Lua contra Redis real e gerar preview do hash candidato. Ver secao D da REV-CC-01.
- `rulesetHash` mudou (`4445fcf0` -> `b91fdb37`) por adicoes conscientes ao core (derivativeCoverage, formatDisplayTimestamp, buildInputSnapshotId, guarda finita de priceChangeOverWindow); nenhuma regra de score mudou. Pin de hash-ouro em test/behavior-guards.test.js.
- **Nao promover a producao** ate cumprir as pendencias de infra acima.

## Marco inicial

- Data local: 2026-07-12 (America/Cuiaba)
- Branch: `cycle-b/desk-depth`
- Ultimo commit anterior ao trabalho do Codex: `803eb67`
- Estado inicial: arvore de trabalho limpa e branch sincronizada com `origin/cycle-b/desk-depth`
- Autor das mudancas posteriores ao marco: Codex, salvo indicacao explicita em contrario neste registro
- Estado de revisao: **AGUARDANDO CLAUDE CODE**

## Protocolo obrigatorio

1. Cada conjunto de mudancas feito pelo Codex deve adicionar uma entrada neste arquivo.
2. A entrada deve informar escopo, arquivos, testes executados, limitacoes conhecidas e estado da revisao.
3. Mudancas ainda nao revisadas devem permanecer marcadas como `AGUARDANDO CLAUDE CODE`.
4. Somente uma revisao efetivamente executada no Claude Code pode alterar o estado para `REVISADO PELO CLAUDE CODE`.
5. A revisao deve registrar data, commit revisado, conclusao e eventuais correcoes solicitadas.
6. Se o Claude Code alterar a implementacao, as correcoes devem ser testadas e registradas em uma nova entrada.
7. Resultado verde de testes demonstra consistencia automatizada, mas nao substitui a revisao conceitual do Claude Code.

## Itens para a revisao futura do Claude Code

- Confirmar que o `preview.5` preserva a intencao dos ciclos anteriores.
- Conferir semantica de scores, gates, vetos, sinais v2, journal e cenarios.
- Procurar look-ahead, dupla contagem, vies direcional e inconsistencias entre UI e motor.
- Confirmar que documentacao, runtime, ruleset e pacote usam a mesma versao.
- Reexecutar a suite deterministica e o teste funcional no navegador.
- Revisar cada entrada pendente abaixo e registrar uma conclusao explicita.

## Registro de mudancas

### CX-001 — Reconciliacao da versao e documentacao

- Data: 2026-07-12
- Responsavel: Codex
- Base: `803eb67`
- Estado: **REVISADO PELO CLAUDE CODE** (2026-07-13 — ver RC-001; versao consistente, sem ressalvas)
- Escopo:
  - `package.json` atualizado de `1.0.0-preview.2` para `1.0.0-preview.5`.
  - README reconciliado com a versao usada pelo runtime e pelo ruleset.
  - Cobertura analitica atualizada com as mudancas acumuladas do preview.3 ao preview.5.
- Arquivos:
  - `package.json`
  - `README.md`
  - `ANALYTICS_COVERAGE.md`
- Validacao Codex:
  - 92 de 92 testes deterministas aprovados.
  - Painel local carregado com 24 ativos e sem erros de console no navegador integrado.
  - Aba Sinais e layout de 390 px verificados; nenhum overflow horizontal encontrado.
- Limitacao conhecida:
  - O processo grafico do Microsoft Edge headless encerrou durante o smoke independente nesta maquina. O mesmo fluxo foi validado pelo navegador integrado, mas o smoke independente continua pendente de estabilizacao.

### CX-002 — Protocolo de autoria e revisao cruzada

- Data: 2026-07-12
- Responsavel: Codex
- Base: working tree posterior ao CX-001
- Estado: **REVISADO PELO CLAUDE CODE** (2026-07-13 — ver RC-001; documentacao de protocolo integra, sem ressalvas)
- Escopo:
  - Criacao deste registro de transicao.
  - Inclusao de instrucoes persistentes para Codex e Claude Code.
  - Aviso visivel no README sobre a revisao cruzada pendente.
- Arquivos:
  - `CODEX_HANDOFF.md`
  - `AGENTS.md`
  - `CLAUDE.md`
  - `README.md`
- Validacao Codex:
  - Documentos conferidos no working tree.
- Limitacao conhecida:
  - Este protocolo depende de o registro continuar sendo atualizado em cada conjunto de mudancas.

### CX-003 — Incorporacao do handoff dos Ciclos A-D

- Data: 2026-07-12
- Responsavel: Codex
- Origem: handoff `proximo-ciclo-handoff`, sessao Claude Code `5258b599-b0c0-46fc-9b5a-06524b02b7d8`
- Estado: **REVISADO PELO CLAUDE CODE** (2026-07-13 — ver RC-001; B+C juntos e D reservado conferem, sem ressalvas)
- Escopo:
  - Handoff do Claude Code cruzado com a branch atual.
  - Confirmado que Ciclos B e C estao implementados juntos no `preview.5` e que o Ciclo D fica reservado para a versao seguinte.
  - Fluxo de release indicado pelo handoff: testes, push da branch, preview Vercel, verificacao, integracao na `main` e verificacao de producao.
- Evidencia local:
  - `HEAD` inicial `803eb67`, correspondente ao ultimo fix pos-review do Ciclo C descrito no handoff.
  - Branch `cycle-b/desk-depth` sincronizada com o remoto antes das mudancas Codex.
  - 92 de 92 testes deterministas aprovados pelo Codex antes do inicio do fluxo de publicacao.
- Limitacoes conhecidas:
  - O handoff original contem trechos historicos e uma sequencia antiga em que Ciclo C ainda aparecia como proximo; o checkpoint mais recente, que declara B e C implementados juntos no preview.5, foi tratado como autoritativo.
  - GitHub CLI e Vercel CLI nao estao instalados nesta maquina; operacoes remotas devem usar `git` e os conectores autenticados disponiveis.

### CX-004 — Publicacao dos Ciclos B+C como preview.5

- Data: 2026-07-12
- Responsavel: Codex
- Estado: **REVISADO PELO CLAUDE CODE — COM RESSALVAS** (2026-07-13 — ver RC-001; sem bug bloqueante, mas ha correcoes exigidas e recomendadas)
- Commits:
  - `cbfc334`: reconciliacao de versao, documentacao e protocolo Codex -> Claude Code.
  - `b334389`: merge explicito de `cycle-b/desk-depth` em `main`.
- Publicacao:
  - Branch enviada ao GitHub e preview Vercel `dpl_BY2o7MvzZL6aKGS8SmgM6X2Cb9om` validado em estado `READY`.
  - `main` enviada ao GitHub e producao Vercel `dpl_EcDM8HhgRqE79KhUptAtEahmNJ6N` validada em estado `READY`.
  - Dominio verificado: `https://crypto-live-desk.vercel.app/`.
- Validacao Codex:
  - 92 de 92 testes deterministas aprovados antes do merge e novamente sobre a `main` integrada.
  - Preview: 24 ativos, versao preview.5, troca BTC 5m -> AVAX 1h, proxy de opcoes, oito linhas de explicacao, aba Sinais e layout 390x844 aprovados.
  - Producao: 24 ativos, versao preview.5, aba Sinais e layout 390x844 aprovados; nenhum erro de console.
  - Vercel nao registrou erros de runtime no projeto na janela de uma hora consultada apos o deploy.
- Excecoes do fluxo:
  - GitHub CLI ausente, conforme previsto no handoff.
  - Criacao de PR pelo conector retornou HTTP 403 por falta de permissao; foi usado merge Git direto, com commit de merge explicito e testes antes do push de `main`.
- Revisao futura solicitada:
  - Claude Code deve revisar os commits do intervalo `df16c8b..b334389`, com atencao especial aos itens dos Ciclos B e C descritos no CX-003 e no handoff original.

### CX-005 — Ciclo D fase 1: microestrutura e CFTC

- Data: 2026-07-12
- Responsavel: Codex
- Branch: `codex/cycle-d-sources`
- Base: `8d18107`
- Commits de implementacao: `a2a508b`, `aafc933`
- Preview Vercel validado: `dpl_Hsx2V1npvwirMHh63KVBbxfM9qtM`
- Estado: **AGUARDANDO CLAUDE CODE**
- Escopo:
  - Versao de desenvolvimento elevada para `1.0.0-preview.6`.
  - Nova rota `api/market-microstructure.js` consulta ate 1.000 aggTrades Binance e tickers publicos Binance, Coinbase, Bybit e OKX.
  - CVD usa o campo Binance `m` para separar agressao compradora e vendedora em notional de cotacao.
  - Comparacao cross-venue calcula mediana, dispersao e Coinbase premium vs Binance.
  - Fonte oficial CFTC Legacy Futures Only adicionada ao proxy institucional para o contrato Bitcoin CME (`133741`).
  - Interface ganhou paineis de Microestrutura cross-venue e CFTC COT.
  - Todas as novas leituras permanecem informativas e fora de Radar Score, Setup Score e Data Confidence.
- Fontes primarias conferidas:
  - Binance Spot API / aggTrades.
  - Coinbase Exchange / product ticker.
  - Bybit V5 / market tickers.
  - OKX V5 / market ticker.
  - CFTC Public Reporting Environment, dataset Legacy Futures Only `6dca-aqww`.
- Validacao Codex:
  - 98 de 98 testes deterministas aprovados.
  - Consulta real BTC retornou quatro venues, 1.000 aggTrades e nenhuma falha de fonte.
  - Painel local exibiu CVD, imbalance, Coinbase premium, dispersao e quatro venues sem erros de console.
  - Preview Vercel confirmou degradacao parcial: Binance, Coinbase e OKX responderam; Bybit ficou indisponivel na regiao do deploy e foi excluida sem fabricar preco.
  - A interface remota passou a exibir `3/4 venues` e `Fontes indisponiveis: bybit`; nenhum erro de console ou runtime foi encontrado.
  - CFTC real exibiu relatorio de 07/07/2026: non-commercial net +3.500, variacao -270, commercial net -3.217 e OI 18.832 contratos.
- Limitacoes conhecidas:
  - CVD cobre somente os ultimos 1.000 aggTrades, nao uma serie acumulada de longo prazo.
  - Coinbase pode nao listar todos os ativos em par USD; falha parcial fica explicita e nao invalida os demais venues.
  - CFTC e contexto semanal de Bitcoin/CME e nao deve ser aplicado como posicionamento especifico de cada altcoin.
  - CoinGecko derivatives, unlocks DeFiLlama, calendario macro e FRED ainda nao fazem parte desta fase.
- Revisao futura solicitada:
  - Confirmar a interpretacao do campo Binance `m`, unidades CFTC e politica de manter as fontes fora dos scores.

### CX-006 — Estrutura do loop exaustivo de auditoria

- Data: 2026-07-13
- Responsavel: Codex
- Branch: `codex/cycle-d-sources`
- Base: `b124fcb`
- Estado: **AGUARDANDO CLAUDE CODE**
- Escopo:
  - Criado protocolo de auditoria redundante com sete passadas, estados de achado, severidade independente de esforco e condicao objetiva de encerramento.
  - Criado ledger vivo com 38 achados confirmados iniciais, incluindo integridade analitica, persistencia, APIs, operacao, UX, acessibilidade, seguranca e documentacao.
  - Criado inventario mecanico com hash SHA-256, linhas, bytes, categoria e passadas obrigatorias por arquivo.
  - Adicionados comandos `audit:inventory` e `test:coverage` ao pacote.
  - O relatorio antigo `SYSTEM_AUDIT_2026-07-12.md` foi preservado, mas marcado como snapshot historico substituido, pois conclusoes posteriores contradizem a aprovacao ampla registrada nele.
  - Artefatos internos de auditoria foram excluidos do bundle Vercel por `.vercelignore`.
- Arquivos:
  - `AUDIT_LOOP.md`
  - `AUDIT_LEDGER.md`
  - `AUDIT_INVENTORY.json`
  - `scripts/audit-inventory.cjs`
  - `package.json`
  - `.vercelignore`
  - `SYSTEM_AUDIT_2026-07-12.md`
  - `CODEX_HANDOFF.md`
- Validacao Codex:
  - Inventario: 39 arquivos auditaveis, 10.889 linhas e 642.282 bytes no checkpoint inicial.
  - 98 de 98 testes deterministas aprovados.
  - Suite repetida com cobertura experimental: 96,25% linhas, 73,81% branches e 95,37% funcoes nos modulos importados.
  - Todos os arquivos `.js`/`.cjs` passaram em `node --check`.
  - Script de inventario regenerado e schema/totais validados.
- Limitacoes conhecidas:
  - A cobertura publicada pelo Node nao inclui `app.js`, `styles.css`, `index.html` nem rotas API que os testes nao importam; o percentual nao representa cobertura do produto inteiro.
  - Os 38 achados estao apenas registrados e permanecem `CONFIRMADO`; nenhuma correcao do motor foi feita neste item.
  - A revisao visual da nova rodada ainda precisa capturar evidencias novas; screenshots da rodada anterior servem apenas como historico.
- Revisao futura solicitada:
  - Claude Code deve revisar o protocolo, tentar invalidar os achados e conferir cada fechamento contra o inventario e os testes de regressao.

### CX-007 — Auditoria exaustiva, endurecimento e reconciliacao do preview.7-codex.2

- Data: 2026-07-13
- Responsavel: Codex
- Branch: `codex/cycle-d-sources`
- Base: `b124fcb`
- Estado: **AGUARDANDO CLAUDE CODE**
- Estado Git: working tree sem commit e sem push nesta entrada; revisar o intervalo `b124fcb` ate a arvore de trabalho completa.
- Escopo:
  - Auditoria estatica e causal do motor, `app.js`, interface, estilos, rotas API, scripts, testes, CI, seguranca, documentacao e artefatos de auditoria.
  - Correcao de identidade de snapshot, candles fechados, outcomes, gaps, volatilidade, MTF, traps, journal/alertas, simetria long/short, calculadora, staleness e valores ausentes/futuros/impossiveis.
  - Endurecimento das APIs com deadline absoluto, allowlists, falha parcial tipada, validacao semantica, cabecalhos coerentes, same-origin, rate limit por instancia, cache coalescido e reducao de fan-out.
  - Endurecimento visual e de acessibilidade em desktop/mobile: foco, alvos de toque, timezone, grafico responsivo, overflow, estados indisponiveis, cobertura MTF e narrativas sem `NaN`/zero fabricado.
  - Fuzz deterministico e testes adversariais para klines, MTF, calculadora, persistencia, API, cache, HTTP, simetria e ramos de falha.
  - Reconciliacao do ledger: 55 achados reais no checkpoint inicial (o numero 38 do CX-006 era um resumo historico incorreto); 45 foram corrigidos/validados/reauditados pelo Codex e aguardam Claude, 10 continuam abertos ou parciais.
- Arquivos:
  - `app.js`, `index.html`, `styles.css`, `lib/analytics-core.js`, `lib/api-guard.js`.
  - Todas as rotas em `api/`, scripts de servidor/smoke/inventario, workflow, `vercel.json` e pacote.
  - Suite em `test/`, incluindo novos contratos de API e `test/fuzz-invariants.test.js`.
  - `README.md`, `ANALYTICS_COVERAGE.md`, `ANALYTIC_CONTRACT_V1.md`, `AUDIT_LOOP.md`, `AUDIT_LEDGER.md`, `AUDIT_INVENTORY.json` e este handoff.
- Validacao Codex:
  - 161 de 161 testes deterministas aprovados.
  - Cobertura experimental dos arquivos carregaveis no Node: 99,79% linhas, 80,85% branches e 97,88% funcoes. Ela nao inclui a execucao integral de `app.js` no DOM.
  - Inventario regenerado: 45 arquivos e 13.266 linhas auditaveis.
  - Checagens de sintaxe, whitespace/diff, contratos HTTP reais e browser integrado em desktop e 390 x 844 px.
  - Fluxos visuais principais, oito abas do ativo, teclado, calculadora hostil, 24 cards, responsividade, overflow e console foram exercitados; evidencias finais novas ficam registradas na tarefa Codex desta rodada.
- Dividas que permanecem `CONFIRMADO`:
  - ANL-002/003/012/015/016, API-006 e OPS-004/005/006/008, conforme descricao atualizada no ledger.
  - Ainda nao ha series brutas/envelope integral, backend duravel, registro completo de fontes, calendario/flag ETF, autoria de override, rate limit global, budget distribuido, modularizacao do monolito ou clone fora do OneDrive.
  - Feature flag, rollback testado, telemetria de divergencia e conformidade integral com o contrato v1 continuam ausentes; o contrato agora declara explicitamente `NAO E CONFORME`.
- Revisao futura solicitada:
  - Claude Code deve revisar independentemente cada diff e cada uma das 45 linhas `AGUARDANDO CLAUDE CODE`, tentar invalidar as hipoteses, reexecutar testes/browser e confirmar ou solicitar correcoes sem presumir aprovacao por causa da cobertura verde.

### CX-008 — Fechamento das fases posteriores locais e reauditoria redundante

- Data: 2026-07-13
- Responsavel: Codex
- Branch: `codex/cycle-d-sources`
- Base: arvore de trabalho do CX-007, ainda derivada de `b124fcb`
- Estado: **AGUARDANDO CLAUDE CODE**
- Estado Git: working tree sem commit e sem push nesta entrada; revisar `b124fcb` ate a arvore completa, preservando a autoria Codex posterior a `803eb67`.
- Escopo:
  - Fechamento local de ANL-012, ANL-015, ANL-016 e OPS-008, sem misturar o rate limit distribuido ainda aberto em API-006.
  - Registro normativo `SOURCE_REGISTRY` com 22 fontes live, historicas e manuais, incluido no ruleset/hash, export e explicacao da UI.
  - Calendario de sessoes dos EUA e flags `reported`/`reportReason` para ETF, incluindo normalizacao recursiva do envelope MCP real e exclusao de fins de semana/feriados sem apagar zero legitimo.
  - Override manual de noticias condicionado a autor e motivo, com trilha no snapshot, hash de entrada, explicacao e export; retorno a `Auto` limpa a trilha ativa.
  - Budget unico do cliente com concorrencia, janela global, limite por fonte, prioridade e fila; cobertura deterministica de concorrencia, overflow e janelas moveis.
  - Reauditoria de HTTP real e navegador integrado nos oito modulos do ativo, desktop 1440 x 1000 e mobile 390 x 844.
- Falha encontrada pela redundancia:
  - O primeiro endurecimento ETF passava nos fixtures, mas a API real devolveu um envelope adicional; as linhas chegaram sem `reported`. A checagem ponta a ponta detectou a divergencia, o normalizador e o consumidor passaram a atravessar envelopes aninhados e um fixture de regressao reproduz esse shape.
- Arquivos principais desta entrada:
  - `lib/analytics-core.js`, `api/institutional.js`, `app.js`, `index.html`, `styles.css`.
  - `test/analytics-core.test.js`, `test/institutional-api.test.js`, `test/features.test.js`.
  - `README.md`, `ANALYTICS_COVERAGE.md`, `ANALYTIC_CONTRACT_V1.md`, `AUDIT_LEDGER.md`, `AUDIT_INVENTORY.json` e este handoff.
- Validacao Codex:
  - 169 de 169 testes deterministas aprovados.
  - Cobertura experimental dos arquivos carregaveis no Node: 99,78% linhas, 80,62% branches e 97,60% funcoes; `app.js` no DOM continua fora desse percentual.
  - Inventario regenerado: 45 arquivos e 13.870 linhas auditaveis.
  - Nove rotas locais reais responderam 200 com os caches declarados; POST indevido 405, CORS hostil 403, ativo invalido 400 e preflight autorizado 204.
  - API institucional real confirmou `reported=true` ate 10/07/2026 e `market-closed-placeholder` em 11-12/07/2026; a UI exibiu 10/07 como ultima linha.
  - Navegador: oito abas percorridas, calculadora com valores invalidos e extremos, formulario manual em erro/sucesso/auto, registro normativo visivel, zero overflow horizontal, zero `NaN`/`Infinity`, zero alvo efetivo abaixo de 44 px e zero warning/error de console.
  - Evidencias visuais novas: dashboard e ativo desktop, validacao/aplicacao do override, ETF focado, ativo mobile e override mobile, salvas na tarefa Codex desta rodada.
- Dividas que permanecem `CONFIRMADO`:
  - ANL-002, ANL-003, API-006, OPS-004, OPS-005 e OPS-006.
  - Ainda faltam series brutas/envelope duravel, backend/worker persistente, rate limit distribuido entre instancias/regioes, modularizacao do monolito e clone fora do OneDrive.
  - Feature flag, rollback testado, telemetria de divergencia e conformidade integral com o contrato v1 continuam ausentes.
- Revisao futura solicitada:
  - Claude Code deve revisar as 49 linhas `AGUARDANDO CLAUDE CODE`, com atencao especial ao calendario ETF, ao envelope MCP recursivo, ao efeito do registro de fontes no `rulesetHash`, a trilha manual e a semantica/fairness do budget de requisicoes.

### CX-009 — Export reproduzivel, persistencia preparada e fechamento operacional local

- Data: 2026-07-13
- Responsavel: Codex
- Branch: `codex/cycle-d-sources`
- Base: arvore dos CX-007/CX-008, derivada de `b124fcb`
- Estado: **AGUARDANDO CLAUDE CODE**
- Estado Git: working tree sem commit, sem stage, sem push e sem deploy nesta entrada. Revisar a arvore inteira contra `b124fcb`; toda alteracao posterior a `803eb67` continua atribuida ao Codex.
- Escopo implementado:
  - ANL-002: export schema 3 com `rawEvidence` schema 1, 12 datasets, manifesto/hashes e verificacao de round-trip/adulteracao. Um export real BTC/5m foi reaberto e validado com 3.524.193 bytes.
  - ANL-003/OPS-005 (codigo): store Redis isolado por hash de namespace, merge que nunca apaga outcome, retencao de pendentes, fila due e worker cron para 1h/24h/7d sem aba.
  - API-006 (codigo): sliding window Upstash distribuido com escopo declarado e fallback explicito por instancia quando Redis inexiste/falha.
  - OPS-004: rede/orcamento extraidos para `lib/request-client.js`; identidade/conciliacao/sync extraidas para `lib/signal-sync-client.js`.
  - OPS-006: criado `OPERATIONS_RUNBOOK.md`, `.env.example` e plano seguro de clone fora do OneDrive depois de versionar a arvore.
  - CI/dependencias: `package-lock.json`, `npm ci` nos dois jobs, cache npm, `node_modules`/coverage/logs ignorados e quatro dependencias runtime auditadas sem vulnerabilidades.
  - Rota de capacidade: GET de `/api/signals` informa `configured=false` sem erro de recurso; POST/DELETE continuam 503 sem storage e nunca fingem persistencia.
  - Cache dos novos modulos do browser coberto por `vercel.json`.
- Falhas encontradas pela redundancia:
  - Trocar o codigo privado durante um GET em voo podia misturar dados da identidade antiga na nova. A sincronizacao fixa namespace/geracao por transacao, invalida a antiga e possui teste que prova ausencia de POST/vazamento cruzado (`SEC-002`).
  - O CI passou a depender de pacotes, mas nao instalava o lockfile em runner limpo (`OPS-009`).
  - O smoke ainda burlava o contrato novo de override e produzia falsa falha de identidade; agora preenche autor/motivo e submete o formulario (`OPS-010`).
  - O GET 503 esperado da capacidade gerava erro de console em todo boot; a leitura virou capability probe 200, sem enfraquecer mutacoes (`API-012`).
  - Producao e working tree divergiram: producao respondeu com CORS `*` e shapes antigos; o deployment `READY` inspecionado e preview de `b124fcb`, nao esta arvore (`OPS-011`).
- Arquivos principais:
  - `lib/analytics-core.js`, `lib/api-guard.js`, `lib/durable-signals.js`, `lib/redis-runtime.js`, `lib/request-client.js`, `lib/signal-sync-client.js`.
  - `api/signals.js`, `api/signal-worker.js` e as oito rotas existentes migradas para o gate assincrono.
  - `app.js`, `index.html`, `styles.css`, `vercel.json`, `package.json`, `package-lock.json`, `.gitignore`, `.vercelignore`, `.env.example`, workflow e scripts.
  - Testes novos/atualizados em `test/`, documentos normativos, ledger, inventario, runbook e este handoff.
- Validacao Codex:
  - Instalacao limpa com `npm ci` aprovada; `npm audit` encontrou zero vulnerabilidades.
  - 197 testes deterministas aprovados no checkpoint final.
  - Cobertura experimental dos modulos Node: 97,90% linhas, 78,90% branches e 97,09% funcoes; `app.js` executado no DOM nao entra nesse percentual.
  - Inventario regenerado: 59 arquivos, 15.895 linhas e 939.172 bytes auditaveis.
  - Smoke real aprovado em todos os 20 checks: 24 cards, concorrencia de ativo/timeframe, identidade do snapshot, override auditado, calculadora, desktop/mobile, sem overflow do body, excecoes ou erros de console.
  - HTTP local: capability 200, mutacao sem Redis 503, worker sem segredo 503, CORS hostil 403, entrada invalida 400 e `X-RateLimit-Scope: instance` sem credenciais.
  - Navegador integrado: painel de sync desktop/mobile, codigo mascarado, 19 registros locais preservados e estado nao-provisionado honesto. Evidencias `audit3-01-signal-sync-desktop.png` e `audit3-02-signal-sync-mobile.png` na pasta de visualizacoes desta tarefa.
  - Projeto Vercel lido via integracao: Node 24.x, deployment preview `READY`; novas chamadas a producao responderam 200. Os 26 warnings historicos `DEP0169 url.parse()` de deployment anterior nao reapareceram na janela recente de uma hora.
- Dividas que permanecem `CONFIRMADO`:
  - ANL-003, API-006 e OPS-005: Redis/`CRON_SECRET` nao foram provisionados; falta round-trip remoto, cron real, TTL e limite distribuido entre instancias/regioes.
  - OPS-006: clone ainda esta no OneDrive; movimentacao exige arvore versionada e autorizacao do proprietario.
  - OPS-011: falta commit/push, preview do hash candidato e promocao autorizada; producao nao representa este codigo.
  - Feature flag, rollback exercitado, telemetria de divergencia e conformidade integral v1 continuam ausentes.
- Artefatos locais externos ao repositorio:
  - Export aceito: `C:\Users\lucas\Downloads\snapshot-BTC-5m-1783932331547.json` (3.524.193 bytes, `valid=true`).
  - Dois exports exploratorios anteriores de aproximadamente 97 MB permanecem em Downloads; nao foram apagados sem autorizacao.
- Revisao futura solicitada:
  - Claude Code deve revisar as 55 linhas `AGUARDANDO CLAUDE CODE`, com foco em integridade do envelope, isolamento/retencao do Redis, autenticacao do cron, fallback do limiter, corrida de troca de namespace, modularizacao e coerencia entre runbook/README/contrato.
  - Depois das credenciais e do preview candidato, repetir storage real em dois dispositivos, cron, limite distribuido, logs e toda a auditoria antes de qualquer promocao.

### CX-010 — Segunda passada concorrente, capacidade do worker e navegador redundante

- Data: 2026-07-13
- Responsavel: Codex
- Branch: `codex/cycle-d-sources`
- Base: arvore do CX-009, ainda derivada de `b124fcb`
- Estado: **AGUARDANDO CLAUDE CODE**
- Estado Git: working tree sem commit, sem stage, sem push e sem deploy nesta entrada. Toda mudanca descrita abaixo foi feita via Codex.
- Falhas confirmadas e tratadas:
  - Snapshot local divergente podia vencer a revisao canonica remota do mesmo candle (`ANL-026`).
  - POST atrasado podia apagar outcome preenchido pelo worker; merge+schedule passou a Lua atomica (`ANL-027`).
  - Limpeza concorrente podia restaurar dados antigos ou liberar novo registro antes do DELETE (`SEC-003`).
  - Payload ja interpretado pela plataforma contornava o teto de `/api/signals` (`API-013`).
  - Resposta HTTP 200 malformada podia declarar sync/clear inexistente (`API-015`).
  - Rotacao de cliente Redis nao invalidava o limiter distribuido cacheado (`API-014`).
  - Same-origin ignorava divergencia de protocolo e o IP preferencial da Vercel (`SEC-004`).
  - Cron duplicado/sobreposto nao possuia lease distribuido (`SEC-005`).
  - `localStorage` indisponivel perdia a continuidade da propria sessao; existe fallback volatil com aviso honesto (`UX-008`).
  - CI nao possuia piso bloqueante de cobertura nem `npm audit` (`OPS-014`).
- Capacidade/operacao:
  - O worker passou a agrupar sinais em janelas de mercado, ler a fila em pipeline, limitar concorrencia, processar ate 3 lotes/300 itens e respeitar budget de 24s. Um cliente 5m continuo (288/dia) cabe nesse teto; multiusuario, timeframes curtos e backlog ainda exigem cron mais frequente ou fila duravel (`OPS-012`, ainda `CONFIRMADO`).
  - A observabilidade remota mostrou 26 ocorrencias historicas de `DEP0169 url.parse()` em options/institutional. Nao houve reproducao local nem log retido suficiente para causa raiz (`OPS-013`, ainda `CONFIRMADO`).
- Arquivos principais:
  - `lib/signal-sync-client.js`, `lib/durable-signals.js`, `lib/api-guard.js`, `api/signals.js`, `api/signal-worker.js`, `app.js`.
  - `.github/workflows/quality.yml`, `package.json` e testes correspondentes em `test/`.
  - `AUDIT_LEDGER.md`, `ANALYTICS_COVERAGE.md`, `OPERATIONS_RUNBOOK.md`, `README.md`, inventario e este handoff.
- Validacao Codex:
  - 215/215 testes deterministas aprovados.
  - Cobertura Node 98,76% linhas, 79,41% branches e 97,30% funcoes; pisos 95%/75%/90% aprovados.
  - `npm audit --audit-level=low`: zero vulnerabilidades conhecidas.
  - Sintaxe de todos os JS/CJS aprovada, `git diff --check` limpo e scan de segredos encontrou apenas tokens falsos construidos nos testes.
  - Inventario regenerado: 59 arquivos, 16.762 linhas e 983.002 bytes auditaveis.
  - Navegador integrado atual: oito modulos percorridos em 390 x 844, zero overflow horizontal do documento, zero warning/error, controles principais com 44 px, sinais sem Redis e calculadora futures short 10x exercitados.
  - Evidencias atuais: `audit4-02-estavel-desktop.png`, `audit4-03-sinais-sem-redis.png`, `audit4-04-mobile-inicial.png` e `audit4-06-mobile-sinais-painel.png` na pasta de visualizacoes da tarefa Codex.
- Limites e revisao futura:
  - O ramo Lua de producao, lease, TTL, rate limit distribuido, cron e dois dispositivos nao foram testados contra Redis/Vercel reais porque os recursos continuam nao provisionados.
  - O teste de teclado real do link de salto nao foi conclusivo no injetor do navegador; estrutura semantica, destino e alvo de 44 px permanecem cobertos por teste deterministico, mas teclado fisico deve ser repetido no preview.
  - Claude Code deve revisar independentemente as 65 linhas `AGUARDANDO CLAUDE CODE`, tentar quebrar as corridas, conferir a Lua e reexecutar todo o gate no commit/preview candidato. Nenhum resultado verde desta entrada equivale a aprovacao conceitual.

## Revisoes do Claude Code

### RC-001 — Revisao cruzada dos Ciclos B+C (preview.5)

- Data: 2026-07-13
- Responsavel: Claude Code
- Diffs revisados:
  - CX-001/002/003: commit `cbfc334` (versao, documentacao e protocolo) sobre a arvore pos-`803eb67`.
  - CX-004: intervalo `df16c8b..803eb67` (motor dos Ciclos B+C) e merge `b334389`.
- Metodo: leitura independente do motor (`lib/analytics-core.js`) e da orquestracao (`app.js`), reconferencia de versao/ruleset, e tres auditorias adversariais paralelas (look-ahead/candle fechado; double-counting/vies direcional; consistencia UI-motor + idempotencia do journal). Suite `node --test`: 92/92 verdes.

- Conclusao geral: **APROVADO COM RESSALVAS.** Nenhum bug critico ou bloqueante. A disciplina de candle fechado, a exclusao de proxies BTC do score de altcoins, a idempotencia do journal por candle, o namespacing por versao e a simetria long/short do motor v2 e do gate HTF estao corretos e testados. Existem, porem, correcoes exigidas e recomendadas listadas abaixo. Alinhamento definitivo do CX-004 fica condicionado a elas.

- Verificado limpo (com evidencia):
  - Sem look-ahead: `selectClosedCandles` corta o candle em formacao em toda ingestao; detectores/gates/sinais consomem apenas candles fechados; cada TF do MTF confirma pelo proprio fechamento; `detectStructureShift` protege pivos por `time <= rows[j-2].time`; `backtestDetectorLag` replica o detector sob a mesma guarda.
  - Proxy BTC (opcoes/mempool) neutralizado no motor para altcoins (`resolveDatasetFreshness`/`resolveOptionsScope`): contribuicao 0 no Setup Score e no Data Confidence (§12.10).
  - Idempotencia do journal por `lastCloseTime` (reload nao dobra barsHeld/MAE/MFE); tombstone FLAT nao ressuscita trade; storage namespaced por MODEL_VERSION (§11).
  - Simetria: gate HTF, entradas/saidas/`structuralLevels` do motor v2 e sinal do excesso historico — espelhados long/short.
  - Reconciliacao exibida com honestidade (diferenca pelo clamp declarada na UI).
  - Versao `1.0.0-preview.5` consistente em `package.json`, `README`, `ANALYTICS_COVERAGE`, `RULESET` e `app.js`; `rulesetHash` derivado deterministicamente.

- Correcoes EXIGIDAS (defeitos objetivos introduzidos/ativados no ciclo):
  1. Data Confidence desalinhado dos caps. `dataQuality` (`app.js:1544-1551`) hardcoda pesos `mtf:24, risk:10` (soma 116), mas `RULESET.setupCaps` usa `multiTimeframe:16, risk:14` (soma 112). Viola §8.2 (o DC deve usar os caps dos componentes) e cria duas fontes de verdade. Correcao: derivar os pesos de `RULESET.setupCaps`.
  2. Texto do componente Risco cita "traps". `app.js:1695` diz "...climax de volume, traps e liquidacoes", mas trap pontua em Fluxo, nao em Risco (§10 — o texto deve derivar dos mesmos valores). Correcao: remover "traps" do reason do Risco.
  3. Contagem do Multi-TF off-by-one. `app.js:1689` informa "N timeframes" incluindo o TF do grafico, que e excluido do agregado (`app.js:1260`). Correcao: reportar a contagem do conjunto que realmente pontuou.

- Correcoes RECOMENDADAS (conceituais / decisao do proprietario):
  4. Vies direcional no bloco de Risco. `app.js:1627-1628`: sobrecompra (banda superior + RSI>=68) da -8 e sobrevenda (banda inferior + RSI<=35) da -6 — ambos empurram o score para baixo. Com a ladder bidirecional do Ciclo C e o clamp de risco ampliado (10->14), uma sobrevenda passa a favorecer entrada vendedora (ex.: total -40 -> -46 cruza o limiar -42). Enquadramento inconsistente (sobrecompra=reversao a media, sobrevenda=momentum). Decidir o sinal correto da sobrevenda e documentar.
  5. Assimetria do carry. `analytics-core.js:845`: euforia (>15%/>30% a.a.) da -2/-3 em dois degraus; backwardation (<-10%) da +2 em um degrau. Standing lean de ~1 ponto para short em Derivativos. Alinhar magnitudes/limiares ou documentar a assimetria intencional.
  6. Funding em lente dupla. O mesmo `fundingAvg` pontua via percentil (detail, ate +/-6) e via carry anualizado (ate +/-3), ambos no cap +/-12 de Derivativos. Documentado como lentes complementares; em euforia co-disparam (~ -6/12). Revisar se a sobreposicao e desejada.
  7. Contrato desatualizado. `ANALYTIC_CONTRACT_V1.md` §7.2 ainda declara Multi-timeframe +/-24, Risco +/-10 e total 116; a implementacao usa 16/14/112. Reconciliar o contrato ou registrar formalmente a lacuna de conformidade.

- Achados PRE-EXISTENTES (anteriores a `df16c8b`; registrados, fora do escopo estrito dos commits do Codex):
  - Sweep contado em Fluxo (via smart money) e em Risco; delta/CMF contado em `flowScore` e em `smart.score` — double-count dentro de componentes, herdado de ciclos anteriores.
  - Soma dos caps (112) > 100: em setups maximamente alinhados a soma visivel diverge do total pelo clamp (declarado na UI).
  - Componente Derivativos pode exibir status "missing" com contribuicao != 0 quando o premium ao vivo pontua mas o detalhe de futuros falha.
  - `isCandleClosed` confia no relogio local; o contrato preve tolerancia de relogio (nao alterado no ciclo).
  - Journal: corrida TOCTOU entre multiplas abas pode duplicar um registro de trade fechado (single-tab reload e seguro).

- Estado das entradas apos RC-001: CX-001, CX-002, CX-003 -> REVISADO PELO CLAUDE CODE (sem ressalvas). CX-004 -> REVISADO PELO CLAUDE CODE COM RESSALVAS; a implementacao so deve ser considerada alinhada apos as correcoes exigidas (itens 1-3) e a decisao sobre as recomendadas (4-7). Correcoes aplicadas pelo Claude Code entram como nova entrada, conforme o protocolo.

### RC-002 — Correcoes exigidas da RC-001 (itens 1-3)

- Data: 2026-07-13
- Responsavel: Claude Code
- Base: working tree pos-RC-001 (commit `cc3b31e`)
- Arquivos: `app.js`
- Escopo: aplica as tres correcoes EXIGIDAS listadas na RC-001. As recomendadas (4-7) seguem pendentes; o item 4 (sinal da sobrevenda no bloco de Risco) depende de decisao do proprietario.
- Mudancas:
  1. `dataQuality` passa a derivar os pesos do Data Confidence de `AnalyticsCore.RULESET.setupCaps` em vez de hardcodar `24/10`. Elimina a segunda fonte de verdade; o DC agora honra os caps reais (mtf 16, risk 14) conforme §8.2.
  2. Reason do componente Risco corrigido: removido "traps" (trap pontua em Fluxo, nao em Risco) — §10.
  3. Reason do componente Multi-TF passa a reportar `aggregatedCount` (timeframes que realmente alimentaram o agregado, TF do grafico excluido) em vez do total de linhas — fim do off-by-one.
- Impacto analitico DECLARADO (§11): a correcao 1 altera valores de Data Confidence exibidos (ex.: num vetor com MTF coberto e risco ausente, DC 51 -> 46). NAO houve mudanca no `RULESET` nem no `rulesetHash`: o ruleset ja declarava caps 16/14 e o `dataQuality` e que estava desalinhado; portanto trata-se de correcao de implementacao para conformar-se ao modelo ja publicado, nao de nova regra. `MODEL_VERSION` mantido em `1.0.0-preview.5` para preservar o journal de Sinais acumulado (o storage e namespaced por versao; um bump o orfanaria). Caso se prefira um bump para `preview.6`, e uma decisao aberta.
- Validacao Claude Code:
  - `node --check app.js` e `node --check lib/analytics-core.js`: OK.
  - `node --test`: 92/92 verdes (os testes de DC do motor sao independentes do `dataQuality` do app; nenhum quebrou).
  - Spot-check em runtime confirmou `RULESET.setupCaps` (soma 112) e a diferenca de DC old(24/10) vs new(16/14).
- Limitacao conhecida: as correcoes 2 e 3 sao textuais/de contagem (sem impacto em score/DC); a 1 muda o DC conforme declarado acima. Itens recomendados 4-7 da RC-001 permanecem abertos.

### RC-003 — Correcoes recomendadas da RC-001 + double-counts acoplados (preview.6)

- Data: 2026-07-13
- Responsavel: Claude Code
- Base: working tree pos-RC-002 (commit `3409028`)
- Arquivos: `app.js`, `lib/analytics-core.js`, `package.json`, `README.md`, `ANALYTICS_COVERAGE.md`, `ANALYTIC_CONTRACT_V1.md`, `test/analytics-core.test.js`
- Metodo: cada correcao foi PROPOSTA com codigo exato e submetida a 4 verificadores adversariais independentes (lente de simetria/vies; lente de double-count/matematica-de-borda; lente de derivativos; lente de contrato + completude global) ANTES de aplicar. So foi aplicado o que passou. Os designs originais de dois itens foram corrigidos porque a verificacao mostrou que quebrariam testes e/ou a logica (ver abaixo).

- Correcoes APLICADAS (6):
  1. Vies direcional no Risco (RC-001 item 4). `buildConfluence`: sobrevenda (banda inferior + RSI extremo) passa de `-6` para `+8`, espelhando a sobrecompra `-8`. RSI `32 = 50-18` espelha o gatilho `68 = 50+18`. E a lente de reversao a media; o momentum de RSI baixo segue em `momScore` (bucket tecnico), lente separada.
  2. Sweep assimetrico (double-count/vies pre-existente). `smartMoneyAnalysis`: sweep de maxima passa a exigir rejeicao abaixo do VWAP para o peso cheio (`-8`, senao `-3`), espelhando o reclaim ja exigido no sweep de minima.
  3. Delta/CMF recontados (double-count pre-existente). `smartMoneyAnalysis`: removido o termo de concordancia delta/CMF — ja pontuam em `flowScore` (delta +/-9, cmf +/-4); somavam de novo via `smart.score*0.55` no mesmo componente de fluxo.
  4. Sweep recontado em Risco (double-count pre-existente). `buildConfluence`: removidos os termos de sweep puro do bloco de risco — sweep pontua uma vez, em fluxo via smart money. Os termos sweep+liquidacao permanecem (exigem tambem desequilibrio de liquidacoes; sinal distinto e simetrico).
  5. Volume direcionless (vies pre-existente, RC-001 nao listava). `calculateCandleFlow`: removido o `+5` incondicional por volume alto (um selloff de volume alto nao e altista); o volume ainda marca cobertura e a leitura direcional volume x delta segue no bloco de risco. Normalizacao do Radar Fluxo ajustada de `/18` para `/13` (novo max de `flowScore` = 9+4).
  6. Carry assimetrico (RC-001 item 5). `calculateCarryRegime`: adicionado degrau de capitulacao (`< -30% a.a. -> +3`), dando ao lado negativo a mesma estrutura de dois degraus do positivo. O piso `+2` permanece em `-10% a.a.` (nao no espelho `-30`): o funding neutro anualiza a ~+11%, entao qualquer funding negativo sustentado ja e anomalo — a assimetria de THRESHOLD e deliberada, a assimetria de MAGNITUDE (o degrau +3 ausente) e que era o vies.

- Contrato reconciliado (RC-001 item 7). `ANALYTIC_CONTRACT_V1.md` §7.2 e §8.2 atualizados para Multi-timeframe `+/-16`, Risco `+/-14`, total `112`, denominador do DC `/112`, com nota historica preservando os valores originais `1.0.0` (24/10/116) e a justificativa.

- NAO aplicado — decisao do proprietario:
  - RC-001 item 6 (funding em lente dupla, P6). A verificacao concluiu que NAO e erro de logica: o percentil de funding e simetrico/nao-enviesado e a sobreposicao com o carry e design intencional documentado (lente relativa vs absoluta). Trimar/limitar re-calibra um valor que nao estava logicamente errado (over-reach). Fica como decisao do dono. Design pronto se desejado: clamp conjunto `clamp(fundingPercentil + carryScore, -7, 7)` DENTRO de `calculateDerivativeDetailContribution` (isolando a sub-contribuicao de funding e passando `carryScore` como input), preservando a autoridade plena de cada lente sozinha e limitando so a cauda correlacionada; mantem os testes `:276`/`:286` verdes (funding sozinho fica dentro de +/-7).

- Correcao dos designs durante a verificacao (registro honesto):
  - P5 (carry): a proposta inicial espelhava os thresholds em torno de ZERO (`< -15 -> +2`, `< -30 -> +3`). A verificacao mostrou que isso ignora o baseline de funding ~+11%, cria zona morta em -15..-10 e QUEBRA o teste `:422`. Corrigido para manter o piso -10 e so adicionar o degrau -30.
  - P6 (funding): a proposta inicial (trim do percentil de 6 para 4) enfraquecia o percentil mesmo com carry silencioso e QUEBRAVA `:276`/`:286`. Descartada em favor do clamp conjunto (que nao foi aplicado — ver acima).
  - P-VOL-DIR: a proposta inicial tornava o volume direcional (`+/-3` por delta), o que double-contava o delta e duplicava a logica ja existente no risco. Corrigido para remocao total do bonus.

- Versao e reprodutibilidade (§11 / §2.10): as 6 correcoes mudam a semantica de score, e as constantes editadas vivem em CORPOS DE FUNCAO (fora do objeto `RULESET`), entao o `rulesetHash` nao mudaria sozinho. Bump manual de `1.0.0-preview.5` para `1.0.0-preview.6` em `MODEL_VERSION`, `rulesetVersion` (muda o `rulesetHash`), `package.json`, `README.md` e `ANALYTICS_COVERAGE.md` (com changelog). O journal de sinais e namespaced por `MODEL_VERSION`; a preview.5 sera podada pela logica de startup existente — comportamento correto por §11 (resultados de versoes diferentes nao se agregam). Cada registro de sinal ja persiste `modelVersion` e `rulesetHash`.

- Impacto DECLARADO (§11): as 6 correcoes alteram o Setup Score exibido; a #5 (volume) tambem altera o Radar Score (via `flowScore`). Data Confidence NAO muda (nenhuma toca elegibilidade de dataset nem os caps usados como peso do DC).

- Residuais CONHECIDOS apos a RC-003 (nao corrigidos; registrados para decisao futura, fora do escopo desta rodada):
  - Delta (sinal) ainda e usado como confirmacao no termo volume x delta do risco (`buildConfluence`), alem do `flowScore` — segunda leitura direcional do mesmo sinal, em bucket diferente.
  - Sweep+reclaim pontua tanto em `smart.score` (fluxo) quanto em `trapScore` (detectTrap = sweep + reclaim + flip de delta) — mesmo evento em dois sub-termos de fluxo.
  - Estrutura HH/HL entra em `technical` (structureShift) e em `smart.score` (rotulo de estrutura) — granularidades diferentes, borderline.
  - Card `setupQuality` (somente exibicao, fora do `total`) tem Momentum `+16/-14` e Volume `+10/-6` assimetricos; sem impacto em score, mas inconsistente com as correcoes acima.

- Validacao Claude Code:
  - `node --check app.js` e `node --check lib/analytics-core.js`: OK.
  - `node --test`: 93/93 verdes (92 anteriores + 1 novo teste de fluxo; o teste de carry ganhou assercoes do degrau de capitulacao). Nenhum teste quebrou.
  - Testes de regressao adicionados: degrau de capitulacao do carry (`< -30 -> +3`, `-15..-30 -> +2` sem zona morta) e ausencia do bonus de volume direcionless.

- Estado: RC-001 itens 4, 5 e 7 aplicados; itens 1-3 ja em RC-002; item 6 (funding lente dupla) pendente de decisao do dono; double-counts pre-existentes de sweep/delta-CMF/volume endereçados; residuais acima registrados.

### RC-004 — Item 6 (funding) + residuais acoplados (preview.6, ainda nao publicado)

- Data: 2026-07-13
- Responsavel: Claude Code
- Base: working tree pos-RC-003 (commit `7caafca`)
- Arquivos: `app.js`, `lib/analytics-core.js`, `test/analytics-core.test.js`
- Metodo: mudancas implementadas e submetidas a 2 verificadores adversariais independentes (matematica/regressao do clamp de funding; mapeamento de direcao do dedup sweep/trap + logica do arquivamento). Ambos retornaram CORRETO em todos os pontos, suite 94/94.

- Mudancas APLICADAS:
  1. **Funding em lente dupla (RC-001 item 6) — RESOLVIDO com clamp conjunto.** `calculateDerivativeDetailContribution` recebe `carryScore` (default 0), isola a sub-contribuicao de funding e soma `clamp(fundingContribution + carryScore, -7, +7)`. `buildConfluence` passa `carry.carryScore` e nao soma mais o carry solto. Cada lente mantem autoridade plena sozinha (percentil ate +/-6; carry ate +/-3); so a cauda correlacionada (euforia/capitulacao, onde as duas co-disparam) e limitada a +/-7, evitando que um unico sinal domine o bucket de +/-12. Callers so-funding (testes) ficam identicos, pois |funding| <= 6 <= 7. NAO e o "trim" descartado na RC-003 (que enfraquecia o percentil mesmo com carry silencioso e quebrava testes).
  2. **Sweep+trap (residual da RC-003).** Quando um trap confirmado do mesmo lado dispara, o score do sweep bruto no smart money e suprimido (rotulo mantido): o trap ja pontua o reclaim, com confirmacao extra, em `trapScore`, que tambem alimenta o fluxo — pontuar o sweep de novo contava o mesmo reclaim duas vezes. Mapeamento verificado: `trap.trap==='bull'` vem de um sweep de minima (`sweepDown`), relacao de superconjunto (`bullTrap => sweepDown`), sem perda de sinal e simetrico para o lado bear.
  3. **Journal preservado na virada de versao (A2 do handoff).** `purgeStaleStorage` passa a ARQUIVAR (`archived:<chave>`) os journals `cld-signal-journal:` e `cld-signal-trades:` de versoes antigas em vez de apaga-los; o estado transitorio do state machine (`cld-signal-machine:`) e os caches de historico continuam sendo descartados. Cada registro ja persiste `modelVersion`+`rulesetHash`, entao os sinais arquivados ficam segmentaveis por versao (§11 proibe agregar entre versoes, nao preservar). Seguro contra quota (o original so e removido apos o `setItem` do arquivo).

- Versao: mantida em `1.0.0-preview.6`. A preview.6 NAO foi publicada (main/producao seguem em preview.5), entao RC-003 e RC-004 definem juntas o que a preview.6 e — sem colisao de hash com nenhuma versao publicada. Ao publicar, a preview.6 ja incorpora ambas.

- Impacto DECLARADO (§11): (1) altera o Setup Score apenas quando funding percentil e carry co-disparam forte (cauda); (2) altera o fluxo apenas quando um trap confirmado coincide com o sweep bruto; (3) sem impacto em score (comportamento de storage). Radar Score inalterado pelos tres (o radar nao usa carry, derivativeDetail, smart.score nem sweep). Data Confidence inalterado.

- Residuais restantes ACEITOS por design (documentados, nao corrigidos — nao sao double-count/vies claro, e altera-los seria re-calibrar design defensavel):
  - Vol x delta no bloco de risco (`buildConfluence`): usa o SINAL do delta uma segunda vez, mas sob condicao CONJUNTA (`volumeRatio > 1.45` E direcao) — leitura de agressao confirmada por volume, distinta do delta continuo do `flowScore`.
  - Estrutura: `structureShift` (evento de ROMPIMENTO CHoCH/BOS, no tecnico) vs rotulo de estrutura HH/HL atual no smart money — granularidades diferentes, nao o mesmo sinal.
  - Card `setupQuality`: somente exibicao (nao entra em nenhum score/decisao); mantem Momentum `+16/-14` e Volume `+10/-6` como gradiente de qualidade, nao como score direcional.

- Validacao Claude Code:
  - `node --check` OK; `node --test`: 94/94 (novo teste do clamp conjunto de funding: p98+carry-3 = -7, p3+carry+3 = +7, carry sozinho = -3, funding sozinho inalterado).
  - 2 verificadores adversariais confirmaram: math do clamp sem regressao; mapeamento sweep/trap correto (nao invertido); arquivamento seguro e completo.

- Estado FINAL da revisao cruzada: todos os itens EXIGIDOS (RC-002) e RECOMENDADOS (RC-003 itens 4/5/7 + RC-004 item 6) da RC-001 estao aplicados; double-counts claros (OI ja no ciclo do Codex, delta/CMF, sweep-fluxo/risco, sweep/trap) eliminados; vieses direcionais (risco, sweep, carry, volume) corrigidos; contrato reconciliado; journal preservado. Residuais defensaveis documentados. Pendencias operacionais (nao analiticas): release verificado (Vercel preview -> smoke -> main -> prod) e Blocos 1-3 do checklist — ver `HANDOFF_PROXIMA_SESSAO.md`.

### RC-005 — Simetria visual do card setupQuality (cosmetico, sem impacto em score)

- Data: 2026-07-13
- Responsavel: Claude Code
- Arquivo: `app.js` (`setupQuality`)
- Escopo: o card `setupQuality` e SOMENTE exibicao (retornado como campo `setup`, NAO entra no Setup Score, Radar Score, Data Confidence nem em qualquer decisao — nao e somado no `total` da confluencia). Para consistencia visual, as tres linhas com magnitude assimetrica foram igualadas: Momentum `+16/-14 -> +16/-16`, Volume `+10/-6 -> +10/-10`, Liquidez `+12/-10 -> +12/-12`. As demais (Tendencia +/-18, Fluxo +/-14, Derivativos +/-10, Contexto +/-12) ja eram simetricas.
- Impacto: nenhum em score/DC/decisao (muda apenas os numeros exibidos do card). Sem bump de versao. `node --test` 94/94; nenhum teste referencia o card.

### RC-006 — Aba Sinais: correcoes de consistencia e melhorias (sem impacto em score)

- Data: 2026-07-13
- Responsavel: Claude Code
- Arquivos: `lib/analytics-core.js`, `app.js`, `index.html`, `ANALYTIC_CONTRACT_V1.md`, `test/features.test.js`
- Metodo: leitura integral do pipeline de sinais (registro -> avaliacao de outcome -> resumo -> motor de trades -> alertas -> export) + verificacao adversarial independente das mudancas antes do commit.

- Correcoes (inconsistencias reais):
  1. **Alertas de score espelhados.** `evaluateAlertTransitions` cruzava apenas `+42/+60/-45`; o `-45` ("venda domina") era resquicio da era long-only e nao correspondia a nenhuma decisao do painel pos-Ciclo C. Agora os cruzamentos espelham a ladder bidirecional: `+42/+60/-42/-60`, com mensagens iguais as decisoes ("entrada vendedora com confirmacao/favoravel"). Label da aba atualizado.
  2. **Bandas do resumo espelhadas.** `summarizeSignalJournal` tinha 3 bandas positivas e 1 negativa (`<= -20`), escondendo o lado short. Agora 7 bandas espelhadas (`+/-20..41`, `+/-42..59`, `+/-60`, neutro), com criterio de acerto inalterado. Adicionado `sufficient` (>= 20 avaliados), mesma regua da tabela de trades, exibido na nova coluna "Amostra".
  3. **Contrato §7.3 reconciliado.** A tabela operacional provisoria ainda era unidirecional (`-44 a -20`, `<= -45`); atualizada para a ladder bidirecional implementada (com gates HTF/trap explicitos) e nota historica preservando os valores originais.
  4. **Coluna "Quando" honesta.** A tabela de sinais mostrava `recordedAt` (hora em que o navegador gravou); agora mostra `signalCloseTime` (o candle fechado que confirmou o sinal — a identidade do registro), com fallback para `recordedAt` em registros antigos.
- Melhorias:
  5. **Avaliacao de outcomes em lote por simbolo.** Antes: 1 fetch por registro, maximo 10 por clique. Agora: 1 fetch por simbolo (1000 candles 1h ~ 41 dias a partir do sinal pendente mais antigo) cobrindo todos os pendentes do par, sem teto; sinais fora da janela permanecem pendentes (merge preserva horizontes ja preenchidos) e o status informa avaliados/adiados/restantes. Cliques sucessivos avancam a janela ate convergir.
  6. **Exportar sinais.** Novo botao na aba baixa JSON auditavel com journal de sinais + trades da versao atual e os conjuntos ARQUIVADOS de versoes anteriores (RC-004), cada registro com `modelVersion`/`rulesetHash` para analise segmentada (§11). E a ponte para o backtesting walk-forward externo do roadmap.

- Impacto DECLARADO: nenhuma mudanca em Setup Score, Radar Score ou Data Confidence (alertas, resumo, avaliacao de outcome, export e UI apenas). Sem bump de versao/ruleset. Efeitos visiveis: alertas de short agora disparam em -42/-60 (antes so -45); o resumo por faixa reagrupa scores negativos nas novas bandas espelhadas.
- Validacao: `node --check` OK; `node --test` 96/96 (teste de bandas atualizado + novo teste de cruzamentos espelhados).
- Verificacao adversarial (concluida): os 5 itens (alertas espelhados; bandas espelhadas; avaliacao em lote; export; contrato §7.3) retornaram CORRETO. Checagens confirmadas: condicoes de cruzamento e IDs unicos para o throttle; todos os inteiros -100..+100 caem em exatamente uma banda (sem lacuna/sobreposicao); criterio de acerto byte-identico ao anterior; convergencia da janela de avaliacao garantida (o pendente mais antigo sempre resolve num fetch bem-sucedido, avancando a janela); chave de match segura (`inputSnapshotId` inclui simbolo+TF+candle); save sem corrida com o loop de refresh; export sem mutacao de storage e com parse defensivo; tabela §7.3 espelha exatamente os gates do codigo.
- Correcao pos-verificacao (aplicada em follow-up): o contador "N sinais avaliados" contava um sinal cujo fetch veio vazio (outcome todo-null e truthy) — adicionado guard que so conta/mescla quando ao menos um horizonte foi preenchido.
- Residuais aceitos (pre-existentes, documentados): simbolo deslistado/sem dados nunca converge (fica pendente com status honesto); duas notificacoes num salto que cruza -42 e -60 de uma vez (espelha o comportamento pre-existente do lado long); o `alertLog` visual mostra so o ultimo alerta do ciclo (as notificacoes do navegador saem todas); fall-through da tabela §7.3 (ex.: +45 com MTF negativo vira "Aguardar pullback") herdado do formato original da tabela.

### RC-007 — Ciclo de fechamento: zerar a lista de conformidade + gates (preview.6, ainda nao publicado)

- Data: 2026-07-13
- Responsavel: Claude Code
- Arquivos: `lib/analytics-core.js`, `app.js`, `test/contract-v1.test.js`, `CONFORMANCE_V1_GAP.md`
- Lista fechada (7 itens):
  1. **§12.7 IMPLEMENTADO** — `RULESET.fallbackProvenanceFactor: 0.8` registrado (muda o `rulesetHash`, dentro da janela nao publicada da preview.6) + helper `sourceProvenanceFactor()` (rotulo com "fallback" -> 0.8; primario/ausente -> 1). Fiado no `dataQuality` do Setup (credito de contexto: chain/protocolo = 1; SO market data de fallback = 0.8) e no bloco Fundamental do Radar (credito numerico somado, nao mais `filter(Boolean)` — que contaria 0.8 como 1). Teste `contrato 12.7`.
  2. **§12.8 TESTADO** — candle em formacao com valores extremos (spike de 50%, volume 100x) nao altera detectores confirmados, contagem, nem o ultimo candle fechado; fronteira `closeTime === asOf` incluida.
  3. **§12.11 TESTADO** — gate de requisicao: resposta atrasada da selecao anterior (outro simbolo/TF) e rejeitada apos `invalidate()`.
  4. **§12.14 TESTADO** (lint de fonte) — os 8 componentes do Setup e os 7 blocos do Radar declaram todos os campos de rastreabilidade obrigatorios.
  5. **§12.16 TESTADO** (nivel motor) — golden fixtures alta (BOS +4) / baixa (CHoCH -6) / lateralizacao (sem evento) + Radar completo congelado nos tres regimes (51 / -51 / 3) com simetria espelhada exata e soma reconciliada.
  6. **Fase 4 AUDITADA** — nenhum alias legado consumido como score final pela UI: todo caminho de exibicao passa por `buildRadarScore` (sobrescreve com o agregado v1); `coreScore` e intermediario interno; o score por TF do `technicalSnapshot` alimenta o componente MTF por design. Resta para encerrar o legado: rollback testado + janela de observacao, pos-release.
  7. **alertLog com historico** — mantem os 4 alertas mais recentes (duas regras no mesmo ciclo nao se sobrescrevem mais).
- Gates executados:
  - Deterministico: `node --test` **101/101** (5 novos testes de contrato).
  - Navegador (novo, independente de Binance): boot-check local em Chromium headless 390x844 — 8/8: zero excecoes nao capturadas do app e zero console.error proprios sob falha TOTAL de rede (227 erros de rede tratados), disclaimer presente, botao de export e tabela de 6 colunas presentes, sem overflow horizontal. Harness no scratchpad da sessao (playwright-core + Chromium do ambiente); o smoke completo com dados reais continua exigindo ambiente com Binance acessivel.
- Impacto DECLARADO (§11): a fiacao do §12.7 pode REDUZIR o Data Confidence (Setup e Radar) quando o contexto de mercado esta coberto apenas pelo fallback CoinPaprika (credito 0.8 em vez de 1). Nenhum score direcional muda. `rulesetHash` muda pela adicao do campo ao RULESET — coberto pelo bump preview.6 ainda nao publicado.
- Meta-auditoria do diff acumulado da sessao (origin/main -> `0d228e3`, 11 commits): 2 auditores adversariais independentes (interacoes no motor; testes/docs/UI). **Conclusao: NENHUM BLOCKER.** Categorias verificadas limpas com evidencia: interacoes entre RCs (clamp x capitulacao, supressao sweep/trap x espelho VWAP, DC x proveniencia em [0,1]), divisor /13 correto, escopo do regex de proveniencia restrito ao market data, sem caminho NaN, coerencia total de versao/hash/journal, wiring da UI (colspans, ids, labels), goldens hardcoded (nao circulares), entradas RC-001..RC-007 batendo com o git log.
- Correcoes aplicadas a partir da meta-auditoria (follow-up, este commit):
  1. Changelog do preview.6 no `ANALYTICS_COVERAGE.md` completado com os itens 7 (clamp conjunto de funding, RC-004) e 8 (fator de proveniencia 0.8, RC-007) — ambos alteram resultado visivel e estavam declarados so no handoff.
  2. Texto do Risco (§10) rederivado dos termos reais: razao positiva cita sobrevenda esticada/exaustao de fundo/volume comprador/liquidacoes absorvidas (antes dizia so "absorcao/volume" quando o maior termo positivo e o +8 de sobrevenda); razao negativa espelhada; reason do componente sem "sweeps" soltos (sweeps agora so confirmados por liquidacoes).
  3. Alertas de score com rotulos de ZONA ("zona de confirmacao compradora/vendedora", "zona favoravel") em vez de rotulos de DECISAO ("entrada com confirmacao") — a decisao real depende de gates (MTF/alinhamento/DC/vetos) que o alerta nao avalia; teste atualizado.
  4. Labels de sweep no smart money diferenciam o branch fraco ("sem reclaim/rejeicao VWAP") do confirmado.
  5. Teste do §12.7 agora TRAVA a convencao entre arquivos: le `api/market.js`, extrai o rotulo real de fallback e asserta fator 0.8 — renomear o rotulo sem ajustar o helper vira teste vermelho.
  6. `HANDOFF_PROXIMA_SESSAO.md` atualizado (contagens, RCs, estado da conformidade, one-liner) e wording do 12.8 no `CONFORMANCE_V1_GAP.md` precisado (o teste prova o filtro + fronteira; a fiacao filtrar-antes-de-pontuar e verificada por inspecao).
- Residuais ACEITOS da meta-auditoria (documentados, sem correcao — pequenos, simetricos ou pre-existentes):
  - Par (sweep + skew de liquidacoes 15m 2x) le o mesmo evento no Risco (+/-2) e no upgrade de confirmacao do trap (6->8 em fluxo) — cross-bucket residual simetrico de baixa magnitude.
  - Testes das novas fiacoes do app.js (credito de DC do 12.7, carryScore pass-through, gate routing) sao por inspecao — consistente com a separacao motor-testavel vs orquestracao do projeto; os primitivos estao todos travados por teste.
  - `sufficient` das tabelas de acerto so tem caso negativo em teste; oscilacao de versao (6->5->6) sobrescreveria um arquivo `archived:` anterior (fluxo irreal pre-release); journal preview.6 local pre/pos RC-007 carrega dois rulesetHash (registros se autodescrevem; versao nao publicada).

### RC-008 — Gate de navegador no CI + intervalos de Wilson (infra Bloco 3 + inicio Bloco 2)

- Data: 2026-07-13
- Responsavel: Claude Code
- Arquivos: `scripts/browser-boot-check.cjs` (novo), `.github/workflows/quality.yml`, `package.json` (`npm run test:boot`), `README.md`, `lib/analytics-core.js`, `app.js`, `index.html`, `test/features.test.js`
- Escopo:
  1. **Boot-check de navegador BLOQUEANTE no CI** (job `browser-boot`, ubuntu + Playwright Chromium): valida boot sem excecao nao capturada mesmo com TODAS as fontes de rede fora (falhas de rede sao filtradas; erro do app reprova), DOM esperado e sem overflow em 390px. E o primeiro gate de navegador executavel em runner geo-restringido — o smoke completo do Edge continua informativo e o gate autoritativo segue local/contra o deploy. Validado neste ambiente: 8/8 sob falha total de rede.
  2. **Intervalos de Wilson (95%)** nas duas tabelas de acerto (sinais por faixa e trades por regime x gatilho x faixa): `wilsonInterval()` no motor, propagado como `hitRateInterval` e exibido como `62% [45–70]` dentro da celula existente (sem coluna nova), com legenda explicando. E incerteza estatistica da FREQUENCIA OBSERVADA, nao calibracao de probabilidade do modelo (esta continua exigindo meses de dados — roadmap). Fundacao honesta do item "calibracao" do Bloco 2.
- Impacto: nenhum em score/DC/decisao (exibicao + infra). Sem bump de versao.
- Validacao: `node --test` 102/102 (teste de Wilson com valores classicos conferidos a mao: 10/20 -> [29.9, 70.1]; 20/20 -> lower ~83.9 e upper 100; propagacao nos dois resumos); boot-check 8/8 apos a mudanca das celulas.
- Limitacao conhecida: o job de CI instala Playwright/Chromium por execucao (runner efemero); Binance segue inalcancavel do sandbox — o smoke autoritativo (`npm run test:browser`) permanece gate manual pre-release na maquina do proprietario.

### RC-009 — Release do preview.6 em producao

- Data: 2026-07-13
- Responsavel: Claude Code, por instrucao explicita do proprietario ("entre no vercel e de o deploy")
- Merge: `76daa9b` (claude/crypto-live-desk-checklist-mezzmj -> main, 18 commits, RC-001..RC-008)
- Gates executados antes do merge: suite deterministica 102/102 (tambem re-executada na main integrada); boot-check de navegador 8/8 (Chromium, zero excecoes do app sob falha total de rede); 10+ auditorias adversariais registradas nas entradas RC-001..RC-008.
- Excecao de fluxo DECLARADA: o smoke autoritativo pre-merge (`npm run test:browser`, exige Binance) NAO foi executado — a Binance e inalcancavel do ambiente remoto desta sessao e o proprietario decidiu publicar mesmo assim. Registro fiel, sem presuncao de aprovacao do smoke.
- Verificacao pos-deploy (estatica, via conector Vercel): producao `crypto-live-desk.vercel.app` servindo `MODEL_VERSION = '1.0.0-preview.6'` no app.js e `rulesetVersion: '1.0.0-preview.6'` + `fallbackProvenanceFactor: 0.8` + `wilsonInterval` no analytics-core.js. Deploy automatico via integracao GitHub confirmado.
- Verificacao comportamental PENDENTE (dono): abrir a producao no navegador e conferir 24 ativos carregando, Setup Score/explicacao no ativo, aba Sinais (journal novo comeca vazio na preview.6; o da preview.5 fica arquivado no navegador em que existia), versao preview.6 visivel e ausencia de erros de console.

### REV-CC-01 — Revisao cruzada independente do working tree preview.7-codex.2

- Data: 2026-07-13
- Revisor: Claude Code (Opus 4.8)
- Base analisada: `b124fcb` ate a arvore de trabalho completa (33 rastreados + 26 novos), versao `1.0.0-preview.7-codex.2`
- Cobertura: as 65 linhas `AGUARDANDO CLAUDE CODE` e os 7 `CONFIRMADO`; todas as areas do ledger.
- Estado: **PARCIALMENTE REVISADO** — parte promovida a `REVISADO PELO CLAUDE CODE`; o restante segue `AGUARDANDO CLAUDE CODE` com correcao exigida. Sem aprovacao em bloco. Nenhum resultado verde foi tratado como aprovacao conceitual.

Metodologia (adversarial, objetivo refutar e nao confirmar):
- Leitura pessoal do cluster de concorrencia/persistencia/seguranca: `durable-signals.js`, `signal-sync-client.js`, `cross-tab-lock.js`, `api-guard.js`, `signals.js`, `signal-worker.js`, `redis-runtime.js`.
- Cinco revisoes adversariais por cluster (contrato/integridade; numerico/estabilidade; klines; metodologia/temporal; APIs/fontes) e um workflow de verificacao com skeptic independente por suspeita (OPS/CI, performance, UX/honestidade, acessibilidade, headers/servidor). 16 suspeitas foram confirmadas por skeptic independente.
- Verificacoes objetivas reexecutadas de forma independente:
  - `node --test`: **250/250** aprovados (Node v24.16.0). O handoff citava 245; a arvore tem 250.
  - Cobertura com pisos 95/75/90: **97,96% linhas / 80,03% branches / 96,42% funcoes**, exit 0.
  - `node --check` em todo JS/CJS: limpo. `git diff --check` vs `b124fcb`: limpo.
  - Navegador local (`dev-server`): app carregou com dados ao vivo, **24 cards**, resumo "0 compradores, 15 vendedores, 9 neutros", **zero erro de console** — reconfirma a evidencia visual do Codex.

Conclusao geral: **as implementacoes P0/P1 resistem ao ataque; a fragilidade sistemica esta nos testes-guarda.** Uma parcela relevante dos fechamentos e protegida apenas por regex de texto-fonte ou por poucos fixtures manuais e NAO falharia se a correcao fosse revertida — o que, pelo principio 6 do `AUDIT_LOOP.md` ("Correcao sem teste de regressao permanece aberta"), mantem esses itens abertos. A revisao tambem encontrou defeitos e regressoes reais que a suite verde nao pega.

#### A. Defeitos e regressoes reais (corrigir antes de promover)

| Item | Sev | Local | Problema confirmado | Correcao exigida |
| --- | --- | --- | --- | --- |
| ANL-027 (reaberto) | P1 | durable-signals.js:26,44,62-85 | O merge Lua de PRODUCAO nunca e executado por teste; o fake `eval` (durable-signals.test.js:48-88,114) reimplementa o merge em JS com resolucao de conflito OPOSTA. Na colisao mesmo-candle com `inputSnapshotId` diferente o Lua faz `incoming` vencer e descarta o registro armazenado (com outcome do worker), contradizendo o invariante documentado "primeiro snapshot e canonico" (durable-signals.js:380-381, signal-sync-client.js:104-107). Sob corrida de 2 escritores o outcome regride (transitorio, auto-curavel via re-due). | Ramo de mismatch do Lua deve preservar `current` (igual ao JS/cliente); adicionar teste que EXECUTE os 3 scripts Lua (fake fiel ou Redis embutido). |
| OPS-003 | P1 | quality.yml:40-63; app.js:46,381 | Smoke de navegador virou gate BLOQUEANTE e ao mesmo tempo a limitacao documentada de HTTP 451 (Binance geo-bloqueia runner hospedado) e sua mitigacao (`continue-on-error`) foram APAGADAS, sem mudar o caminho de dados (24 cards buscam Binance direto, sem proxy). Se o 451 persistir, as 2 tentativas falham e TODO PR trava. Apagar limitacao documentada tambem viola o `CLAUDE.md`. | Rodar o workflow em runner hospedado e confirmar; se 451 persistir, proxyar klines pela camada /api com fixture de CI OU restaurar a limitacao/mitigacao documentada. |
| OPS-009 | P2 | quality.yml:30,32,50,52; package-lock.json | `package-lock.json` esta UNTRACKED (`git status ??`). `actions/checkout` so busca versionados, entao `cache: npm` e `npm ci` falham deterministicamente nos DOIS jobs; um `git commit -am` de rotina o omite. | `git add package-lock.json` e versiona-lo antes de confiar no gate. |
| UX-001 | P2 | app.js:2419,3247,3262 | STILL-BROKEN, byte-identico ao base: o painel de cobertura mostra verde "Coberto \| OI, funding, L/S, taker" quando so uma metrica esta viva (funding TTL 12h vs TTLs menores das demais). Viola a clausula "parte de derivativos falha" do proprio UX-001. Nunca corrigido. | Status por metrica real (nao OR de 6 metricas com rotulo estatico) + teste de estado parcial. |
| UX-005 | P3 | app.js:122 vs 1993,3811,3953 | STILL-BROKEN parcial: rotulo de timezone so em 1 timestamp (header); journal/trades/news sem fuso. Docs (ANALYTICS_COVERAGE.md:20, CODEX_HANDOFF.md:207) declaram "timezone" entregue, superestimando. | Timezone em todos os timestamps (ou configuravel) + teste de virada de dia; corrigir o overclaim nos docs. |
| priceChangeOverWindow | P3 | analytics-core.js:476 | STILL-BROKEN (menor): unico `return` reworkado sem guarda finita; emite `Infinity` para entradas extremas. Contido a jusante por `toFiniteNumber`, mas viola o invariante "nunca Infinity" e nao e fuzzado. | `isFiniteNumber(x) ? x : NaN` no retorno + fuzz. |
| DEV-dotfile-via-symlink | P3 | dev-server.cjs:73,79,84-93 | NOVO: o bloqueio de dotfile roda no caminho LEXICO; o realpath so e checado para escape de raiz. Um symlink nao-oculto para dotfile interno (`public.txt` -> `.env`) e servido. So localhost/dev, baixo impacto, mas as protecoes nao compoem. | Reaplicar a checagem de segmento oculto sobre o realpath resolvido. |
| API-004 | P2 | market-microstructure.js:180,199 | Parcial: o `observedAt` de topo ainda e `Math.max(...)`; o `fetchedAt` da Binance ocupa o mesmo campo dos timestamps de provedor sem flag de proveniencia; sem rejeicao de staleness absoluta (so skew mutuo). Seguro so enquanto a Binance esta presente e fresca. | Flag de proveniencia por venue + `venuesStale` por limite absoluto. |

#### B. Guardas fracos: implementacao correta, revert passaria (seguem AGUARDANDO; correcao = teste real)

Implementacao verificada como correta, mas o teste-guarda nao falharia se a correcao fosse revertida (ou inexiste). Pelo principio 6 do loop, seguem abertos ate ganharem regressao de comportamento:

- **ANL-018 (P0)** — hash sobre implementacao funciona (perturbei um corpo de score e o hash mudou), mas o teste so exercita o canal `extraImplementation` e nao fixa hash-ouro; derrubar `analyticsCoreFactory` do material do hash passa verde. Correcao: pin de hash-ouro + assert de que `rulesetHash()` muda ao perturbar o core.
- **ANL-001 (P0)** — book/liquidacoes entram no `buildInputSnapshotId` (app.js:288), mas a funcao nao e exportada e nao ha teste de identidade/diferenca. Correcao: exportar + teste (mesmo estado -> mesmo id; diferindo so book/liq -> id diferente).
- **ANL-024 (P2)** — narrativas ja emitem "indisponivel" (sem NaN->direcional), porem ZERO teste. Correcao: teste por narrativa.
- **ANL-008 (P1)** — OHLC completo e ordem stop-first corretos hoje, mas stop+alvo no mesmo candle sem teste dedicado; regressao target-first passa. Correcao: teste do candle com ambos.
- **ANL-009 / ANL-010 (P1)** — corretos, mas guardados por regex de texto (features.test.js:266,268). Correcao: teste assincrono de idempotencia e de fonte tardia.
- **ANL-005 (P0)** — 112 em todo lugar, mas os clamps do score sao literais duplicados de `RULESET.setupCaps` sem assert `soma==112`. Correcao: derivar clamps do ruleset + assert.
- **ANL-017 (P1)** — validador solido; semanticas nao fixadas por teste (dedupe de timestamp duplicado, `closeTime==time`, `volume=null`+taker grande passam). Correcao: fixar a semantica intencional.
- **OPS-001 / OPS-002 / OPS-007** — warmup/deadline-absoluto/backoff-de-outage corretos, mas so "testados" por regex de fonte (ou sem teste). Reverter deadline para 18s+18s=36s>30s passa verde. Correcao: testes comportamentais.
- **OPS-014** — piso de cobertura e bloqueante, porem `app.js` (~4338 linhas, maior arquivo) fica fora do denominador; os 95/75/90 nao dizem nada sobre a logica do app. Correcao: documentar a exclusao onde os pisos sao citados.
- **UX-004 / UX-007** — alvos <44px residuais (`.score-explanation summary` ~16px; foco de teclado inconsistente na calculadora) e disclosure MTF sem teste; a11y test cobre 6 de ~20 seletores. Correcao: ampliar teste + corrigir summary/calculadora.
- **SEC-001-gap** — HSTS e Referrer-Policy presentes no `vercel.json` mas sem assert; remover qualquer um passa verde. Correcao: assert dos 6 headers.
- **DEV-symlink-realpath (P2)** — o hardening de realpath e correto, mas o teste intitulado "inclusive via link simbolico" NAO cria symlink algum (so testa `isWithinRoot` puro). Reverter para `fs.readFile(filename)` passa. Correcao: teste com symlink real.
- Funcoes de estabilidade numerica (pearson/beta/median/weightedMedian/realizedVolatility/priceChangeOverWindow) so tem testes de ponto; nao entram no fuzz. Correcao: incluir no harness de propriedade.
- Observacao adjacente: a reescrita de `average()` (escala para overflow) muda resultados no nivel de ULP para todos os consumidores (Bollinger, volume, correlacao) — benigno para score, mas fonte latente de fragilidade em testes de igualdade exata.

#### C. Promovidos a REVISADO PELO CLAUDE CODE (implementacao correta E regressao adequada)

- Integridade/contrato: ANL-002, ANL-004, ANL-006, ANL-012, ANL-016, ANL-021, ANL-022, DOC-001, DOC-002, DOC-003 (ANL-004/016/022 com ressalva de teste). ANL-026 (canonicalidade remota do cliente).
- Numerico/metodologia: ANL-007, ANL-011, ANL-013, ANL-014, ANL-019, ANL-020, ANL-023, ANL-025.
- APIs/fontes: API-001, API-002 (ressalva: sem teste de falha parcial), API-003, API-005, API-007, API-008, API-009, API-010, API-011, API-013 e a microestrutura CVD/overflow (interpretacao do campo `m` confirmada).
- Persistencia/seguranca/UX/operacao: SEC-002, SEC-003, SEC-004, SEC-005, API-012, API-014, API-015, UX-002, UX-006, UX-008, OPS-004, OPS-008.
- Ressalva transversal: todo fechamento que depende de Lua/Redis reais (SEC-003 clear, SEC-005 lease, ANL-027 merge, compact/retencao) permanece NAO comprovado contra Redis real — a logica foi revisada, mas os scripts Lua nunca executaram.

#### D. Dividas CONFIRMADO confirmadas como honestamente abertas

ANL-003, API-006, OPS-005, OPS-006, OPS-011, OPS-012, OPS-013 seguem `CONFIRMADO`: dependem de provisionar Redis/`CRON_SECRET`, mover o repo para fora do OneDrive, commit/preview do hash candidato e execucao remota de CI/worker. A revisao confirma que estao corretamente marcados como abertos.

#### E. Nao revisado nesta rodada

ANL-015 (calendario/flag `reported` de ETF) e OPS-010 (smoke exerce o contrato de override) nao foram cobertos por esta rodada; permanecem `AGUARDANDO CLAUDE CODE` sem conclusao.

#### F. Recomendacao

Nao promover a producao. Ordem sugerida: (1) corrigir a secao A (P1 primeiro: merge Lua e OPS-003; depois OPS-009/UX-001); (2) converter os guardas fracos da secao B em testes de comportamento; (3) so entao reexecutar o gate completo, provisionar Redis e exercitar os scripts Lua contra Redis real; (4) gerar preview do hash candidato e reconciliar contrato preview vs producao antes de qualquer promocao. Autoria Codex e limitacoes documentadas preservadas.

### CC-FIX-01 — Correcao integral dos achados da REV-CC-01

- Data: 2026-07-13
- Autor: Claude Code (Fable 5), sob instrucao do proprietario ("vamos corrigir tudo")
- Base: `e5d46ce` (docs pos-887ec57)
- Escopo: fechar os 8 defeitos da secao A da REV-CC-01 e converter os guardas fracos da secao B em testes de comportamento. Autoria e limitacoes do historico Codex preservadas.

#### Secao A — defeitos corrigidos

| Item | Correcao | Regressao (prova de revert) |
| --- | --- | --- |
| ANL-027 (P1) | O merge Lua nao invalida mais o registro armazenado por mismatch de `inputSnapshotId`/`rulesetHash`: `current` valido vence sempre (primeiro snapshot canonico), igual ao JS/cliente. Scripts Lua exportados via `LUA_SCRIPTS`. | test/durable-signals-lua.test.js executa os 3 scripts Lua de PRODUCAO numa VM Lua real (fengari, devDependency) com shims fieis de redis.call/cjson (test/helpers/lua-redis.cjs). Revert verificado: reintroduzir o mismatch fez 2 testes falharem. |
| OPS-003 (P1) | Limitacao documentada de HTTP 451 (geo-block Binance em runner hospedado) RESTAURADA em quality.yml; browser-smoke voltou a ser advisory (`continue-on-error: true`) ate os klines serem proxyados pela camada /api. O gate bloqueante deterministico segue sendo deterministic-tests. | Comentario normativo no proprio workflow; confirmar comportamento em runner hospedado segue pendente (infra). |
| OPS-009 (P2) | Ja estava fechado no checkpoint `887ec57` (`package-lock.json` versionado; `git ls-files` confirma). | `npm ci` no CI depende do lock versionado. |
| UX-001 (P2) | Painel de cobertura com status POR METRICA: `AnalyticsCore.derivativeCoverage()` (ok/partial/none, rotulo com metricas vivas e faltantes); app.js usa estado `warn` (classe CSS ja existia) e prefixo "Parcial". | analytics-core.test.js (estado pleno/parcial/none). Verificado ao vivo no navegador: "Parcial \| OI, funding, L/S, top traders, basis \| faltam: taker". |
| UX-005 (P3) | `AnalyticsCore.formatDisplayTimestamp(ms, timeZone, style)` com fuso explicito aplicado a journal, sinais, noticias e status; rotulo de fuso em signalsStatus/newsStatus/caption de trades. Overclaim corrigido em ANALYTICS_COVERAGE.md. | Teste de virada de dia (America/Sao_Paulo vs UTC) em analytics-core.test.js. |
| priceChangeOverWindow (P3) | Guarda finita no retorno (`Infinity -> NaN`). | Caso dirigido + fuzz de estabilidade numerica (pearson/beta/weightedMedian/realizedVolatility/priceChangeOverWindow) em fuzz-invariants.test.js. |
| DEV-dotfile-via-symlink (P3) | Checagem de segmento oculto reaplicada sobre o realpath resolvido (`hasHiddenSegment` exportado). | dev-server.test.js cria symlink real (quando permitido) E junction de diretorio (sempre roda no Windows) apontando para `.github`; revert empirico da checagem fez o teste falhar. Cobre tambem DEV-symlink-realpath da secao B. |
| API-004 (P2) | `observedAtProvenance` por venue ('provider'/'fetch'/'missing'; Binance bookTicker = 'fetch'), `observedAtProvenance` de topo ('mixed' quando ha relogio de busca no conjunto) e staleness ABSOLUTA (60s vs relogio da busca) com `venuesStale` no payload e em errors. | market-microstructure-api.test.js: venues uniformemente velhas (skew ~0) sao rejeitadas; proveniencia por origem. |

#### Secao B — guardas fracos convertidos em testes de comportamento

- test/behavior-guards.test.js (28 testes): ANL-018 (pin de hash-ouro `b91fdb37` + recompute independente do hash a partir do fonte), ANL-024 (9 superficies narrativas do core sem NaN->direcional), ANL-008 (stop+alvo no mesmo candle sai em stop, long/short/gap), ANL-009/010 (idempotencia de replay, tombstone FLAT, fonte tardia fora do snapshot, maxLagMs), ANL-005 (soma dos setupCaps == 112 + cross-check dos literais de app.js contra o ruleset), ANL-017 (semanticas do validador de klines fixadas: ultima copia valida vence, closeTime==time aceito, volume null nao fabrica fluxo).
- test/ops-behavior.test.js (5 testes): OPS-002 deadline ABSOLUTO de 30s nas rotas market/options (revert 18s+18s verificado empiricamente como detectado), OPS-001 warmup/single-flight, OPS-007 backoff de outage com cooldown. OPS-014 documentado tambem no OPERATIONS_RUNBOOK.md com doc-guard.
- test/security-headers.test.js (3 testes): presenca e VALOR dos 6 headers de seguranca do vercel.json + semantica (HSTS >= 2 anos, CSP sem unsafe-eval) + maxDuration 30s.
- test/a11y-extended.test.js (3 testes): alvo de 44px no summary da explicacao do score (corrigido em styles.css), foco de teclado da calculadora (o `outline: 0` do campo base suprimia o `:focus-visible` global de especificidade zero — regra propria adicionada), disclosure details/summary e regioes roladas focaveis.
- ANL-001: `buildInputSnapshotId`/`datasetInputStamp` extraidos para o core (app.js monta apenas o spec de estado) + teste de identidade/diferenca incluindo book/liquidacoes via inputComponents.

#### Pendencias remanescentes (sem mudanca de codigo possivel localmente)

- Infra da secao D da REV-CC-01: Redis/`CRON_SECRET`, cron do worker, sair do OneDrive, preview do hash candidato, CI em runner hospedado (confirmar 451), Lua contra Redis real.
- ANL-015 e OPS-010 seguem sem revisao (secao E da REV-CC-01).
- Derivar de fato os clamps de `buildConfluence` (app.js) do ruleset — hoje ha cross-check de igualdade por teste; a derivacao e refactor de app.js para rodada propria.
- Substituicao dos regexes de features.test.js:266,268 por teste de pipeline exigiria harness de DOM para app.js; a metade exportada pelo core esta coberta por comportamento.

#### Gate executado

- `npm run test:coverage`: **303/303** aprovados; cobertura **97,95% linhas / 81,46% branches / 96,54% funcoes** (pisos 95/75/90, exit 0).
- `node --check` em todos os JS/CJS rastreados: limpo. `git diff --check`: limpo.
- Navegador local (dev-server): app carregou com dados ao vivo, 24 cards, zero erro de console; painel de cobertura exibindo estado parcial honesto de derivativos.
- `rulesetHash` mudou de `4445fcf0` para `b91fdb37` (adicoes conscientes ao core; nenhuma regra de score alterada); pin atualizado com justificativa em test/behavior-guards.test.js.

### CC-FIX-02 — Fase C: dividas remanescentes da revisao

- Data: 2026-07-13
- Autor: Claude Code (Fable 5)
- Escopo: itens C1-C5 do HANDOFF_PROXIMA_SESSAO.md.

| Item | Resultado |
| --- | --- |
| ANL-015 | **REVISADO PELO CLAUDE CODE.** Revisao adversarial do calendario/flag `reported` de ETF: calendario NYSE correto (feriados moveis, observancia sab/dom, meio-pregao como dia de negociacao), zero legitimo preservado, precedencia da flag do provedor. 1 defeito real corrigido: envelope MCP de formato inesperado lancava TypeError nao controlado (api/institutional.js) — agora degrada com erro controlado; 3 testes novos em institutional-api.test.js (10/10). Risco residual documentado: timestamp datetime em ET (nao usado pelo provedor hoje) seria classificado pela data UTC. |
| OPS-010 | **REVISADO PELO CLAUDE CODE.** browser-smoke.cjs exercita o contrato de override (autor+motivo+submit) e o check snapshotIdentityChanges valida a mudanca de identidade do snapshot; evidencia no log do proprio CI. |
| C3 (ANL-005 residuo) | buildConfluence agora DERIVA clamps e max: de RULESET.setupCaps (16 substituicoes); o cross-check de literais virou guarda de derivacao com prova de revert. |
| C4 | Pipeline gated por comportamento em navegador REAL no job bloqueante browser-boot: snapshot com identidade completa + envelope rastreavel quando ha dados ao vivo (condicional honesto: sem rede, o boot continua valido). |
| C5 | Avaliacao de sinais com 1 fetch de 15m por simbolo (cobre todos os pendentes do par; 1000x15m ~ 10,4 dias), 1m por registro para o horizonte de 1h, teto por clique 10 -> 50. |

Gate: 316/316 com cobertura acima dos pisos (3 execucoes estaveis), boot-check OK online e offline, node --check limpo. Hash de nivel app muda por design (implementacao do app.js e material do hash); pin do core (4efe8ce2) inalterado — nenhuma regra de score mudou.

### CX-011 — Plano mestre de evolucao profissional do sistema

- Data: 2026-07-13
- Responsavel: Codex
- Base versionada: `e25ec34` (`main` sincronizada com `origin/main`)
- Estado: **REVISADO PELO CLAUDE CODE — COM RESSALVAS** (2026-07-17, REV-CC-02: plano solido-com-ressalvas; 10 questoes, emendas exigidas na correcao L)
- Escopo:
  - Auditoria combinada do fluxo de produto em producao, cobrindo dashboard geral, resumo do ativo, journal de sinais e viewports desktop/mobile.
  - Inventario das fontes atuais e dos pontos cegos de qualidade, proveniencia, microestrutura, derivativos, macro, institucional, on-chain, DeFi, risco e validacao estatistica.
  - Pesquisa em documentacao oficial de FRED/ALFRED, BLS, Coin Metrics, Deribit, DefiLlama, Etherscan, Polymarket, SEC EDGAR e CFTC para classificar novas fontes por valor, custo, licenca e risco de sobreposicao.
  - Criacao de `SYSTEM_EVOLUTION_PLAN.md` com arquitetura-alvo, nove fases de execucao, criterios de saida, priorizacao de APIs, KPIs e guardrails.
  - A Fase 0 foi definida como bloqueante: estabilizar a arvore local e reconciliar hash/testes/documentacao antes de adicionar APIs ou redesenhar a interface.
- Arquivos:
  - `SYSTEM_EVOLUTION_PLAN.md`
  - `CODEX_HANDOFF.md`
- Validacao Codex:
  - Cinco capturas aceitas e inspecionadas: Geral desktop, Ativo desktop, Sinais desktop, Geral mobile e Ativo mobile.
  - Producao observada com 24 cards, modelo `1.0.0-preview.8` e dados ao vivo durante a auditoria.
  - Inventario mecanico das rotas, endpoints externos e registro normativo de fontes.
  - Nenhuma regra de score, API, runtime ou interface foi alterada por esta entrada.
- Limitacoes conhecidas:
  - A arvore ja estava suja antes desta entrada, com alteracoes funcionais nao registradas e `run.json` nao rastreado; este lote nao atribui autoria nem aprova essas mudancas.
  - O gate preexistente permanece vermelho: 318/319 testes por divergencia do pin de `rulesetHash` (`4efe8ce2` esperado, `893cf675` atual).
  - A auditoria visual nao equivale a conformidade WCAG completa.
  - Licencas e planos comerciais devem ser confirmados antes de publicar integracoes novas.
  - O plano e proposta Codex e requer revisao conceitual real no Claude Code antes de ser tratado como alinhado.

### CX-012 — Estabilizacao da base e contrato de dados piloto

- Data: 2026-07-13
- Responsavel: Codex
- Base versionada: `e25ec34` (`main`)
- Estado: **REVISADO PELO CLAUDE CODE — COM RESSALVAS** (2026-07-17, REV-CC-02: cap 10k/throttle/sanitizacao/compat legada confirmados; 'fail-closed' de schema refutado como redigido; correcoes A, F, G)
- Escopo:
  - Preservar e estabilizar a arvore local preexistente sem apagar historico nem atribuir revisao indevida.
  - Manter o hash-ouro `4efe8ce2` ao separar o throttle de rede do material normativo do motor; nenhuma regra de score foi alterada.
  - Centralizar a sanitizacao de erros publicos, evitando exposicao de mensagens internas de excecao.
  - Fazer a sincronizacao falhar fechada quando o lease entre abas e perdido, abortando rede e impedindo commit local posterior.
  - Acrescentar limite global atomico de 10.000 registros ao journal Redis, com limpeza do indice durante clear/compact e teste dos scripts Lua reais em VM.
  - Implementar o contrato de dados `1.0.0` e migrar `market.overview.v1` como piloto, mantendo o formato legado da rota.
  - Exibir no painel `Saude dos dados` status, cobertura, latencia, qualidade e hash do dataset piloto, declarando honestamente a migracao parcial.
  - Reconciliar o plano mestre e os documentos operacionais com o estado local e o estado observado de producao.
- Arquivos alterados neste lote:
  - Documentacao: `README.md`, `SYSTEM_EVOLUTION_PLAN.md`, `ANALYTICS_COVERAGE.md`, `AUDIT_LEDGER.md`, `HANDOFF_PROXIMA_SESSAO.md`, `CODEX_HANDOFF.md`.
  - Contrato/rede/persistencia: `lib/data-contract.js`, `lib/api-guard.js`, `lib/cross-tab-lock.js`, `lib/request-client.js`, `lib/signal-sync-client.js`, `lib/durable-signals.js`.
  - APIs: `api/defillama.js`, `api/institutional.js`, `api/macro.js`, `api/market.js`, `api/market-microstructure.js`, `api/news.js`, `api/options.js`, `api/signal-worker.js`, `api/signals.js`, `api/tradfi.js`.
  - Interface: `index.html`, `app.js`, `styles.css`.
  - Suporte/testes: `scripts/dev-server.cjs`, `test/analytics-core.test.js`, `test/api-guard.test.js`, `test/cross-tab-lock.test.js`, `test/data-contract.test.js`, `test/defillama-api.test.js`, `test/dev-server.test.js`, `test/durable-signals-lua.test.js`, `test/durable-signals.test.js`, `test/features.test.js`, `test/helpers/lua-redis.cjs`, `test/institutional-api.test.js`, `test/macro-api.test.js`, `test/market-api.test.js`, `test/news-api.test.js`, `test/options-api.test.js`, `test/request-client.test.js`, `test/signals-api.test.js`, `test/tradfi-api.test.js`.
- Validacoes Codex executadas:
  - `npm.cmd test`: 324/324 aprovados antes do contrato piloto.
  - `npm.cmd run test:coverage`: 329/329 aprovados; 97,45% linhas, 81,71% branches e 96,72% funcoes; exit 0.
  - `node --check app.js`, `node --check lib/data-contract.js` e `node --check api/market.js`: limpos.
  - Testes dirigidos de sanitizacao, perda de lease, abort signal, limite Redis/Lua e envelope de mercado: aprovados.
- Limitacoes e pendencias:
  - O boot-check local havia encontrado bloqueio de criacao do processo do navegador (`EPERM`); precisa ser reexecutado no ambiente permitido. Smoke e audit de dependencias tambem permanecem pendentes neste lote.
  - A alteracao visual do painel piloto ainda precisa de verificacao local desktop/mobile antes do fechamento do lote.
  - `run.json` ja estava nao rastreado e foi preservado; sua remocao exige decisao explicita do proprietario.
  - `scripts/browser-boot-check.cjs` aparece modificado na arvore preexistente, mas nao integra o escopo autoral descrito acima.
- Nenhuma mudanca deste lote foi commitada, publicada ou promovida. Testes verdes nao substituem revisao conceitual real no Claude Code.

### CX-013 — Validacao de series, schema drift, bitemporalidade macro e health registry

- Data: 2026-07-13
- Responsavel: Codex
- Base versionada: `e25ec34` (`main`), sobre o lote local CX-012
- Estado: **REVISADO PELO CLAUDE CODE — COM RESSALVAS** (2026-07-17, REV-CC-02: health registry e bitemporal parcial confirmados; SLA de frescor NAO aplicado, schema raso, validators sem uso; correcoes B, C, D, E, H)
- Escopo:
  - Criar validadores reutilizaveis de numero finito e series temporais com range, futuro, ordenacao, duplicidade, amostra minima, staleness, cobertura e completude.
  - Acrescentar contratos de schema para `market.overview.v1` e `macro.us-risk.v1`, fingerprint da forma observada e falha fechada quando campo obrigatorio muda de tipo ou desaparece.
  - Ampliar o envelope com `vintageAt`, `decisionEligibleAt`, validacao da ordem bitemporal e dimensao de validade.
  - Migrar macro Treasury/VIX para o envelope unificado, com SLA proprio e declaracao `backtestSafe:false` enquanto os upstreams atuais nao fornecerem o instante da primeira publicacao.
  - Criar health registry limitado por instancia com p50/p95 de duracao, taxa de erro, cache hit, fallback, ultimo sucesso/falha, qualidade, cobertura e atraso de ingestao.
  - Anexar telemetria a mercado e macro e exibir schema, p95, taxa de erro e escopo no detalhe do painel de saude, sem misturar esses valores ao score.
- Arquivos alterados neste lote:
  - Runtime: `lib/data-contract.js`, `lib/data-validators.js`, `lib/data-health-registry.js`, `api/market.js`, `api/macro.js`, `app.js`.
  - Testes: `test/data-contract.test.js`, `test/data-validators.test.js`, `test/data-health-registry.test.js`, `test/market-api.test.js`, `test/macro-api.test.js`.
  - Documentacao: `README.md`, `SYSTEM_EVOLUTION_PLAN.md`, `ANALYTICS_COVERAGE.md`, `AUDIT_LEDGER.md`, `HANDOFF_PROXIMA_SESSAO.md`, `CODEX_HANDOFF.md`.
- Validacoes Codex:
  - Testes dirigidos do lote: 26/26 aprovados.
  - `npm.cmd run test:coverage`: **336/336** aprovados; cobertura **97,49% linhas / 82,03% branches / 96,87% funcoes**; exit 0.
  - `node --check` em 54 arquivos JS/CJS rastreados e novos: limpo.
  - `git diff --check`: limpo; apenas avisos de normalizacao CRLF/LF.
  - Complemento visual do CX-012: painel local verificado em desktop e 390 x 844, sem overflow do documento e sem erros de console; capturas `07-local-data-health-panel.jpg` e `08-local-data-health-mobile.jpg` no diretorio de visualizacoes da tarefa.
- Limitacoes:
  - O health registry declara escopo `instance`; nao substitui agregacao distribuida, retencao operacional ou observabilidade da plataforma. Requisicoes barradas em 429 antes do handler ainda nao entram nessa amostra.
  - Treasury/Cboe fornecem a observacao diaria atual, mas nao o instante historico de primeira publicacao/revisao usado por ALFRED; por isso o dataset permanece explicitamente nao seguro para backtest vintage.
  - Os contratos de schema cobrem apenas os dois pilotos e usam fixtures controladas; fixtures reais minimizadas e migracao das demais rotas continuam pendentes.
  - A auditoria de dependencias tentou consultar o registro npm, mas a divulgacao externa de metadados foi bloqueada ate autorizacao explicita do proprietario; nenhuma alternativa indireta foi usada.
- Nenhuma mudanca foi commitada, publicada ou revisada no Claude Code.

### CX-014 — Navegacao mobile compacta e versao visual centralizada

- Data: 2026-07-13
- Responsavel: Codex
- Base versionada: `e25ec34` (`main`), sobre CX-012/CX-013 locais
- Estado: **REVISADO PELO CLAUDE CODE — COM RESSALVAS** (2026-07-17, REV-CC-02: navegacao/a11y confirmadas ao vivo em 390x844; 'selo unico' refutado como redigido; correcoes I, J, K)
- Escopo:
  - Substituir no mobile a faixa horizontal de oito abas por um seletor compacto, preservando as abas existentes no desktop.
  - Sincronizar os dois controles com `data-asset-tab`, manter a area selecionada e rolar para o controle correto em cada viewport.
  - Remover `aria-pressed=true` das abas ocultas ao voltar para Geral, retirar esses controles da ordem de tabulacao e restaurar o estado ao reabrir Ativo.
  - Centralizar `1.0.0-preview.8` em um unico selo de modelo e remover a repeticao visual de `preview` em cards, resumos, relatorio e rodape, sem alterar nomes ou calculos dos scores.
- Arquivos alterados:
  - `index.html`
  - `styles.css`
  - `app.js`
  - `test/features.test.js`
  - `README.md`
  - `SYSTEM_EVOLUTION_PLAN.md`
  - `CODEX_HANDOFF.md`
- Validacoes Codex:
  - `node --test test/features.test.js test/a11y-extended.test.js`: 23/23 aprovados.
  - `npm.cmd run test:coverage`: 336/336 aprovados; cobertura 97,49/82,03/96,87; exit 0.
  - `node --check app.js`: limpo. `git diff --check`: limpo, com avisos CRLF/LF.
  - Navegador local 390 x 844: seletor alterou Resumo -> Sinais, exibiu `Registro de sinais`, documento permaneceu sem overflow e Geral deixou zero subabas com `aria-pressed=true`.
  - Captura inspecionada: `09-local-mobile-compact-nav.jpg` no diretorio de visualizacoes da tarefa.
- Limitacoes:
  - Este lote fecha apenas os quick wins de navegacao/rotulo identificados na auditoria; hierarquia da home, tese/invalidacao, estados de falha, contraste/zoom e reorganizacao completa da area Ativo permanecem na Fase 2.
  - Nenhuma regra analitica, hash-ouro ou endpoint foi alterado por este lote.
  - Nenhuma mudanca foi commitada, publicada ou revisada no Claude Code.

### CC-FIX-03 — Correcao integral dos achados da revisao de estado completo (2026-07-17)

- Data: 2026-07-17
- Responsavel: Claude Code (Fable 5), por instrucao explicita do proprietario ("eu quero corrigir tudo")
- Base: arvore de trabalho sobre `e25ec34`; revisao de estado completo executada nesta mesma sessao (4 revisores paralelos + verificacao independente linha a linha; nenhum CRITICO, nenhum XSS)
- Escopo (todas as correcoes aplicadas e verificadas):
  - `scripts/dev-server.cjs`: guard de byte nulo/controles pos-decode (400) — `GET /%00` derrubava o processo via throw sincrono de `fs.realpath` fora do try/catch; testes `/%00` e `/index.html%00.png` em `test/dev-server.test.js`.
  - `scripts/browser-boot-check.cjs`: regex `networkNoise` apertado para assinaturas ancoradas — alternativas soltas (`fetch`, `4\d\d`, `5\d\d`, `WebSocket`) engoliam erros reais do app (falso verde).
  - `lib/api-guard.js`: `publicErrorMessage` (erros autorados passam; excecoes de runtime/bibliotecas viram genericas e vao ao log) aplicado nos catch-alls de signals/market/defillama/options/market-microstructure; `clientKey` reordenado (x-vercel-forwarded-for -> socket -> XFF) para nao confiar em header forjavel quando ha conexao real; `requestHost` com `host` antes de `x-forwarded-host` na decisao de CORS; log throttled (60s) quando o limiter distribuido degrada para `instance-fallback`.
  - `api/macro.js`: parsers de XML/CSV em try/catch (503 gracioso, nao 500). `api/news.js`: sort null-safe de `published`.
  - `lib/durable-signals.js`: `INCOMPLETE_CAP=500` por namespace espelhado no Lua de compactacao (ARGV[5], `removeField` limpa o membro do `DUE_KEY` global) e em `compactDurableSignals` — fecha o DoS de custo por POST nao autenticado variando `signalCloseTime`; paridade dos validadores Lua (schemaVersion==3 no merge; simbolo 5..19 chars no compact). Testes JS + Lua real (fengari) do cap.
  - `lib/cross-tab-lock.js`: falha repetida (>=2) de heartbeat reporta `storage-lock-heartbeat-failed` via `reportDegraded` — perda de exclusividade deixou de ser silenciosa.
  - `app.js`: consumidores da narrativa localizam buckets por `ruleId` (`componentByRule`) em vez de indice posicional; rampa continua do RSI sobrecomprado (+3 em 70 ate -8 em 80, elimina o degrau de 11 pontos em 78); `mfi` exclui candle sem volume finito (paridade com `cmf`); `escapeHTML` no simbolo/nome do card do radar (fecha a unica interpolacao sem escape); eviction de `mtfCache`/`derivativeCache` na politica do `historyCandles`; memo de confluencia com stamp grosseiro de liquidacoes (burst entre re-stamps invalida o memo); reuso do envelope de evidencia bruta quando `inputSnapshotId` nao mudou (elimina 2-3 capturas profundas por ciclo de 3s); rotulos "VWAP" renomeados para "VWAP 48c"/"VWAP movel de 48 candles" (narrativa, checklist, sweep, overlay, tooltip — que alias estava orfao: chave 'VWAP' nunca casava com o rotulo 'VWAP 48c' da tabela) e `index.html` (checkbox). "VWAP 24h" do ticker Binance mantido (e VWAP real de 24h).
  - `lib/signal-sync-client.js`: semantica de MIGRACAO do codigo de sync documentada como decisao de produto (2026-07-17, escolha explicita do proprietario): inserir codigo ADOTA os registros locais no journal inserido, inclusive na corrida com sync em voo; `clear()` mantem a guarda oposta (`rollbackCurrentIdentity`).
  - Limpeza: `run.json` (blob de rate-limit do GitHub, nao rastreado) removido.
- Validacoes executadas:
  - `npm test`: **336/336**. `npm run test:coverage`: 336/336, **97,49% linhas / 82,03% branches / 96,87% funcoes**, exit 0. `node --check` limpo nos arquivos tocados.
  - `npm run test:boot`: **BOOT CHECK: OK** (8/8) ja com o regex apertado (0 erros de rede filtrados).
  - Navegador local com DADOS AO VIVO (`BTCUSDT $63,314`): aba Ativo renderiza narrativa por `ruleId` ("acima do VWAP movel de 48 candles"), checklist com scores casando (Multi-TF -7, Derivativos -5), tooltip 'VWAP 48c' agora anexado, snapshot com identidade completa e envelope rastreavel; zero erros de console.
- OCORRENCIA REGISTRADA — sincronizacao concorrente no meio da sessao:
  - Durante a aplicacao das correcoes o OneDrive sincronizou o lote CX-011..CX-014 (mtimes de 2026-07-16 ~23:30) vindo de outra maquina, sobrepondo a arvore. Verificacao marcador a marcador confirmou que TODAS as correcoes deste lote sobreviveram a uniao, com UMA excecao equivalente: o jitter que este lote havia adicionado ao `createSourceThrottle` do analytics-core foi substituido pela extracao do throttle para `lib/request-client.js` feita pelo Codex — que ja contem jitter identico (fator 0,25, random injetavel, Retry-After intacto) e e o throttle que o `app.js` usa. O duplicado legado no analytics-core segue sem jitter e sem uso pelo app.
  - Os gates verdes (336/336, cobertura, boot) foram executados sobre a UNIAO (correcoes CC-FIX-03 + lote CX-011..CX-014).
- Limitacoes:
  - CX-011..CX-014 permanecem **AGUARDANDO CLAUDE CODE**: este lote NAO os revisou; o gate verde da uniao nao equivale a aprovacao conceitual (protocolo do CLAUDE.md).
  - `npm run test:browser` (smoke autoritativo) nao foi executado neste lote.
  - Nada foi commitado ou publicado; a arvore local segue nao commitada, agora contendo CC-FIX-03 + CX-011..CX-014.

### REV-CC-02 — Revisao cruzada independente dos lotes CX-011..CX-014 (2026-07-17)

- Data: 2026-07-17
- Revisor: Claude Code (Fable 5)
- Base analisada: arvore de trabalho sobre `e25ec34` (uniao CX-011..CX-014 + CC-FIX-03); diff de 37 arquivos, +885/-196
- Metodologia: adversarial (objetivo refutar, nao confirmar). Leitura pessoal do cluster de concorrencia/persistencia (durable-signals + Lua do cap global, cross-tab-lock, signal-sync-client, api/signals); 3 revisores independentes (contrato de dados CX-012/013; plano CX-011; UI/a11y CX-014); gates reexecutados de forma independente; verificacao ao vivo no navegador em desktop e 390x844 com dados reais.
- Gates independentes: `npm test` 336/336; cobertura 97,49/82,03/96,87 exit 0; `node --check` limpo em todos os JS/CJS; pin do hash-ouro `4efe8ce2` VERDE com teste de sensibilidade (perturbar material muda o hash); boot-check OK.

Veredito por entrada (todas promovidas a REVISADO COM RESSALVAS; nada exige reversao — os defeitos sao de alegacao superestimada ou de guarda fraca, nao de regressao funcional):

**CX-011 (plano)** — solido-com-ressalvas. Respeita o contrato analitico (candle fechado, missing != zero, degradacao honesta). 10 questoes; principais: (1) risco geo 451 da Binance movido para Vercel sem mitigacao na Fase 4 (P0 do proprio plano); (2) taxonomia de estados do envelope (`ok/partial/...`) diverge da do contrato (`fresh/fresh_fallback/...`) sem mapeamento testado; (3) Fase 0 declarada bloqueante mas saiu com 2 itens abertos; (4) Fase 9 (seguranca/CI/limites) mal ordenada — e pre-requisito, nao capstone; (5) Fases 4-5 superdimensionadas (3-4 lotes em 1); (6) sem politica de retencao/custo para series novas; (7) licenca CoinGecko em producao nunca auditada pelo proprio criterio do plano. Fases 1, 3, 6, 7 e o metodo da 8 aprovaveis como estao.

**CX-012 (estabilizacao + contrato piloto)** — nucleo confirmado:
- CONFIRMADO (leitura pessoal): cap global 10k com desenho CORRETO — rejeicao fail-closed de registros NOVOS via sentinela atomica no Lua (`ZCARD` + sentinela de capacidade), sem remocao cruzada de dados de outros namespaces; atualizacoes de registros existentes seguem permitidas; indice mantido em merge/compact/clear; erro `DURABLE_CAPACITY` vira 503 com mensagem honesta; teste em Lua real cobre a recusa. Complementar ao INCOMPLETE_CAP por namespace do CC-FIX-03 (defesa em profundidade).
- CONFIRMADO: extracao do throttle para request-client preservou o pin `4efe8ce2` (teste comportamental, nao afirmacao) e ja incorpora jitter com random injetavel; sanitizacao central convergiu com publicErrorMessage do CC-FIX-03; compat legada das rotas intacta (todos os campos que o app le preservados).
- PARCIAL: fail-closed do lease entre abas — estrutura sadia (AbortSignal + assertHeld pos-tarefa impede commit apos perda; heartbeat com falha repetida escala para loseLease), MAS a perda por SUSPENSAO (aba congelada alem do lease de 120s; outra aba assume; a aba acorda e regrava o ticket) NAO e detectada. Dano contido pelo merge Lua idempotente.
- Observacoes menores: batch em pipeline pode persistir registros anteriores ao estouro de capacidade (idempotente no retry — aceitavel, documentar); caminho fallback sem eval nao aplica o cap (so testes).

**CX-013 (validadores/schema/bitemporal/health)** — plumbing solido, alegacoes de seguranca superestimadas:
- CONFIRMADO: health registry limitado (Map por datasetId validado, anel de 256 amostras), p50/p95 nearest-rank corretos, telemetria NAO entra no score; painel "Saude dos dados" honesto sobre migracao parcial (verificado ao vivo).
- REFUTADO como redigido: "falha fechada quando campo obrigatorio muda" — na pratica e FAIL-ANNOTATE: `status:'invalid'` + HTTP 200 com payload legado completo, e NENHUM consumidor condiciona score/elegibilidade ao envelope (app.js le `dataEnvelope` em exatamente 1 lugar, o pill do painel). Upstream corrompido continua sendo pontuado com um selo "Invalido" ao lado.
- REFUTADO: SLA de frescor — `expiresAt = retrievedAt + maxAge` torna a checagem tautologica na criacao; nada compara idade da OBSERVACAO ao `maxAgeMs`; macro com `availableAt:null` infere latencia 0 para sempre.
- PARCIAL: schema por caminho de topo e tipo grosseiro (drift aninhado invisivel; `treasury.y10` virando string passa); `observedShapeHash` calculado e nunca comparado, e instavel por dependencia dos dados; bitemporal: ordenacao de vintage validada de verdade, `decisionEligibleAt` e alias cosmetico de `availableAt`.
- Defeitos: `envelope.errors` cresce sem dedupe/cap a cada refresh falho (corpo incha em outage longa); `payloadHash` nao e recalculado quando o payload servido muta (stale marking) — hash de integridade que nao bate com o corpo servido; validators de series sao codigo morto (nenhuma rota usa).

**CX-014 (navegacao mobile + selo)** — comportamento confirmado, redacao e guardas fracas:
- CONFIRMADO AO VIVO (390x844): seletor compacto visivel e rotulado, 8 abas ocultas e fora da ordem de tabulacao, sem overflow, Geral zera `aria-pressed`, area restaurada ao reabrir; sync mobile-desktop sem rebind duplicado; `MODEL_VERSION` segue fluindo para snapshots/journal (analitica intocada).
- REFUTADO como redigido: "selo unico de versao" — apenas o LITERAL 'preview' foi deduplicado; a versao renderiza em 5 superficies (updatedAt, status bar, tooltip dos cards, status de sinais, relatorio); o teste conta o literal no fonte e nao pegaria regressao.
- Guardas fracas: testes novos sao regex de codigo-fonte — reverter o sync passa verde; carve-out: abrir Ativo clicando num card reseta a area para 'summary' (contradiz "restaura estado"); a11y: aria-label do seletor ("Area da analise do ativo") nao contem o rotulo visivel ("Area do ativo") — WCAG 2.5.3.

#### Correcoes exigidas (A-L, por prioridade)

| # | Lote | Pri | Correcao |
| --- | --- | --- | --- |
| A | CX-012/013 | P1 | Fail-closed REAL: consumidores/rotas devem condicionar elegibilidade de decisao ao `envelope.status` (ou reescrever a alegacao para "fail-annotate" ate la) |
| B | CX-013 | P1 | Enforcar `maxAgeMs` contra a idade da OBSERVACAO; macro nao pode inferir latencia 0 com `availableAt:null` |
| C | CX-013 | P2 | Schema aninhado (tipos de itens de array/campos internos); comparar `observedShapeHash` com baseline ou remover a alegacao de drift |
| D | CX-013 | P2 | Cap/dedupe de `envelope.errors` por codigo |
| E | CX-013 | P2 | Recalcular `payloadHash` quando o corpo servido muta, ou documentar o escopo do hash |
| F | CX-012 | P2 | Lease: detectar perda por suspensao/expiracao (verificar posse/expiry ao acordar o heartbeat), nao so falha de escrita |
| G | CX-012 | P3 | `due()`: remover membros orfaos tambem do `RECORD_INDEX_KEY` (hoje contam contra o teto ate a poda de 400d) |
| H | CX-013 | P3 | Ligar `data-validators` as rotas ou declara-los explicitamente pendentes (hoje codigo morto) |
| I | CX-014 | P2 | Redacao honesta do selo OU remover a versao das 5 superficies; teste deve contar renderizacoes, nao o literal 'preview' |
| J | CX-014 | P2 | Teste jsdom real do ciclo setView/setAssetTab (aria-pressed/tabIndex/select.value) — regex de fonte nao pega revert |
| K | CX-014 | P3 | Label-in-Name: aria-label do seletor deve conter o rotulo visivel |
| L | CX-011 | P2 | Emendas ao plano: mitigacao do 451 na Fase 4 + split da fase; mapeamento testado das duas taxonomias de estado; puxar seguranca/CI/limites da Fase 9 para frente; fechar os 2 itens abertos da Fase 0; auditar licenca CoinGecko |

Conclusao: nenhuma reversao exigida; a uniao esta apta a COMMIT como esta (gates verdes, sem regressao funcional identificada), com as correcoes A-L registradas como divida obrigatoria ANTES de (i) confiar no contrato de dados para decisoes e (ii) declarar as alegacoes de fail-closed/SLA/selo como entregues. Prioridade sugerida: A e B antes de migrar qualquer rota adicional ao contrato.

### CC-FIX-04 — Aplicacao integral das correcoes A-L da REV-CC-02 (2026-07-17)

- Data: 2026-07-17
- Responsavel: Claude Code (Fable 5), por instrucao explicita do proprietario ("aplique as correcoes A-L agora, comecando pelas P1")
- Base: arvore de trabalho pos REV-CC-02 (uniao CC-FIX-03 + CX-011..CX-014)
- Correcoes aplicadas (todas com teste de regressao):
  - **A (P1)** app.js: envelope `invalid` (drift de schema/ordem temporal) torna o dataset INELEGIVEL para score em market e macro — o "fail-closed" passou de selo decorativo a gate real. Mapeamento normativo envelope->contrato registrado na emenda 2 do plano.
  - **B (P1)** data-contract: SLA de frescor aplicado contra a idade da OBSERVACAO (`observation-age-above-sla`, ok/partial -> stale); `availableAt` inferido produz latencia NULA (desconhecida), nao zero — o macro perdeu o credito permanente de SLA. Fixtures de teste de market/macro atualizadas para datas/chaves realistas (a regra nova os pegou — funcionando como esperado).
  - **C (P2)** data-contract: schema aninhado com caminhos `[]` (amostra de 50 itens) — `markets[].id/current_price/market_cap`, `treasury.y10/y2`, `vix.close`; pai anulavel legitimamente nulo PULA a validacao dos filhos (a nulabilidade do pai e contrato do topo — sem isso, treasury:null legitimo viraria invalid e o gate A derrubaria o dataset). `observedShapeHash` permanece informacional (drift e responsabilidade do schema declarado).
  - **D (P2)** data-contract: `envelope.errors` deduplicado por codigo e limitado a 8 (criacao e markEnvelopeStatus) — outage longa nao incha mais o corpo da resposta.
  - **E (P2)** data-contract + api/market: `markEnvelopeStatus` aceita o corpo mutado e recalcula `payloadHash` sobre ele (sem payload novo, hash permanece estavel — comportamento antigo preservado para quem nao muta).
  - **F (P2)** cross-tab-lock: perda de lease por SUSPENSAO detectada — o heartbeat verifica tempo desde o ultimo batimento (> leaseMs -> `storage-lock-suspended`) e a POSSE real do ticket (`storage-lock-ticket-lost`) antes de renovar; espera de aquisicao tambem aborta em lease perdido. Fecha o gap em que a aba acordava, regravava o ticket e seguia sem exclusividade.
  - **G (P3)** durable-signals: `due()` remove membros orfaos tambem do `RECORD_INDEX_KEY` — entrada fantasma nao consome mais o teto global de 10k ate a poda de 400 dias.
  - **H (P3)** data-validators: cabecalho normativo declarando que os validadores NAO estao ligados a nenhuma rota (integracao = Fase 1 do plano); garantias nao podem ser citadas como ativas.
  - **I (P2)** features.test: alem do literal unico 'preview', o total de usos de `MODEL_VERSION` fica PINADO (26) com as superficies de renderizacao documentadas — nova superficie exige decisao consciente no teste, nao passa em silencio.
  - **J (P2)** browser-boot-check: ciclo REAL de navegacao no Chromium (selecionar area via seletor mobile -> aria-pressed sincronizado -> Geral zera pressed e tabulacao -> reabrir restaura a area) virou gate do boot-check — regex de fonte nao pega revert, o navegador pega.
  - **K (P3)** index.html: `aria-label` divergente removido do seletor; o nome acessivel vem do `<label>` visivel "Area do ativo" (WCAG 2.5.3 Label-in-Name); teste atualizado para garantir a estrutura e proibir aria-label sobreposto.
  - **L (P2)** SYSTEM_EVOLUTION_PLAN: bloco "EMENDAS REV-CC-02" vinculante — mitigacao do 451 + split da Fase 4 (4a/4b), mapeamento normativo das taxonomias de estado, itens de seguranca/CI da Fase 9 antecipados como pre-requisito por fase, Fase 0 fechada (resta so o smoke), auditoria de licenca CoinGecko/CoinPaprika, politica de retencao/custo antes da Fase 3. Revisao conceitual do plano promovida a REVISADO COM RESSALVAS.
- Gates executados apos as correcoes:
  - `npm run test:coverage`: **345/345** (9 testes de regressao novos: 6 data-contract, 2 cross-tab-lock, 1 due/indice); cobertura **97,53% linhas / 82,29% branches / 97,02% funcoes**; exit 0.
  - `npm run test:boot`: **BOOT CHECK: OK** — inclui os 3 novos checks comportamentais de navegacao e, nesta execucao, dados ao vivo (snapshot com identidade completa + envelope rastreavel).
  - `node --check` limpo nos arquivos tocados; varredura marcador-a-marcador confirmou todas as correcoes A-L e o CC-FIX-03 presentes na arvore (OneDrive segue sincronizando; a uniao permanece integra).
- Estado: as ressalvas da REV-CC-02 estao FECHADAS. Divida remanescente da arvore: apenas `npm run test:browser` (smoke autoritativo) antes de commit/release, e as pendencias de infra ja conhecidas (clone fora do OneDrive, CI hospedado).
- Nada foi commitado ou publicado.
