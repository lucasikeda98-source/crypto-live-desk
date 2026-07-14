# Ledger vivo da auditoria

Estado geral: **CORRECOES DA REV-CC-01 APLICADAS (CC-FIX-01, 2026-07-13)** — ver `CODEX_HANDOFF.md` CC-FIX-01. Os 8 defeitos da secao A foram corrigidos com testes de regressao reais (incluindo execucao dos scripts Lua de producao em VM Lua) e os guardas fracos da secao B viraram testes de comportamento; suite 303/303, cobertura 97,95/81,46/96,54. Permanecem abertos: os 7 `CONFIRMADO` de infra, ANL-015 e OPS-010 (sem revisao), derivacao dos clamps de app.js e o teste de pipeline de features (documentados em CC-FIX-01). **Fase C (2026-07-13): ANL-015 e OPS-010 promovidos a REVISADO PELO CLAUDE CODE (ver CC-FIX-02 no CODEX_HANDOFF.md); clamps do app.js derivam do ruleset; pipeline gated no browser-boot bloqueante; batch por simbolo na avaliacao de sinais.**

Este arquivo e o indice operacional dos achados. Detalhes, provas e decisoes devem permanecer rastreaveis mesmo quando a implementacao mudar. Nenhuma linha e removida para esconder historico; achados invalidados recebem justificativa.

## Checkpoint atual

- Branch: `codex/cycle-d-sources`
- Baseline inicial desta rodada: `b124fcb`
- Checkpoint commitado: `887ec57` (pushado para `origin/codex/cycle-d-sources` em 2026-07-13; nao deployado)
- Producao conhecida: responde, mas ainda expoe contrato anterior (CORS `*`, options/institutional sem os campos novos); nao equivale ao working tree Codex
- Preview remoto conhecido: deployment `dpl_Hc3z4X4RJWd85y5adooo7oji749E`, commit `b124fcb`, `READY`, target nao-producao
- Suite baseline: 98 testes deterministas aprovados na auditoria anterior
- Checkpoint Codex atual: 215 testes (contagem Codex). Reexecucao independente do Claude Code: 250/250 testes, cobertura 97,96/80,03/96,42 (exit 0), `node --check` e `git diff --check` limpos, navegador local com 24 cards e zero erro de console
- Universo: consultar `AUDIT_INVENTORY.json`
- Inventario final desta entrada: 59 arquivos, 16.762 linhas e 983.002 bytes auditaveis
- Protocolo: consultar `AUDIT_LOOP.md`

## Resumo por estado

| Estado | Quantidade no checkpoint |
| --- | ---: |
| REVISADO PELO CLAUDE CODE | 41 |
| AGUARDANDO CLAUDE CODE | 24 |
| CONFIRMADO | 7 |
| SUSPEITA | 0 |
| CORRIGIDO | 0 |
| VALIDADO | 0 |
| REAUDITADO | 0 |

`AGUARDANDO CLAUDE CODE` significa que o achado foi corrigido, validado e reauditado pelo Codex, mas ainda nao recebeu a revisao independente exigida. `CONFIRMADO` significa divida ainda aberta ou fechamento apenas parcial. `REVISADO PELO CLAUDE CODE` significa que a revisao cruzada independente confirmou implementacao correta E regressao adequada. As quantidades devem ser reconciliadas sempre que uma linha mudar de estado.

## Revisao cruzada Claude Code — 2026-07-13 (REV-CC-01)

A disposicao autoritativa por achado esta em `CODEX_HANDOFF.md` REV-CC-01. Resumo:

