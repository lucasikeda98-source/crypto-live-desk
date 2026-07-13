# Registro de transicao Codex -> Claude Code

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
