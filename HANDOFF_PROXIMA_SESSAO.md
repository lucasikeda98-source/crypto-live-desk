# Handoff para a próxima sessão — Crypto Live Desk

Data: 2026-07-13 (substituiu o handoff da sessão RC-001..RC-007)
Branch: `main` (produção). Último commit: `b3b080b` (merge preview.6 + ciclo D + CC-FIX-01 = `1.0.0-preview.8`).
Produção: https://crypto-live-desk.vercel.app — deploy `dpl_E22yqtAvbuAz8K1TsKArKQnfyfer`, verificado ao vivo (24 cards, zero erro de console, v1.0.0-preview.8).

Leia também, nesta ordem: `CODEX_HANDOFF.md` (REV-CC-01, CC-FIX-01 e RC-001..RC-009), `AUDIT_LEDGER.md`, `CONFORMANCE_V1_GAP.md`.

---

## 1. Estado atual (feito e em produção)

- Ciclo D do Codex (microestrutura cross-venue, CFTC, sinais duráveis com Lua, api-guard, degradação por venue) revisado (REV-CC-01), corrigido integralmente (CC-FIX-01) e mesclado com as regras do preview.6 da main (RC-001..RC-009).
- Gate combinado: **313/313** testes, cobertura 97,9/81/96 (pisos 95/75/90), `rulesetHash` pinado em `4efe8ce2` (test/behavior-guards.test.js).
- Os 3 scripts Lua de produção são executados por teste numa VM Lua real (fengari); merge preserva o primeiro snapshot canônico.
- CI: `deterministic-tests` (bloqueante, Node 22/24) + `browser-boot` (bloqueante, Chromium, independe da Binance) + `browser-smoke` (advisory, limitação 451 documentada).

## 2. Próximos passos — checklist por fase

### Fase A — Infra dos sinais duráveis (destrava o valor do ciclo D)
O journal durável hoje degrada para local-only; nada disso é código novo.

- [ ] A1. Provisionar Upstash Redis no projeto Vercel (env `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
- [ ] A2. Definir `CRON_SECRET` no projeto Vercel (o worker rejeita chamadas sem ele).
- [ ] A3. Ativar o cron do `api/signal-worker` (vercel.json/cron Hobby diário; avaliar upgrade se quiser cadência de 5m).
- [ ] A4. Exercitar os 3 scripts Lua contra o Redis REAL (upsert concorrente, clear, compact) e registrar a evidência no handoff — a ressalva transversal da REV-CC-01 (seção C) só fecha aqui.
- [ ] A5. Smoke de sincronização ponta-a-ponta: dois navegadores com o mesmo código privado, outcome do worker não regride com cliente atrasado (o cenário do ANL-027, agora contra produção).
- [ ] A6. Confirmar rate-limit distribuído do api-guard ativo com Redis presente (hoje só o limite local está provado).

### Fase B — Operação e CI
- [ ] B1. Observar 1–2 execuções do workflow Quality em runner hospedado: confirmar se o `browser-smoke` sofre HTTP 451 (se sim, manter advisory; alternativa de longo prazo: proxyar klines pela camada /api com fixture de CI).
- [ ] B2. Confirmar que o job `browser-boot` (Playwright) continua verde com o app mesclado (roda no CI, não local).
- [ ] B3. Mover o repositório para FORA do OneDrive (clone limpo, repetir o gate do OPERATIONS_RUNBOOK no destino) — OneDrive causa locks e realpath esquisito.
- [ ] B4. Verificar logs de runtime da Vercel ~24h pós-deploy (endpoints novos: market-microstructure, signals, signal-worker).

### Fase C — Dívidas de revisão remanescentes (código)
- [ ] C1. ANL-015: revisar calendário/flag `reported` de fluxos ETF (ficou fora da REV-CC-01, seção E).
- [ ] C2. OPS-010: confirmar que o smoke exercita o contrato de override de notícias (seção E).
- [ ] C3. Derivar de fato os clamps de `buildConfluence` (app.js) de `RULESET.setupCaps` — hoje há só um cross-check por teste que impede divergência silenciosa.
- [ ] C4. Harness de DOM para app.js (jsdom ou Playwright de unidade) para substituir os últimos regex-guards de features.test.js:266,268 por testes de pipeline reais.
- [ ] C5. Avaliar batch por símbolo na avaliação de sinais (o merge ficou com o caminho preciso 1m/15m do ciclo D, capado em 10 por clique; a ideia de 1 fetch por símbolo do RC-006 pode ser reincorporada sobre esse caminho).

### Fase D — Validação estatística (não começa antes de A)
- [ ] D1. Acumular sinais versionados em preview.8 (journal segmentado por versão; não agregar com versões anteriores — contrato §11).
- [ ] D2. Só tratar hit rates como evidência com ≥20 avaliações por célula (flag `sufficient` + intervalos de Wilson já implementados).
- [ ] D3. Revisitar pesos/caps do ruleset apenas com dados suficientes, com bump de versão + hash-ouro.

## 3. Regras que continuam valendo

- Qualquer mudança de regra de score exige bump de `rulesetVersion` + atualização consciente do pin `RULESET_HASH_GOLDEN` (o teste força).
- Autoria e limitações do histórico Codex/RC preservadas em `CODEX_HANDOFF.md`; entradas só mudam de estado com revisão real.
- Journal de sinais nunca é agregado entre versões de modelo.