- **Defeitos/regressoes reais (corrigir antes de promover):** ANL-027 (P1, merge Lua de producao nunca executado e com resolucao oposta ao teste), OPS-003 (P1, smoke bloqueante + limitacao 451 apagada), OPS-009 (P2, `package-lock.json` untracked quebra o CI), UX-001 (P2, painel de cobertura falso-verde, byte-identico ao base), UX-005 (P3, timezone so em 1 timestamp), `priceChangeOverWindow` (P3, `Infinity`), DEV-dotfile-via-symlink (P3, novo), API-004 (P2, `Math.max`/proveniencia parcial).
- **`AGUARDANDO CLAUDE CODE` (24) — implementacao correta mas guarda fraco/ausente ou nao revisado:** ANL-001, ANL-005, ANL-008, ANL-009, ANL-010, ANL-015, ANL-017, ANL-018, ANL-024, ANL-027; API-004; OPS-001, OPS-002, OPS-003, OPS-007, OPS-009, OPS-010, OPS-014; UX-001, UX-003, UX-004, UX-005, UX-007; SEC-001.
- **`REVISADO PELO CLAUDE CODE` (41):** os demais achados das secoes de integridade, numerico/metodologia, APIs, persistencia/seguranca e UX, conforme secao C de REV-CC-01. Ressalva transversal: fechamentos que dependem de Lua/Redis reais permanecem nao comprovados contra Redis real (scripts Lua nunca executaram em teste).
- **`CONFIRMADO` (7) reconfirmados abertos:** ANL-003, API-006, OPS-005, OPS-006, OPS-011, OPS-012, OPS-013.
- Verificacoes objetivas independentes: 250/250 testes, cobertura 97,96/80,03/96,42 (exit 0), `node --check` e `git diff --check` limpos, navegador local com 24 cards e zero erro de console.

## Integridade analitica e persistencia

