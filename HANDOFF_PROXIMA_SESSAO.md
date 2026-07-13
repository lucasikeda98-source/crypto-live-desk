# Handoff para a próxima sessão — Crypto Live Desk

Data: 2026-07-13
Branch de trabalho: `claude/crypto-live-desk-checklist-mezzmj` (sincronizada com o remoto)
Último commit: ver `git log -1` na branch (ciclo de fechamento RC-007 concluído)

Este documento fecha a sessão atual e diz exatamente por onde a próxima deve seguir, sem
re-derivar. Leia também, nesta ordem: `CODEX_HANDOFF.md` (entradas RC-001 a RC-007) e
`CONFORMANCE_V1_GAP.md` (estado da conformidade v1: 16/17 cobertos).

---

## 1. Estado atual (feito e no repositório)

A revisão cruzada obrigatória (CLAUDE.md) dos Ciclos B+C foi concluída e registrada:

- **RC-001** (`cc3b31e`): revisão independente — aprovado com ressalvas. Verificado limpo:
  sem look-ahead, proxy BTC fora do score de altcoin, idempotência do journal, simetria
  long/short do motor v2 e do gate HTF.
- **RC-002** (`3409028`): 3 correções exigidas (Data Confidence honra os caps via `RULESET`,
  textos de reconciliação/contagem).
- **RC-003** (`a3db327`): 6 correções de lógica direcional / double-count + reconciliação do
  contrato + bump para `1.0.0-preview.6`. Cada uma verificada por 4 revisores adversariais.
- **RC-004** (`2c6495d`): item 6 (funding lente dupla) resolvido com clamp conjunto ±7 +
  dedup sweep/trap + arquivamento do journal na virada de versão. Verificado por 2 revisores
  adversariais (ambos CORRETO).
- **RC-005/006/007** (ver `CODEX_HANDOFF.md`): card simétrico; aba Sinais aprimorada (alertas
  ±42/±60 com rótulos de zona, 7 bandas espelhadas com flag de amostra, avaliação em lote por
  símbolo, export do journal); lista de conformidade zerada (§12.7 implementado, §12.8/11/14/16
  testados, Fase 4 auditada) + meta-auditoria do diff completo da sessão.
- Suíte determinística: **101/101 verdes** (`node --test`).
- **Correções analíticas COMPLETAS.** Todos os itens exigidos e recomendados da RC-001 estão
  aplicados; residuais restantes são defensáveis e documentados (RC-004/006/007).
- **Não deployado.** Tudo está na branch; `main` e produção seguem em preview.5.

---

## 2. O que ainda falta — com a recomendação de resolução

A melhor forma de conciliar tudo é **um único ciclo de fechamento (RC-004)**, depois
**release verificado**, depois **roadmap**. Nesta ordem:

### Fase A — Fechar as correções analíticas (RC-004) — ✅ CONCLUÍDA em `2c6495d`

> A1 (clamp conjunto do funding) e A2 (arquivamento do journal) foram aplicados e verificados
> (2 revisores adversariais, 94/94). A3 (card `setupQuality`) foi decidido como aceito-por-design
> (display-only, sem impacto em score). Detalhes na entrada RC-004 do `CODEX_HANDOFF.md`.
> **A próxima sessão começa na Fase B (release).** O texto abaixo fica como registro do que foi feito.

**A1. Item 6 da RC-001 — funding em lente dupla.** É a única correção recomendada ainda em
aberto. Não é erro de lógica (o percentil de funding é simétrico; a sobreposição com o carry
é design intencional documentado), então NÃO foi aplicada na RC-003.
- **Recomendação:** aplicar o **clamp conjunto**, que resolve a amplificação de cauda
  correlacionada sem o over-reach do trim (que a verificação rejeitou). Fecha o item.
- **Design pronto (verificado, mantém `:276`/`:286` verdes):** dentro de
  `calculateDerivativeDetailContribution` (lib/analytics-core.js ~1233), isolar a
  sub-contribuição de funding, receber `carryScore` como input, e somar
  `Math.max(-7, Math.min(7, fundingContribution + carryScore))` em vez de somar cada lente
  solta; em `buildConfluence` (app.js ~1597), passar `carryScore: carry.carryScore` e remover
  o `+ carry.carryScore` solto da linha de `derivatives`. Cada lente mantém autoridade plena
  sozinha (±6 percentil / ±3 carry); só a cauda correlacionada (euforia) é limitada a ±7.
