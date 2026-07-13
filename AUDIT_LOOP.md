# Loop exaustivo de auditoria

Estado: **REVISADO PARCIALMENTE PELO CLAUDE CODE (2026-07-13, checkpoint `887ec57`)** — ver `CODEX_HANDOFF.md` REV-CC-01

## Objetivo

Revisar todo o Crypto Live Desk de forma rastreavel e redundante. Nenhum achado e ignorado por ser pequeno, caro, cosmetico, improvavel ou de baixo risco. Prioridade define ordem; nunca define descarte.

O universo auditavel e congelado em `AUDIT_INVENTORY.json`, com arquivo, hash, tamanho, numero de linhas e passadas obrigatorias. Uma rodada nao pode alegar cobertura total se algum arquivo do inventario estiver sem reconciliacao.

## Principios

1. Evidencia antes de conclusao.
2. Ausencia, zero, stale, proxy e erro sao estados diferentes.
3. Teste verde nao substitui revisao conceitual.
4. Screenshot nao substitui teste de teclado, rede, console ou calculo.
5. Severidade e esforco sao dimensoes independentes.
6. Correcao sem teste de regressao permanece aberta.
7. Uma segunda passada deve tentar refutar a primeira.
8. Mudancas Codex ficam `AGUARDANDO CLAUDE CODE` ate revisao real.

## Estados de um achado

`SUSPEITA` -> `CONFIRMADO` -> `CORRIGIDO` -> `VALIDADO` -> `REAUDITADO` -> `AGUARDANDO CLAUDE CODE` -> `REVISADO PELO CLAUDE CODE`

- `SUSPEITA`: indicio ainda sem prova suficiente.
- `CONFIRMADO`: causa e impacto reproduzidos.
- `CORRIGIDO`: implementacao alterada, ainda sem fechamento.
- `VALIDADO`: teste de regressao e verificacoes proporcionais passaram.
- `REAUDITADO`: uma passada separada tentou quebrar a correcao.
- `AGUARDANDO CLAUDE CODE`: pronto para revisao cruzada, nao aprovado por ela.

## Classificacao

### Severidade

- `P0`: invalida integridade analitica, seguranca, dados ou release.
- `P1`: risco alto operacional, metodologico ou de regressao.
- `P2`: problema funcional, UX, acessibilidade, manutencao ou hardening.
- `P3`: inconsistencia pequena, divida, texto, polish ou caso raro.

### Esforco

- `XS`: ate algumas linhas/teste local.
- `S`: um modulo ou fluxo curto.
- `M`: varios arquivos ou migracao controlada.
- `L`: mudanca arquitetural.
- `XL`: infraestrutura, dados duraveis ou dependencia externa.

## Passadas obrigatorias

### Passada 0 — censo e baseline

- Inventariar todos os arquivos rastreados e novos nao ignorados.
- Registrar hash, linhas, bytes, branch, commit, testes e deploy.
- Conferir diferencas entre producao, preview e working tree.
- Congelar evidencias antes das correcoes.

### Passada 1 — revisao estatica linha a linha

Para cada arquivo:

- entradas, saidas, tipos, unidades, timezone e arredondamento;
- null/zero/NaN/Infinity/string vazia/booleano;
- limites, off-by-one, ordenacao, deduplicacao e idempotencia;
- concorrencia, timers, abort, retry, cache e estado compartilhado;
- semantica de nomes, comentarios, contrato e UI;
- sinks de HTML/URL, segredos, CORS e headers;
- complexidade, duplicacao e codigo morto.

### Passada 2 — motor analitico adversarial

- Testes unitarios, contrato e propriedades.
- Fuzz deterministico com seed registrada.
- Candles vazios, parciais, duplicados, fora de ordem e extremos.
- Gaps, stop+alvo no mesmo candle, clocks divergentes e dados stale.
- Look-ahead, dupla contagem, vazamento cross-asset e vies long/short.
- Reconciliacao manual de componentes, caps e Data Confidence.

### Passada 3 — APIs e fluxo ponta a ponta

Para cada historia: UI -> request -> rota -> upstream -> normalizacao -> resposta -> renderizacao.

- sucesso, timeout, HTTP 4xx/5xx e HTTP 200 com erro semantico;
- resposta vazia, parcial, malformada, lenta e fora de ordem;
- cache hit/miss/stale, rate limit e queda de um venue;
- shape da API comparado ao consumidor real.

### Passada 4 — navegador

- Desktop e mobile em cada tela/aba.
- Navegacao, seletores, calculadora, sinais e exportacao.
- Console, requests, loading, empty, stale, erro e recuperacao.
- Teclado, foco, nomes acessiveis, alvo de toque, reflow e zoom.
- Captura salva e inspecionada na rodada corrente.

### Passada 5 — operacao, performance e seguranca

- Cold start, volume de requests, memoria, payload e renderizacao.
- Orçamento serverless e upstream.
- CI bloqueante, observabilidade e rollback.
- CSP, frame, nosniff, referrer, permissions e superficie publica.
- Persistencia, retencao, migracao, multiaba e reload.

### Passada 6 — correcao por lotes

Ordem sugerida: integridade P0 -> P1 -> quick wins seguros -> P2/P3 -> mudancas arquiteturais. Cada lote deve ser pequeno, ter entrada propria no `CODEX_HANDOFF.md` e nao misturar temas sem necessidade.

### Passada 7 — redundancia

- Regerar inventario e comparar hashes.
- Reexecutar todos os testes e browser flows.
- Revisar a correcao sem usar a justificativa original como premissa.
- Procurar regressao adjacente e nova inconsistencia documental.
- Somente entao marcar `REAUDITADO`.

## Condicao de encerramento

O loop so termina quando:

1. 100% dos arquivos do inventario receberam todas as passadas aplicaveis.
2. Nao ha `SUSPEITA`, `CONFIRMADO` ou `CORRIGIDO` sem validacao.
3. Todos os P0/P1 foram reauditedos; P2/P3 foram corrigidos ou possuem decisao explicita do proprietario.
4. Testes deterministas, propriedades, integracao e browser passaram.
5. Preview e producao foram reconciliados.
6. Contrato, runtime, UI e documentacao dizem a mesma coisa.
7. `CODEX_HANDOFF.md` contem autoria, arquivos, testes e limitacoes.
8. Claude Code executou a revisao cruzada ou os itens continuam honestamente marcados como pendentes.