| ID | Sev. | Esforco | Estado | Achado | Fechamento minimo |
| --- | --- | --- | --- | --- | --- |
| ANL-001 | P0 | M | AGUARDANDO CLAUDE CODE | `inputSnapshotId` exclui book e liquidacoes que alteram o Setup Score. | Snapshot canonico completo + teste de identidade/diferenca. |
| ANL-002 | P0 | L | AGUARDANDO CLAUDE CODE | Export schema 3 inclui envelope imutavel schema 1 com 12 grupos de entradas normalizadas, series spot/MTF/derivativos/historico, fontes, tempos, manifesto e hashes por dataset/envelope. Round-trip e adulteracao sao testados; export real de BTC/5m foi reaberto e verificado (`valid=true`, 3.524.193 bytes). | Envelope imutavel com entradas brutas ou referencias duraveis + round-trip test. |
| ANL-003 | P0 | XL | CONFIRMADO | Backend Redis, retencao por horizonte, conciliacao privada e worker independente da aba foram implementados e testados com storage falso. A Vercel ainda nao possui Redis/segredo provisionados; nao existe round-trip real entre dispositivos nem prova de retencao em producao. | Provisionar storage/segredo, testar dois dispositivos, retencao/TTL e worker real. |
| ANL-004 | P0 | M | AGUARDANDO CLAUDE CODE | `purgeStaleStorage` apaga evidencia de versoes anteriores. | Migracao/arquivo; limpeza apenas explicita e testada. |
| ANL-005 | P0 | M | AGUARDANDO CLAUDE CODE | Caps runtime somam 112, mas Data Confidence e contrato ainda usam 116. | Uma definicao normativa compartilhada + testes/documentos reconciliados. |
| ANL-006 | P0 | L | AGUARDANDO CLAUDE CODE | Runtime autoriza short, enquanto contrato atual limita score negativo a evitar compra. | Reverter ou versionar contrato/modelo e validar shorts. |
| ANL-007 | P1 | M | AGUARDANDO CLAUDE CODE | Outcome de 1h usa candle de 1h e pode medir quase 1h55m. | Granularidade/cutoff exato + teste de fronteira temporal. |
| ANL-008 | P1 | M | AGUARDANDO CLAUDE CODE | Simulacao de stop omite `open` e usa `close` para gap. | Convencao OHLC completa + cenarios gap/toque/stop+alvo. |
| ANL-009 | P1 | S | AGUARDANDO CLAUDE CODE | Idempotencia por candle e diferente quando DC < 40. | Cutoff unico e tombstone coerente em todos os caminhos. |
| ANL-010 | P1 | L | AGUARDANDO CLAUDE CODE | Primeiro refresh do candle vira registro final mesmo se fontes chegarem depois. | Estado provisional/final ou snapshot coordenado por deadline. |
| ANL-011 | P2 | S | AGUARDANDO CLAUDE CODE | Em 1s, janela de OI de 5m nao coincide com janela de preco disponivel. | Janelas iguais ou leitura indisponivel, com teste. |
| ANL-012 | P2 | M | AGUARDANDO CLAUDE CODE | Registro `SOURCE_REGISTRY` versionado cobre 22 fontes live, historicas e manuais com metricas, unidade, validador, escopo, horario, TTL, primario/fallback, fator de proveniencia, cache, indisponibilidade e elegibilidade; integra o `rulesetHash`, o export e a explicacao da UI. | Registro versionado integral + testes de degradacao de cada fonte. |
| ANL-013 | P1 | M | AGUARDANDO CLAUDE CODE | `Number(null)`/string vazia podem virar zero em CFTC, mercado, VIX e series. | Conversor estrito unico + matriz de campos/casos. |
| ANL-014 | P2 | M | AGUARDANDO CLAUDE CODE | COIN/MSTR no macro criam proxy circular de cripto. | Separar risk assets independentes de crypto-beta. |
| ANL-015 | P2 | S | AGUARDANDO CLAUDE CODE | API e cliente classificam cada linha com flag `reported` explicita ou calendario completo de sessoes/feriados dos EUA; o normalizador atravessa envelopes MCP aninhados reais, preserva zero legitimo e exclui placeholders. API real e navegador confirmaram 10/07 como ultima sessao e 11-12/07 como fechamento. | Flag `reported`, calendario de sessao e fixtures de feriado/zero legitimo. |
| ANL-016 | P2 | S | AGUARDANDO CLAUDE CODE | Override manual so altera o score depois de autor e motivo obrigatorios; modo, instante, autor, motivo e fonte manual entram no snapshot, hash de entrada, explicacao e export. Validacao, aplicacao, retorno a auto e layout mobile foram exercitados no navegador. | Autor, motivo, proveniencia explicita e exclusao inequívoca de fonte automatica. |
| ANL-017 | P1 | M | AGUARDANDO CLAUDE CODE | `normalizeKlines` aceita OHLC impossivel, volume/taker negativo, `takerBuy > volume`, timestamps invertidos e linhas duplicadas/fora de ordem. | Validador de invariantes + politica de rejeicao/dedupe/ordenacao + testes adversariais. |
| ANL-018 | P0 | M | AGUARDANDO CLAUDE CODE | `rulesetHash()` cobre apenas o objeto declarativo `RULESET`; mudancas nas funcoes de score podem manter o mesmo hash e invalidar a rastreabilidade. | Artefato canonico que inclua implementacao/manifesto completo + teste que detecte mudanca sem bump. |
| ANL-019 | P1 | XS | AGUARDANDO CLAUDE CODE | `INTERVAL_MS` omite `1s`; o veto de 6 barras usa fallback de 5m e dura cerca de 30 minutos em vez de 6 segundos. | Adicionar 1s e testar duracao em todos os intervalos aceitos. |
| ANL-020 | P1 | S | AGUARDANDO CLAUDE CODE | O veto pos-trap e armazenado em um unico `state.trapVeto`; um trap de outro par/TF sobrescreve o anterior apesar do comentario prometer chave por par+TF. | Mapa por `symbol:interval`, expiracao independente e teste intercalado. |
| ANL-021 | P2 | S | AGUARDANDO CLAUDE CODE | Resumo do journal tem tres faixas long e uma unica faixa short (`<= -20`); a regra de acerto neutra `abs(r24h) < 1.5` nao e versionada/documentada. | Bandas simetricas e metrica de acerto no contrato/ruleset, com testes. |
| ANL-022 | P2 | M | AGUARDANDO CLAUDE CODE | Estado persistido da maquina de sinais e aceito sem validacao de schema; valores parciais/corrompidos podem quebrar gestao, idempotencia e UI. | Schema/migracao/tombstone seguro + corpus de localStorage corrompido. |
| ANL-023 | P2 | M | AGUARDANDO CLAUDE CODE | `findFairValueGap` retorna o ultimo gap criado, mesmo quando candles posteriores ja preencheram/mitigaram toda a faixa. | Estado de gap aberto/mitigado e teste temporal causal. |
| ANL-024 | P2 | S | AGUARDANDO CLAUDE CODE | Narrativas da UI convertem indicador ausente em leitura direcional (por exemplo NaN de VWAP/MACD vira abaixo/negativo) e livro ausente em equilibrio 50/50. | Estado `indisponivel` explicito em cada narrativa + browser states. |
| ANL-025 | P2 | S | AGUARDANDO CLAUDE CODE | Volatilidade realizada filtra retornos invalidos e pode anualizar amostra menor que o periodo solicitado sem declarar cobertura. | Exigir janela valida/exata ou propagar cobertura e indisponibilidade. |
| ANL-026 | P1 | S | AGUARDANDO CLAUDE CODE | No primeiro sync do mesmo candle/modelo, o cliente podia manter o snapshot local divergente em vez de adotar a revisao canonica ja persistida no servidor. O merge agora faz o remoto vencer no primeiro round-trip e possui regressao. | Canonicalidade remota deterministica por candle/modelo + teste de snapshot divergente. |
| ANL-027 | P0 | M | AGUARDANDO CLAUDE CODE | Um POST atrasado de cliente podia sobrescrever no Redis um outcome que o worker acabara de preencher. Merge, persistencia e reagendamento agora executam em Lua atomica; o fallback em memoria e uma corrida simulada cobrem a regra. | Provar o mesmo EVAL contra Redis real e confirmar que outcome nunca regride. |