- **Alternativa:** manter como está e fechar o item como "design intencional, sem alteração".
  Defensável, mas deixa a concern de cauda correlacionada aberta.

**A2. Journal na virada de versão.** O bump preview.5→preview.6 faz a lógica de startup
(app.js ~271-285) **podar** o journal de Sinais da preview.5.
- **Recomendação:** converter a poda em **arquivamento** (renomear as chaves
  `cld-signal-*:1.0.0-preview.5` para um prefixo `archived:` em vez de apagar). Preserva os
  sinais acumulados para análise segmentada por versão (§11 exige segmentar, não apagar), sem
  data loss. Mudança pequena e segura, localizada no prune.

**A3. Residuais registrados na RC-003.** Não são bloqueantes.
- **Aceitar como distintos** (requerem condição extra): vol×delta no risco (exige volume alto
  E direção) e sweep+liquidação (exige desequilíbrio de liquidações).
- **Avaliar/baixa prioridade:** sweep+reclaim contando em `smart.score` e em `trapScore`;
  estrutura HH/HL em técnica e smart; card `setupQuality` (só exibição) com Momentum `+16/-14`
  e Volume `+10/-6` assimétricos. Sugestão: simetrizar o card `setupQuality` por consistência
  visual (sem impacto em score) e documentar os demais como limitação conhecida.

> Ao final da Fase A, registrar tudo como **RC-004** em `CODEX_HANDOFF.md`, testar
> (`node --test`) e, se A1/A2 alterarem resultado, declarar por §11. A1 muda score → o
> `rulesetHash` já está em preview.6; se A1 sair antes de qualquer deploy do preview.6, não
> precisa novo bump (mesma janela de versão ainda não publicada); se sair depois, bumpar.

### Fase B — Verificar e publicar

O smoke de navegador **não roda neste ambiente** (runners batem HTTP 451 da Binance por
geo-restrição). O gate autoritativo é contra o deploy:

1. `node --test` (deve seguir verde).
2. Push da branch → **Vercel preview** → rodar `node scripts/browser-smoke.cjs` contra o
   preview (24 ativos, versão preview.6, aba Sinais, layout 390px, sem erro de console).
3. Só então integrar na `main` → verificar produção (`https://crypto-live-desk.vercel.app`).
4. Vercel MCP disponível na sessão para checar deploy/logs/runtime errors.

### Fase C — Retomar o checklist original (Blocos 1-3)

Depois da Fase B, seguir o checklist já apresentado:
- **Bloco 1 — Conformidade v1: FECHADO no nível motor (RC-007).** `CONFORMANCE_V1_GAP.md`:
  16/17 cobertos, zero lacunas reais. Único parcial: 12.1 (fiação na UI com dados reais —
  exige smoke com Binance acessível). Fase 4: auditoria de aliases concluída; resta rollback
  testado + janela de observação, pós-release.
- **Bloco 2 — Roadmap:** backtesting walk-forward, calibração de probabilidade, alertas por
  regime, portfolio risk, calendário de eventos, integração autenticada isolada no backend.
- **Bloco 3 — Infra:** estabilizar o smoke de navegador, gate de CI alternativo, questão
  Git/OneDrive.

---

## 3. Referências rápidas

- Motor puro: `lib/analytics-core.js`. Orquestração/UI: `app.js`. Contrato normativo:
  `ANALYTIC_CONTRACT_V1.md`. Cobertura/changelog: `ANALYTICS_COVERAGE.md`.
- Caps do Setup no `RULESET.setupCaps` (analytics-core.js ~1307); `dataQuality` (app.js) já
  deriva os pesos do DC daí.
- Testes: `node --test`. Dev local: `node scripts/dev-server.cjs` (porta 5173).
- Protocolo de revisão cruzada (CLAUDE.md): toda mudança do Codex entra em `CODEX_HANDOFF.md`
  como `AGUARDANDO CLAUDE CODE` e só vira `REVISADO PELO CLAUDE CODE` após revisão real.

## 4. Uma linha para iniciar a próxima sessão

> "Continue o Crypto Live Desk. As correções analíticas e de conformidade (RC-001..RC-007) estão
> completas na branch `claude/crypto-live-desk-checklist-mezzmj` (preview.6, 101/101, não
> publicada; conformidade 16/17). Siga pela Fase B do `HANDOFF_PROXIMA_SESSAO.md`: release
> verificado (push → Vercel preview → smoke contra o preview → main → produção); depois o
> restante (12.1 na UI, rollback da Fase 4, Blocos 2-3)."
