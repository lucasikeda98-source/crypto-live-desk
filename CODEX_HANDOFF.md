# Registro de transicao Codex -> Claude Code

> **Proxima sessao:** o plano de continuidade (itens em aberto + recomendacoes) esta em
> `HANDOFF_PROXIMA_SESSAO.md`. As revisoes do Claude Code estao ao final deste arquivo
> (RC-001 a RC-007).

## Objetivo

Este arquivo evidencia as mudancas realizadas pelo Codex a partir do marco abaixo. Todas essas mudancas devem ser revisadas pelo Claude Code quando o acesso estiver disponivel novamente, antes de serem consideradas alinhadas definitivamente com a linha de raciocinio anterior do projeto.

Revisao pelo Claude Code significa revisao independente de codigo, regras analiticas, testes, documentacao e impactos no modelo. A aprovacao nao deve ser presumida apenas porque os testes passaram.

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