## APIs, fontes e metodologia cross-venue

| ID | Sev. | Esforco | Estado | Achado | Fechamento minimo |
| --- | --- | --- | --- | --- | --- |
| API-001 | P1 | S | AGUARDANDO CLAUDE CODE | Binance usa midpoint; outros venues usam last na mesma comparacao. | Midpoint consistente; fallback last rotulado. |
| API-002 | P2 | S | AGUARDANDO CLAUDE CODE | Erros semanticos HTTP 200 da Bybit/OKX podem virar venue vazio sem erro. | Validar `retCode`/`code` + testes. |
| API-003 | P2 | S | AGUARDANDO CLAUDE CODE | Coinbase USD e comparada a pares USDT sem separar stablecoin basis. | Rotulo/unidade e decomposicao do basis. |
| API-004 | P2 | M | AGUARDANDO CLAUDE CODE | Snapshot de venues nao limita skew temporal e usa o maior timestamp no conjunto. | `observedAt` por venue + max skew/staleness. |
| API-005 | P2 | S | AGUARDANDO CLAUDE CODE | Falha de markets pode descartar global/trending validos no fallback. | Resposta parcial tipada e renderizacao degradada. |
| API-006 | P2 | M | CONFIRMADO | O helper usa sliding window Upstash quando Redis existe, publica o escopo e possui teste de duas instancias/falha Redis. Sem credenciais na Vercel, o runtime continua declarando `instance`; distribuicao real entre regioes ainda nao foi provada. | Provisionar Redis e comprovar `distributed` em duas instancias/regioes. |
| API-007 | P3 | XS | AGUARDANDO CLAUDE CODE | Headers CORS/cache variam por caminho: cache hit/503 de `/api/market` e erros de microestrutura saem sem os mesmos headers do sucesso. | Helper unico de resposta e testes para sucesso/cache/erro/405/400. |
| API-008 | P2 | S | AGUARDANDO CLAUDE CODE | `/api/options` degrada DVOL e books ATM para `null` sem expor erros parciais; o cliente nao distingue ausencia legitima de falha upstream. | `dataStatus`/`errors` por subfonte e testes de falha parcial. |
| API-009 | P2 | S | AGUARDANDO CLAUDE CODE | `/api/macro` consulta Treasury apenas no ano UTC atual; no inicio do ano pode perder a ultima curva valida do ano anterior. | Fallback/merge do ano anterior e teste de virada de ano. |
| API-010 | P2 | M | AGUARDANDO CLAUDE CODE | Parser SSE do MCP de ETF usa somente a primeira linha `data:`; eventos fragmentados/multilinha podem falhar ou escolher envelope incompleto. | Parser SSE/JSON-RPC robusto + fixtures multiline/multievento. |
| API-011 | P3 | XS | AGUARDANDO CLAUDE CODE | Moeda invalida em `/api/options` cai silenciosamente para BTC, produzindo dado valido para uma entrada invalida. | Responder 400 com allowlist explicita e teste. |
| API-012 | P3 | XS | AGUARDANDO CLAUDE CODE | A sondagem `GET /api/signals` devolvia 503 quando Redis nao existia; o browser registrava erro de recurso a cada boot. GET agora responde capacidade honesta `configured=false`/200 sem gravar, enquanto POST/DELETE continuam 503 e falham fechados. | Capability probe sem erro de console + mutacoes indisponiveis sem storage. |
| API-013 | P1 | S | AGUARDANDO CLAUDE CODE | O limite de payload de `/api/signals` cobria o stream bruto, mas podia ser contornado quando a plataforma entregava JSON ja interpretado. Objetos, strings e buffers agora passam pelo mesmo teto; ciclos viram 400 e excesso vira 413. | Limite uniforme antes/depois do parse + matriz objeto/string/buffer/stream/ciclo. |
| API-014 | P2 | S | AGUARDANDO CLAUDE CODE | O limiter distribuido ficava cacheado apenas pelo limite numerico; rotacao de credencial/cliente Redis no mesmo processo podia manter a instancia antiga. O cache agora e ligado a identidade real do cliente. | Rotacao de cliente/credencial sem restart + teste de duas instancias reais. |
| API-015 | P1 | S | AGUARDANDO CLAUDE CODE | HTTP 200 malformado do backend de sinais podia ser anunciado ao usuario como persistencia/limpeza concluida. O cliente agora valida estritamente o contrato configurado antes de confirmar sucesso. | Validacao de schema em todas as respostas de sync e regressao de 200 malformado. |

