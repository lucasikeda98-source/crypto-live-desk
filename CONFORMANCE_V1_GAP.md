# Conformidade v1 — análise de lacunas (Bloco 1)

Data: 2026-07-13 · Modelo: `1.0.0-preview.6`

Mapa dos 17 critérios de aceitação do `ANALYTIC_CONTRACT_V1.md` §12 contra a cobertura de
testes atual (`test/*.test.js`). Objetivo: saber o que já está travado por teste, o que está
parcial e o que falta, para planejar o fechamento (Fases 2→4 da migração §13).

Legenda: ✅ coberto · 🟡 parcial · ⛔ lacuna real (impl e/ou teste).

| # | Critério | Estado | Evidência / lacuna |
|---|----------|:---:|--------------------|
| 12.1 | Separação semântica (dashboard=Radar, ativo=Setup, ambos com DC) | 🟡 | Motor separa `buildRadarScore` vs `buildConfluence`; falta teste da FIACAO na UI (qual score aparece em cada tela) — nível app.js/DOM. |
| 12.2 | Determinismo | ✅ | `contrato 12.2` |
| 12.3 | Reconciliação (soma = fórmula) | ✅ | `contrato 12.3` |
| 12.4 | Ausência não cria viés; reduz DC | ✅ | `contrato 12.4`, `fluxo ausente...nao recebe vies`, `derivativo stale e invariavel` |
| 12.5 | Zero vs ausente | ✅ | `normalizacao numerica preserva ausencia`, `delta taker neutro...zero`, `TradFi descarta close null`, `...sem fabricar zero` |
| 12.6 | Staleness exclui do score, reduz DC | ✅ | `freshness exclui cache stale e timestamp futuro`, `elegibilidade reclassificada`, `freshness por metrica...` |
| 12.7 | Fallback equivalente com fator de proveniência (0,80) | ⛔ | Fallback EXISTE e é testado nas rotas (`market-api`, `tradfi-api`), mas o **fator de proveniência 0,80 do `fresh_fallback` no Data Confidence não está implementado nem testado**. `calculateDataConfidence` usa `quality` por componente, sem distinguir nativo de fallback. |
| 12.8 | Candle aberto não altera scores confirmados | 🟡 | `somente candles cujo closeTime passou alimentam sinais`, `selectClosedCandles`; falta o teste explícito "variar SÓ o candle em formação → score/padrão/último-fechado idênticos". |
| 12.9 | Multi-timeframe: cada TF seu próprio candle fechado; falha parcial não invalida | ✅ | `MTF: alignment...`, `...alinhamento pleno`, `...Misto sem crash`; fetch por TF em `loadMultiTimeframe`. |
| 12.10 | Proxy BTC não altera score de altcoin | ✅ | `contrato 12.10`, `proxy de opcoes BTC...informativo`, `mempool BTC somente...nativo` |
| 12.11 | Escopo: símbolo/TF/snapshot corretos; respostas cruzadas descartadas | 🟡 | `request gate invalida respostas obsoletas` cobre o descarte por obsolescência; falta o caso explícito de resposta de OUTRO símbolo/TF sendo rejeitada. |
| 12.12 | Limites [-100,100] / [0,100] | ✅ | `contrato 12.12/12.13` |
| 12.13 | Incalculável → null, DC 0, unavailable | ✅ | `contrato 12.12/12.13` |
| 12.14 | Rastreabilidade completa por componente | 🟡 | `export: snapshot carrega envelope, componentes e disclaimer` cobre em alto nível; falta assert de que TODO componente carrega `ruleId`, `sources`, `observedAt`, `ageMs`, `cap`, `status`, `isProxy`, `contribution`. |
| 12.15 | Versão/hash novos quando regra muda | ✅ | `ruleset: hash...muda quando uma regra muda` |
| 12.16 | Fixtures mínimos (alta, baixa, lateralização, pouca liquidez, fonte parcial, TradFi null, stale, fallback, candle aberto extremo, altcoin+proxy, timestamps futuros) | 🟡 | Vários itens cobertos isoladamente (stale, proxy, TradFi null, futuros, fonte parcial). **Falta o conjunto de "golden fixtures" rodando o Setup/Radar COMPLETO em alta / baixa / lateralização end-to-end** — a maior lacuna estruturada. |
| 12.17 | Comunicação (DC ≠ chance de acerto; score ≠ recomendação garantida) | ✅ (novo) | Fechado nesta rodada: teste de lint de cópia varre `index.html` por frases proibidas; os disclaimers do rodapé/painéis já eram compatíveis. |

## Resumo

- **Cobertos (11):** 12.2, 12.3, 12.4, 12.5, 12.6, 12.9, 12.10, 12.12, 12.13, 12.15, 12.17.
- **Parciais (5):** 12.1 (UI), 12.8 (invariância explícita do candle aberto), 12.11 (descarte por símbolo/TF), 12.14 (rastreabilidade por campo), 12.16 (golden fixtures).
- **Lacuna real (1):** 12.7 (fator de proveniência 0,80 do fallback — impl + teste).

## Fases de migração (§13)

- **Fase 2 (semântica):** praticamente concluída — exclusão de candle em formação, remoção de proxy BTC, sem fabricar zero, staleness, identidade de símbolo/TF/snapshot.
- **Fase 3 (apresentação):** praticamente concluída — rótulos Radar/Setup/DC, versão/hash/candle exibidos, proxies e stale marcados, reconciliação exposta.
- **Fase 4 (encerrar legado):** PENDENTE de verificação — confirmar que nenhum alias legado (`analysis.score`, `coreScore`, "Score" genérico) ainda é CONSUMIDO pela UI. Enquanto houver consumo, o legado não pode ser removido.

## Ordem recomendada para fechar (próximos passos)

1. **12.16 golden fixtures** (maior valor): fixtures de alta / baixa / lateralização com Setup e Radar completos, congelando score, contribuições e DC — reforça determinismo (12.2) e reconciliação (12.3) de ponta a ponta.
2. **12.8** teste de invariância do candle em formação (barato, trava um invariante central).
3. **12.14** teste de rastreabilidade por campo (assert de todos os campos obrigatórios em cada componente).
4. **12.7** decidir e implementar o fator de proveniência do fallback (ou registrar formalmente como fora do escopo do preview, com nota no contrato).
5. **12.11** teste de descarte de resposta de símbolo/TF cruzado.
6. **Fase 4:** auditoria de aliases legados na UI + rollback testado antes de remover o legado.
