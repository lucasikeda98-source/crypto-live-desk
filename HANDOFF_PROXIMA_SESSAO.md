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

- [x] A1. FEITO 2026-07-13 — integração Upstash via Marketplace criou credenciais `KV_*` (redis-runtime aceita ambos os nomes); produção responde `configured:true`.
- [x] A2. FEITO 2026-07-13 — `CRON_SECRET` (>=24 chars) ativo; worker sem segredo responde 401 Unauthorized.
- [x] A3. FEITO — cron diário 04:17 UTC já declarado no vercel.json; ativo com o deploy `5524110`. (Upgrade p/ cadência maior fica opcional.)
- [x] A4. FEITO 2026-07-13 — sonda contra produção: upsert com outcome (`r1h:1.5`), escritor rival com `inputSnapshotId` diferente NÃO regrediu o registro (primeiro snapshot canônico preservado), DELETE limpou hash+índice due. Fecha a ressalva transversal da REV-CC-01 seção C.
- [x] A5. FEITO 2026-07-13 — coberto pela mesma sonda (dois escritores concorrentes no mesmo journal id via API de produção); cenário ANL-027 validado contra Redis real.
- [x] A6. FEITO 2026-07-13 — rajada de 40 GETs em /api/signals: ~24 aceitos, restante 429 (sliding window distribuído ativo).

### Fase B — Operação e CI
- [x] B1. FEITO 2026-07-13 — causa raiz confirmada nos logs do runner: geo-bloqueio do `fapi.binance.com` (futuros) manifesta-se como CORS/`ERR_FAILED`; o SPOT (`data-api.binance.vision`) FUNCIONA no runner. Advisory correto; melhoria futura: proxyar dados de futuros via /api.
- [x] B2. FEITO 2026-07-13 — boot falhava porque o assert de titulo nao previa o app com preco ao vivo (runner alcanca a Binance spot); corrigido em `cce607e` (validado local online+offline). Run do CI verde: deterministic-tests 22/24 + browser-boot success.
- [x] B3. PREPARADO 2026-07-13 — clone limpo em `C:\dev\crypto-live-desk` com gate completo verde (313/313, npm ci ok). Falta apenas o dono passar a trabalhar nesse caminho (a copia do OneDrive vira backup).
- [x] B4. FEITO 2026-07-13 — zero erros de runtime nas ultimas 24h (janela cobre os endpoints novos exercitados pelas sondas da Fase A). Rechecar apos o primeiro disparo do cron (04:17 UTC).

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