## Operacao, desempenho, CI e arquitetura

| ID | Sev. | Esforco | Estado | Achado | Fechamento minimo |
| --- | --- | --- | --- | --- | --- |
| OPS-001 | P1 | L | AGUARDANDO CLAUDE CODE | Warmup diario de 24 ativos pode gerar ate 288 chamadas por versao/usuario. | Cache compartilhado/sob demanda, backoff e teste de volume. |
| OPS-002 | P1 | M | AGUARDANDO CLAUDE CODE | Rotas com duas etapas de 18s podem ultrapassar `maxDuration` de 30s. | Deadline absoluto unico e teste com upstream lento. |
| OPS-003 | P1 | M | AGUARDANDO CLAUDE CODE | Browser smoke e nao bloqueante no CI e `app.js` nao entra na cobertura unitaria. | Gate confiavel ou smoke deterministico + cobertura de integracao. |
| OPS-004 | P2 | L | AGUARDANDO CLAUDE CODE | Rede/orcamento foram extraidos para `lib/request-client.js` e sincronizacao/persistencia para `lib/signal-sync-client.js`; calculos ja permanecem no core e UI/estado no app. Dez testes de fronteira cobrem prioridade, fallback, cooldown, batching, identidade e falha remota. | Extracao incremental com testes antes/depois. |
| OPS-005 | P2 | M | CONFIRMADO | Worker/backend eliminam a dependencia conceitual de aba para outcomes, mas sem Redis e cron secret provisionados a operacao real continua somente local. A UI declara a degradacao sem apagar o journal. | Ativar Redis/cron e comprovar execucao independente da aba em preview/producao. |
| OPS-006 | P3 | M | CONFIRMADO | O Git atual usa `.git` normal, mas o working tree sujo continua no OneDrive. O runbook e o plano de clone limpo foram criados; a relocacao fisica depende de commit/push e autorizacao do proprietario. | Clone fora do OneDrive e gate completo no destino. |
| OPS-007 | P1 | S | AGUARDANDO CLAUDE CODE | Quando todas as fontes externas falham, `externalFetchedAt` nao avanca; o refresh de 3s pode reabrir imediatamente o lote de 11 chamadas apos cada conclusao. | Registrar tentativa/backoff separado de sucesso + teste de outage prolongado. |
| OPS-008 | P1 | L | AGUARDANDO CLAUDE CODE | Todas as chamadas do cliente passam por um budget unico com concorrencia, janela global, fatia por fonte, prioridade e limite de fila; testes cobrem concorrencia, ordem, overflow e janelas moveis deterministicas. O limite distribuido entre instancias Vercel permanece separado em API-006. | Orquestrador/cache compartilhado, budget por fonte e teste de fan-out/rate limit. |
| OPS-009 | P1 | XS | AGUARDANDO CLAUDE CODE | Depois da adicao de dependencias, os dois jobs do CI ainda chamavam testes sem `npm ci`; runners limpos falhariam antes da suite. Ambos agora instalam o lockfile, usam cache npm e `node_modules` ficou ignorado. | Instalar dependencias travadas em todos os runners e validar instalacao limpa. |
| OPS-010 | P2 | XS | AGUARDANDO CLAUDE CODE | O smoke tentava mudar o modo manual sem autor/motivo e passou a acusar falsa falha de identidade depois do hardening do override. O fluxo automatizado agora preenche e submete a trilha exigida. | Smoke deve exercer o mesmo contrato de override da UI. |
| OPS-011 | P1 | M | CONFIRMADO | Producao respondeu 200, mas ainda usa contrato anterior: CORS `*`, shapes antigos de options/institutional e nenhuma mudanca do working tree atual. O deployment `READY` inspecionado e preview de `b124fcb`, nao a arvore local. | Commit/push deliberado, preview do commit candidato, diff de contrato e promocao autorizada. |
| OPS-012 | P1 | L | CONFIRMADO | O worker fazia fan-out por registro e uma execucao de 100 itens nao cobria nem um cliente 5m continuo (288/dia). Janelas compartilhadas, pipeline Redis, ate 3 lotes/300 itens e budget de 24s fecham esse caso unitario; dois clientes 5m, timeframes curtos ou atraso acumulado ainda excedem o cron diario Hobby. | Provisionar execucao mais frequente/fila duravel, medir backlog real e provar drenagem sob carga multiusuario. |
| OPS-013 | P3 | S | CONFIRMADO | A observabilidade remota registrou 26 warnings `DEP0169 url.parse()` em `/api/options` e `/api/institutional` num deployment anterior. O warning nao foi reproduzido localmente e os logs detalhados expiraram; a causa permanece sem fechamento. | Reproduzir em preview candidato com trace/logs retidos ou demonstrar dependencia/plataforma corrigida. |
| OPS-014 | P1 | XS | AGUARDANDO CLAUDE CODE | O CI executava testes sem piso minimo de cobertura e sem auditoria de dependencias, permitindo regressao silenciosa. O workflow agora bloqueia abaixo de 95% linhas, 75% branches e 90% funcoes e roda `npm audit --audit-level=low`. | Executar o workflow remoto no commit candidato e manter os pisos deliberadamente versionados. |

