# Conformidade v1 — análise de lacunas (Bloco 1)

Data: 2026-07-13 · Modelo: `1.0.0-preview.6` · **Atualizado após o ciclo de fechamento (RC-007):
12.7, 12.8, 12.11, 12.14 e 12.16 foram fechados — ver tabela.**

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
| 12.7 | Fallback equivalente com fator de proveniência (0,80) | ✅ (RC-007) | Implementado: `RULESET.fallbackProvenanceFactor = 0.8` + `sourceProvenanceFactor()` no motor; fiado no `dataQuality` (Setup) e no bloco Fundamental do Radar — contexto coberto SÓ pelo market data de fallback ganha crédito 0,8 no DC. Teste `contrato 12.7`. |
| 12.8 | Candle aberto não altera scores confirmados | ✅ (RC-007) | Teste `contrato 12.8`: candle em formação com valores extremos (spike 50%, volume 100x) não altera detectores confirmados, contagem nem o último candle fechado; fronteira `closeTime === asOf` incluída. |
| 12.9 | Multi-timeframe: cada TF seu próprio candle fechado; falha parcial não invalida | ✅ | `MTF: alignment...`, `...alinhamento pleno`, `...Misto sem crash`; fetch por TF em `loadMultiTimeframe`. |
| 12.10 | Proxy BTC não altera score de altcoin | ✅ | `contrato 12.10`, `proxy de opcoes BTC...informativo`, `mempool BTC somente...nativo` |
| 12.11 | Escopo: símbolo/TF/snapshot corretos; respostas cruzadas descartadas | ✅ (RC-007) | Teste `contrato 12.11`: troca de seleção invalida o gate e a resposta atrasada da seleção anterior é rejeitada (`isCurrent` falso). O app roteia as trocas por `refreshGate.invalidate()/begin()`. |
| 12.12 | Limites [-100,100] / [0,100] | ✅ | `contrato 12.12/12.13` |
| 12.13 | Incalculável → null, DC 0, unavailable | ✅ | `contrato 12.12/12.13` |
| 12.14 | Rastreabilidade completa por componente | ✅ (RC-007) | Teste `contrato 12.14` (lint de fonte): os 8 componentes do Setup declaram `ruleId/max/status/scope/isProxy/sources/reason` e os 7 blocos do Radar declaram `ruleId/weight/available/value/quality/raw/scope/reason`. Verificação do DOM renderizado permanece no smoke de navegador. |
| 12.15 | Versão/hash novos quando regra muda | ✅ | `ruleset: hash...muda quando uma regra muda` |
| 12.16 | Fixtures mínimos (alta, baixa, lateralização, pouca liquidez, fonte parcial, TradFi null, stale, fallback, candle aberto extremo, altcoin+proxy, timestamps futuros) | ✅ (RC-007, nível motor) | Teste `contrato 12.16`: golden fixtures de alta (BOS +4), baixa (CHoCH −6) e lateralização (sem evento) + Radar completo congelado nos três regimes (51/−51/3), com simetria espelhada exata e soma de contribuições reconciliada. Candle aberto extremo no 12.8; demais itens já cobertos isoladamente. Golden a nível de UI permanece para o harness de navegador. |
| 12.17 | Comunicação (DC ≠ chance de acerto; score ≠ recomendação garantida) | ✅ (novo) | Fechado nesta rodada: teste de lint de cópia varre `index.html` por frases proibidas; os disclaimers do rodapé/painéis já eram compatíveis. |

## Resumo (pós-RC-007)

- **Cobertos (16):** 12.2–12.17, exceto 12.1.
- **Parcial (1):** 12.1 — a separação semântica existe no motor e nos rótulos; a verificação da FIAÇÃO na UI com dados reais (qual score aparece em cada tela) exige o smoke de navegador com Binance acessível. Um boot-check local (Chromium headless, independente de Binance) valida boot sem exceção, DOM e layout 390px.
- **Lacunas reais:** nenhuma.

## Fases de migração (§13)

- **Fase 2 (semântica):** praticamente concluída — exclusão de candle em formação, remoção de proxy BTC, sem fabricar zero, staleness, identidade de símbolo/TF/snapshot.
- **Fase 3 (apresentação):** praticamente concluída — rótulos Radar/Setup/DC, versão/hash/candle exibidos, proxies e stale marcados, reconciliação exposta.
- **Fase 4 (encerrar legado):** AUDITORIA CONCLUÍDA (RC-007) — todo caminho que exibe score chama `buildRadarScore`, que sobrescreve `analysis.score`/`bias` com o agregado v1; `coreScore` é intermediário interno sem consumo na UI; o `score` por timeframe do `technicalSnapshot` é a leitura técnica que alimenta o componente MTF por design (não é exibido como score final sem rótulo). Nenhum alias legado é consumido como Radar/Setup Score. O que resta para encerrar o legado: rollback testado + janela de observação (§13 Fase 4), pós-release.

## Restante (pós-fechamento)

1. **12.1 nível UI:** smoke de navegador com dados reais (ambiente com Binance acessível) confirmando a fiação Radar↔dashboard e Setup↔ativo.
2. **Fase 4:** rollback testado + janela de observação antes de remover o legado interno.