## UX, mobile e acessibilidade

| ID | Sev. | Esforco | Estado | Achado | Fechamento minimo |
| --- | --- | --- | --- | --- | --- |
| UX-001 | P2 | S | AGUARDANDO CLAUDE CODE | Cobertura diz fonte conectada/completa quando ETF, options ou parte de derivativos falha. | Status por metrica real + browser states de falha. |
| UX-002 | P2 | XS | AGUARDANDO CLAUDE CODE | Journal mostra `--` mas “0 aguardando” por contar apenas horizonte vencido. | Separar aguardando horizonte de pronto para avaliar. |
| UX-003 | P2 | S | AGUARDANDO CLAUDE CODE | Seis rotulos completos do eixo se sobrepoem em canvas mobile estreito. | Densidade/formato adaptativos + screenshot 320/390 px. |
| UX-004 | P2 | M | AGUARDANDO CLAUDE CODE | 22 controles visiveis ficam abaixo de 44 px; foco visivel e inconsistente. | Alvos adequados, `:focus-visible` e navegacao por teclado. |
| UX-005 | P3 | S | AGUARDANDO CLAUDE CODE | Datas/horas nao informam timezone. | Timezone visivel/configuravel e testes de virada de dia. |
| UX-006 | P3 | XS | AGUARDANDO CLAUDE CODE | Tabelas internas exigem scroll horizontal sem pista clara. | Affordance de scroll e verificacao mobile. |
| UX-007 | P2 | S | AGUARDANDO CLAUDE CODE | MTF parcial pode exibir bias/alinhamento forte sem destacar no mesmo campo quantos timeframes canonicos faltam. | Cobertura junto ao valor, estado degradado e screenshots com 1d/1w/linhas ausentes. |
| UX-008 | P1 | S | AGUARDANDO CLAUDE CODE | Quando `localStorage` estava bloqueado ou cheio, codigo privado e journal podiam desaparecer durante a propria sessao. Existe agora fallback volatil e mensagem explicita de que o dado precisa ser copiado e nao sobrevive a reload. | Teste real com quota/bloqueio no navegador e revisao da linguagem de risco. |

## Seguranca e documentacao

| ID | Sev. | Esforco | Estado | Achado | Fechamento minimo |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | P2 | M | AGUARDANDO CLAUDE CODE | Producao nao envia CSP, nosniff, protecao de frame, Referrer e Permissions Policy. | Headers em preview + teste de todas as fontes/WebSockets. |
| SEC-002 | P1 | M | AGUARDANDO CLAUDE CODE | Trocar o codigo privado enquanto um GET de sincronizacao estava em voo podia conciliar dados da identidade antiga e publica-los na nova. A transacao agora fixa namespace/geracao, invalida a antiga e possui regressao que prova ausencia de POST/vazamento cruzado. | Isolamento de identidade sob troca concorrente e teste adversarial. |
| SEC-003 | P0 | M | AGUARDANDO CLAUDE CODE | Limpar o journal enquanto POST/GET estavam em voo podia restaurar dados antigos; registros criados durante a limpeza tambem podiam iniciar antes do DELETE. A limpeza agora serializa, reasserta o delete e so libera o novo journal depois do sucesso. | Concorrencia clear/sync/novo registro com ordenacao deterministica e falhas de rede. |
| SEC-004 | P2 | S | AGUARDANDO CLAUDE CODE | A politica same-origin aceitava host igual mesmo quando `x-forwarded-proto` indicava esquema diferente e priorizava `x-forwarded-for` mutavel pelo proxy intermediario. Agora exige protocolo igual e prefere `x-vercel-forwarded-for`. | Matriz host/protocolo/proxy no preview e revisao dos headers efetivos da plataforma. |
| SEC-005 | P1 | S | AGUARDANDO CLAUDE CODE | Entregas duplicadas ou sobrepostas do cron podiam processar o mesmo backlog em paralelo. Um lease Redis `SET NX PX` de 35s agora bloqueia overlap e o merge continua idempotente. | Prova remota de duas invocacoes concorrentes, expiracao e recuperacao apos crash. |
| DOC-001 | P0 | M | AGUARDANDO CLAUDE CODE | Contrato esta desatualizado em caps, denominador e semantica de short. | Documento normativo versionado e testes de contrato. |
| DOC-002 | P1 | S | AGUARDANDO CLAUDE CODE | README promete base walk-forward de meses que o journal atual nao sustenta. | Corrigir claim ou entregar persistencia/retencao. |
| DOC-003 | P2 | S | AGUARDANDO CLAUDE CODE | `SYSTEM_AUDIT_2026-07-12.md` declara areas aprovadas e 21/21 fontes online, contradizendo falhas posteriores confirmadas. | Marcar documento como snapshot historico/superseded e apontar para este ledger. |

## Pontos positivos que tambem devem ser revalidados

- 215 testes deterministas passam no checkpoint Codex atual (98 no baseline anterior).
- Cobertura dos modulos Node: 98,76% linhas, 79,41% branches e 97,30% funcoes, acima dos pisos bloqueantes; o DOM integral de `app.js` continua fora desse percentual.
- Nenhum segredo conhecido no cliente; quatro pacotes runtime travados pelo lockfile foram auditados sem vulnerabilidades conhecidas.
- Inspecao estatica anterior nao confirmou XSS nos sinks revisados.
- Layout nao apresentou overflow horizontal do `body` nos viewports auditados.
- Estrutura basica de acessibilidade possui `lang=pt-BR`, `main`, `h1`, IDs unicos e nomes nos controles inspecionados.
- Smoke real passou 20/20 checks, sem excecoes/erros de console e sem overflow do body em 390 px.
- Na rodada visual atual, os oito modulos do ativo foram percorridos em 390 x 844 px, sem overflow do documento ou warning/error; sinais degradados e calculadora futures short 10x foram exercitados.

## Reconciliacao remota de 2026-07-13

- O projeto Vercel `crypto-live-desk` esta vinculado e usa Node 24.x.
- O deployment mais recente inspecionado estava `READY`, mas era um preview do commit `b124fcb`, sem target de producao.
- Chamadas reais a producao em `/api/options` e `/api/institutional` responderam 200, porem provaram contrato antigo e CORS permissivo; nao validam o working tree.
- A observabilidade continha 26 avisos historicos `DEP0169 url.parse()` em um deployment anterior nas duas rotas. A janela recente nao os reproduziu, mas a causa nao foi provada; o item permanece `OPS-013`.
- Redis/cron/env nao puderam ser inspecionados nem provisionados pela integracao disponivel. Nenhum deploy ou mutacao externa foi realizado.

Ponto positivo nao e isencao: cada item acima volta a `nao verificado` quando o hash do arquivo responsavel muda.

## Fila de execucao

1. Fechar a rodada Codex com inventario regenerado, suite limpa, cobertura, checagens estaticas e evidencias visuais novas.
2. Preservar os 55 fechamentos como `AGUARDANDO CLAUDE CODE` ate revisao independente linha a linha.
3. Provisionar Redis e `CRON_SECRET`; provar ANL-003, OPS-005 e API-006 em ambiente remoto sem confundir persistencia com validacao estatistica.
4. Criar commit/push apenas com aprovacao do proprietario, gerar preview do hash candidato e reconciliar com a producao antes de promover.
5. Clonar fora do OneDrive depois que a arvore estiver versionada e repetir o gate do runbook no destino.
6. Reexecutar a auditoria do zero depois dessas ativacoes externas e reconciliar novamente estados e contagens.
