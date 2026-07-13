# Crypto Live Desk — contrato analítico v1

Status: especificação normativa para implementação e migração  
Versão inicial: `1.0.0`  
Data: 2026-07-12

Revisão operacional corrente: `1.0.0-preview.7-codex.2`, feita via Codex e **AGUARDANDO CLAUDE CODE**. O histórico v1 permanece; quando uma regra abaixo foi reconciliada com o runtime posterior, a mudança é explicitada neste documento.

## 1. Objetivo e escopo

Este contrato define o significado, o cálculo, a rastreabilidade e a apresentação dos três resultados analíticos canônicos do sistema:

- **Radar Score**: comparação direcional entre ativos.
- **Setup Score**: leitura direcional de um ativo em um timeframe e instante específicos.
- **Data Confidence**: cobertura, atualidade e proveniência dos dados usados em um score.

O contrato também define as regras para candles em formação, dados ausentes ou antigos, proxies de BTC, versionamento, explicação de contribuições e migração dos scores legados.

Este contrato não transforma scores em probabilidade de lucro, recomendação financeira, ordem de execução ou promessa de desempenho. A validação estatística do poder preditivo é um processo separado.

As palavras **DEVE**, **NÃO DEVE**, **PODE** e **RECOMENDA-SE** são normativas.

## 2. Princípios invariantes

1. Um score mede evidência direcional e confluência; não mede probabilidade calibrada de retorno.
2. `0` significa evidência direcional equilibrada. `null` significa que não há dados suficientes para calcular. Esses estados NÃO DEVEM ser confundidos.
3. Dados ausentes, inválidos ou `stale` NÃO DEVEM receber valor zero como se fossem uma observação real.
4. Dados ausentes NÃO DEVEM produzir contribuição positiva ou negativa. Eles reduzem o Data Confidence.
5. Apenas candles fechados PODEM confirmar indicadores, padrões, regimes e sinais baseados em OHLCV.
6. Todo resultado DEVE ser reproduzível a partir de uma versão de modelo e de um snapshot identificável dos dados de entrada.
7. Todo ponto do score DEVE ser reconciliável com uma contribuição, fonte, horário e regra.
8. Um proxy DEVE ser identificado como proxy. Dados específicos de BTC NÃO DEVEM ser apresentados como dados nativos de outra moeda.
9. Radar Score, Setup Score e Data Confidence NÃO DEVEM ser exibidos sob o rótulo ambíguo de apenas “Score” ou “Confiança”.
10. Nenhuma mudança que possa alterar um resultado analítico PODE ser publicada silenciosamente sob a mesma identificação de modelo.

## 3. Identidade e envelope obrigatório

Todo resultado calculado DEVE carregar, no mínimo:

| Campo | Regra |
| --- | --- |
| `score_type` | `radar` ou `setup` |
| `score` | Inteiro de `-100` a `+100`, ou `null` quando incalculável |
| `data_confidence` | Inteiro de `0` a `100` |
| `model_id` | `crypto-live-desk-analytics` |
| `model_version` | Versão semântica, iniciando em `1.0.0` |
| `ruleset_hash` | Hash das regras, pesos, limites de atualidade e registros de fonte |
| `symbol` | Símbolo ao qual o resultado pertence |
| `interval` | Timeframe avaliado; obrigatório para Setup e para o radar quando configurável |
| `calculated_at` | Instante UTC ISO 8601 do cálculo |
| `input_snapshot_id` | Identificador imutável do conjunto de entradas |
| `last_closed_candle_time` | Fechamento UTC do candle mais recente usado |
| `components` | Lista completa das contribuições, inclusive indisponíveis |
| `data_status` | `complete`, `partial`, `insufficient` ou `unavailable` |

O par `symbol` + `interval` DEVE ser capturado no início do cálculo e permanecer imutável até o resultado. Uma resposta recebida para outro símbolo, timeframe ou `input_snapshot_id` NÃO DEVE ser incorporada ao resultado.

## 4. Estados e atualidade dos dados

### 4.1 Estados canônicos

Cada métrica de entrada DEVE possuir exatamente um destes estados:

| Estado | Significado | Entra no score? | Gera crédito no Data Confidence? |
| --- | --- | ---: | ---: |
| `fresh` | Válida e dentro do limite de atualidade | Sim | Sim |
| `fresh_fallback` | Válida, atual e obtida de fallback equivalente registrado | Sim | Parcial, conforme registro |
| `stale` | Válida, mas além do limite de atualidade | Não | Não |
| `missing` | Não foi recebida | Não | Não |
| `invalid` | Falhou em unidade, faixa, schema ou coerência | Não | Não |
| `error` | A obtenção ou transformação falhou | Não | Não |
| `proxy_info` | Proxy disponível apenas para contexto visual | Não | Não |

Uma falha de atualização PODE preservar o último valor válido para exibição, mas o estado DEVE ser recalculado pela idade. Um valor preservado e antigo DEVE aparecer como `stale` e NÃO DEVE continuar influenciando scores.

### 4.2 Registro de fontes

Toda entrada utilizada pelo modelo DEVE existir em um registro versionado de fontes contendo:

- `source_id`, fornecedor e endpoint lógico;
- métrica, unidade e regra de validação;
- escopo: `symbol`, `BTC`, `network` ou `market`;
- `observed_at` esperado e política de relógio;
- `stale_after_ms` explícito;
- fonte primária e fallbacks equivalentes permitidos;
- `provenance_factor` do fallback;
- política de cache e transformação;
- regra de indisponibilidade.

Uma fonte sem `stale_after_ms` ou sem validador NÃO É elegível para score. Horários futuros além da tolerância de relógio registrada são `invalid`.

Checkpoint Codex `preview.7-codex.2`: o runtime implementa `SOURCE_REGISTRY` versionado para 22 fontes live, históricas e manuais. O objeto completo integra o `rulesetHash`, é validado por teste estrutural, acompanha o export schema 3 e fornece os identificadores mostrados na explicação do score. Esta implementação permanece **AGUARDANDO CLAUDE CODE** e, isoladamente, não demonstra a conformidade ponta a ponta de cada valor observado.

### 4.3 Horários obrigatórios

Para cada valor, o sistema DEVE distinguir:

- `observed_at`: quando o fenômeno foi observado ou a janela terminou;
- `fetched_at`: quando o sistema recebeu a resposta;
- `calculated_at`: quando o resultado foi calculado;
- `age_ms = calculated_at - observed_at`.

`fetched_at` NÃO PODE substituir `observed_at` ao decidir se um dado está atual.

## 5. Candle fechado e candle em formação

Um candle é **fechado** somente quando seu `close_time` é menor ou igual ao horário de referência confiável do cálculo. A tolerância de relógio DEVE estar no registro da fonte.

As regras são:

1. Indicadores, estruturas, padrões, histórico semelhante e componentes multi-timeframe DEVEM usar exclusivamente candles fechados.
2. O candle em formação PODE aparecer no gráfico, no preço ao vivo e em uma leitura explicitamente chamada `preview` ou “em formação”.
3. Uma leitura `preview` NÃO DEVE sobrescrever, confirmar nem compartilhar o mesmo identificador de um Setup Score confirmado.
4. Alterações de máxima, mínima, fechamento ou volume do candle em formação NÃO DEVEM alterar o Radar Score confirmado nem o Setup Score confirmado.
5. Cada timeframe do multi-timeframe DEVE aplicar sua própria regra de fechamento. O fechamento de `5m` não confirma `1h`, `1d` ou `1w`.
6. Se não houver quantidade mínima de candles fechados para uma regra, a métrica é `missing`; ela não é preenchida com zero e não é extrapolada.

Dados realmente contínuos, como livro, spread, mark price ou open interest atual, PODEM compor blocos explicitamente definidos como tempo real. Eles DEVEM carregar seu próprio `observed_at` e não tornam um candle em formação “fechado”.

## 6. Radar Score

### 6.1 Finalidade

O Radar Score ordena ativos por evidência direcional comparável no timeframe do radar. Sua escala é:

- `+100`: máxima confluência compradora prevista pelas regras v1;
- `0`: evidência equilibrada;
- `-100`: máxima confluência vendedora prevista pelas regras v1.

Ele NÃO é o Setup Score da tela do ativo e NÃO é uma probabilidade.

### 6.2 Blocos e pesos nominais

| Bloco | Peso nominal | Escopo esperado |
| --- | ---: | --- |
| Técnica do timeframe | 30 | Ativo e timeframe |
| Fluxo | 15 | Ativo e timeframe/tempo real |
| Derivativos | 10 | Ativo |
| Fundamental/contexto | 15 | Ativo ou rede mapeada |
| Macro e notícias | 10 | Mercado, com relevância explícita |
| Histórico | 15 | Ativo e regime |
| Momentum de 24h | 5 | Ativo |
| **Total** | **100** |  |

Cada bloco disponível produz um valor normalizado `b_i` entre `-100` e `+100`. O peso nominal é `w_i`. `e_i` vale `1` quando o bloco satisfaz sua cobertura mínima com dados elegíveis e `0` nos demais casos.

```text
available_weight = Σ(e_i × w_i)
radar_score_raw  = Σ(e_i × w_i × b_i) / available_weight
radar_score      = round(clamp(radar_score_raw, -100, +100))
```

Se `available_weight = 0`, `radar_score` DEVE ser `null`, o viés DEVE ser `unavailable` e o Data Confidence DEVE ser `0`.

O arredondamento ocorre apenas no resultado final. A contribuição exibida de cada bloco é:

```text
contribution_i = e_i × w_i × b_i / available_weight
```

As contribuições não arredondadas DEVEM somar o valor não arredondado do Radar Score.

### 6.3 Faixas de viés v1

| Radar Score | Viés |
| ---: | --- |
| `>= +35` | Comprador |
| `-34` a `+34` | Neutro |
| `<= -35` | Vendedor |
| `null` | Indisponível |

O viés DEVE sempre aparecer ao lado do Data Confidence. Um score alto com baixa cobertura continua sendo um score de baixa confiança de dados.

## 7. Setup Score

### 7.1 Finalidade

O Setup Score mede a confluência direcional de um símbolo, timeframe e snapshot específicos. Ele serve para explicar se a leitura local, o multi-timeframe e os contextos disponíveis se apoiam ou se contradizem.

O Setup Score NÃO DEVE ser usado para ordenar o radar. Um valor negativo indica evidência baixista. A máquina simulada PODE considerar short somente com os mesmos gates exigidos para long (limiar, gatilho nomeado, HTF disponível, ausência de veto e R:R estrutural); o valor negativo isolado não autoriza posição nem constitui recomendação.

### 7.2 Componentes e limites v1

| Componente | Contribuição permitida |
| --- | ---: |
| Técnica local | `-20` a `+20` |
| Multi-timeframe | `-16` a `+16` |
| Smart money e fluxo | `-18` a `+18` |
| Derivativos | `-12` a `+12` |
| On-chain e fundamental | `-10` a `+10` |
| Notícias e macro | `-10` a `+10` |
| Histórico semelhante | `-12` a `+12` |
| Ajuste direcional de risco | `-14` a `+14` |

O limite absoluto total dos componentes é `112`. Cada contribuição `s_i` DEVE ser calculada por uma regra identificada e respeitar seu limite. A fonte normativa desses caps no runtime é `RULESET.setupCaps`.

```text
setup_score = round(clamp(Σ(s_i), -100, +100))
```

Componentes indisponíveis contribuem `0` pontos e reduzem o Data Confidence. Se nenhum componente direcional estiver calculável, `setup_score` DEVE ser `null`, e não `0`.

O “Ajuste direcional de risco” é parte do score direcional: positivo favorece a leitura compradora e negativo favorece a leitura baixista ou penaliza a compradora. Ele NÃO representa o Data Confidence e NÃO substitui gestão de risco da posição.

### 7.3 Interpretação operacional provisória v1

As faixas abaixo preservam a linguagem atual durante a migração. Elas são heurísticas, não probabilidades calibradas:

| Condição | Leitura |
| --- | --- |
| `score >= +60`, MTF de alta, alinhamento `>= 0,60` e Data Confidence `>= 63` | Entrada favorável |
| `score >= +42` e MTF não negativo | Entrada com confirmação |
| `+20` a `+41` | Aguardar pullback/confirmação |
| `-19` a `+19` | Sem entrada clara |
| `-41` a `-20` | Cautela |
| `score <= -42` e MTF não positivo | Entrada vendedora com confirmação, sujeita aos mesmos gates |
| `score <= -60`, MTF de baixa, alinhamento `>= 0,60` e Data Confidence `>= 63` | Entrada vendedora favorável, sujeita aos mesmos gates |
| `score = null` | Setup indisponível |

Qualquer chamada operacional DEVE mostrar Data Confidence. Com Data Confidence abaixo de `40`, a interface DEVE substituir a chamada operacional por “dados insuficientes”, sem alterar o valor direcional calculado. A alteração futura dessas faixas exige nova versão de modelo e validação histórica.

## 8. Data Confidence

### 8.1 Finalidade

Data Confidence mede somente quanto dos dados esperados está válido, atual e com proveniência adequada. Ele NÃO mede:

- chance de acerto;
- qualidade preditiva do modelo;
- intensidade do movimento;
- convicção subjetiva;
- segurança financeira da operação.

### 8.2 Cálculo

Para cada métrica esperada `j` de um componente, o registro do modelo define uma importância relativa `m_j`. Se não houver pesos internos explícitos, as métricas esperadas do componente têm pesos iguais.

```text
validity_j   = 1 para fresh/fresh_fallback válido; 0 nos demais estados
freshness_j  = 1 para fresh/fresh_fallback; 0 para stale e demais estados
provenance_j = 1 para fonte nativa/primária
               fator registrado para fallback equivalente
               0 para proxy_info ou escopo incompatível

metric_quality_j = validity_j × freshness_j × provenance_j
component_quality_i = Σ(m_j × metric_quality_j) / Σ(m_j)
```

O Data Confidence usa os pesos nominais do Radar Score e, no Setup Score, os limites absolutos dos componentes:

```text
radar_data_confidence = round(100 × Σ(w_i × component_quality_i) / 100)
setup_data_confidence = round(100 × Σ(cap_i × component_quality_i) / 112)
```

O fator padrão v1 de um fallback equivalente é `0,80`, salvo valor diferente explicitamente registrado e testado. Fallback equivalente significa a mesma métrica, unidade, janela e semântica; não significa proxy de outro ativo.

### 8.3 Faixas de comunicação

| Data Confidence | Rótulo |
| ---: | --- |
| `80–100` | Alta cobertura |
| `60–79` | Cobertura moderada |
| `40–59` | Cobertura baixa |
| `0–39` | Dados insuficientes |

O Data Confidence NÃO DEVE ser usado como multiplicador do score. Direção e qualidade dos dados permanecem dimensões separadas.

## 9. Proxies de BTC e escopo dos dados

Toda fonte DEVE declarar seu escopo:

- `symbol`: dado nativo do ativo avaliado;
- `BTC`: dado específico de Bitcoin;
- `network`: dado de uma rede com mapeamento explícito para o ativo;
- `market`: dado genuinamente amplo, como VIX ou condição macro.

Na versão 1:

1. Opções de BTC, mempool/fees do Bitcoin, métricas on-chain de Bitcoin e fluxos de ETF de BTC são nativos para BTC.
2. Para qualquer altcoin, esses dados NÃO DEVEM contribuir nos blocos específicos de derivativos, fundamental/on-chain, institucional, fluxo ou risco do ativo.
3. Eles PODEM ser mostrados em um painel separado como `proxy_info`, com o rótulo “Proxy BTC — não entra no score deste ativo”.
4. Um dado de escopo `market` PODE entrar apenas no bloco macro/contexto definido para todos os ativos. Transformar uma métrica BTC em “mercado” para contornar esta regra é proibido.
5. Um mapeamento rede–ativo DEVE ser explícito, versionado e testado; sem mapeamento, a informação é indisponível para o score.
6. Habilitar no futuro um proxy direcional exige justificativa, limite de peso, evidência histórica, indicação visual e nova versão do modelo.

Para altcoins, um proxy BTC tem contribuição `0`, peso efetivo `0` e crédito `0` no Data Confidence específico do ativo.

## 10. Explicação e rastreabilidade

Cada item em `components` DEVE expor:

| Campo | Conteúdo |
| --- | --- |
| `component_id` e `label` | Identidade estável e nome legível |
| `rule_id` | Regra exata que gerou o valor |
| `raw_value` | Valor anterior à normalização, quando aplicável |
| `normalized_value` | Valor direcional normalizado |
| `nominal_weight` ou `cap` | Peso do Radar ou limite do Setup |
| `effective_weight` | Peso efetivamente usado |
| `contribution` | Pontos assinados no resultado final |
| `status` | Estado canônico do componente |
| `sources` | `source_id` de todas as entradas utilizadas |
| `observed_at` e `fetched_at` | Horários UTC das entradas |
| `age_ms` e `stale_after_ms` | Idade e limite de atualidade |
| `scope` | `symbol`, `BTC`, `network` ou `market` |
| `is_proxy` | Booleano obrigatório |
| `reason` | Explicação curta e determinística da contribuição |

A interface DEVE mostrar, no mínimo, versão do modelo, horário do cálculo, último candle fechado, Data Confidence e contribuição assinada por bloco. Fonte, idade, peso e regra DEVEM estar disponíveis sem consultar código ou console.

Regras de reconciliação:

- a soma das contribuições não arredondadas DEVE reproduzir o score bruto;
- a diferença entre soma visual e score final PODE ser apenas a do arredondamento documentado;
- componentes indisponíveis DEVEM permanecer na explicação com contribuição `0` e causa explícita;
- valores `null`, `NaN`, infinito ou unidade incompatível NÃO DEVEM chegar à fórmula;
- o texto explicativo DEVE ser derivado dos mesmos valores que produziram o score.

## 11. Versionamento e reprodutibilidade

`model_version` segue versão semântica:

- **major**: muda o significado, escala, objetivo ou estrutura principal de um score;
- **minor**: muda pesos, regras, thresholds, componentes, fontes elegíveis, tratamento de proxy ou atualidade e pode alterar resultados;
- **patch**: documentação ou implementação sem mudança intencional do resultado.

Mesmo em correção patch, qualquer diferença numérica observada nos fixtures DEVE ser declarada. `ruleset_hash` muda sempre que regras, pesos, registro de fontes ou política de atualidade mudam.

Um registro histórico de sinal DEVE persistir `model_version`, `ruleset_hash`, snapshot, componentes e Data Confidence. Resultados de versões diferentes NÃO DEVEM ser agregados em backtests como se fossem homogêneos.

Dado o mesmo snapshot, horário de referência, versão e regras, o resultado DEVE ser idêntico independentemente de ordem de chegada das respostas, navegador ou execução.

Checkpoint Codex `preview.7-codex.2`: o export schema 3 inclui `rawEvidence` schema 1, capturado no mesmo limite sincrono do `inputSnapshotId`. Doze datasets carregam payload normalizado, fontes registradas, horario observado, contagem/tamanho canonicos e hash individual; o manifesto e o envelope possuem verificacao de integridade apos serializacao JSON. Um arquivo real BTC/5m foi reaberto com 500 candles spot, seis timeframes, sete series de derivativos e 3.252 candles diarios. O fechamento permanece **AGUARDANDO CLAUDE CODE** e nao substitui a pendencia de persistencia duravel de sinais.

Checkpoint de persistencia Codex: o codigo inclui namespace privado com hash, conciliacao sem apagar outcomes, retencao de pendentes, Redis e worker cron que escolhe o primeiro candle fechado no/depois de 1h, 24h e 7d. A troca concorrente de namespace invalida a transacao anterior para impedir mistura entre journals. Esses contratos possuem testes locais, mas Redis e `CRON_SECRET` ainda nao foram provisionados nem comprovados na Vercel; portanto a exigencia de persistencia remota continua operacionalmente aberta.

## 12. Critérios de aceitação v1

A implementação só está em conformidade quando todos os itens abaixo possuírem testes automatizados:

1. **Separação semântica:** o dashboard usa Radar Score; a tela do ativo usa Setup Score; ambos mostram seu próprio Data Confidence.
2. **Determinismo:** o mesmo fixture e horário de referência produzem exatamente os mesmos resultados e contribuições.
3. **Reconciliação:** cada total corresponde à fórmula e à soma de contribuições dentro da tolerância exclusiva de arredondamento.
4. **Ausência:** remover cada fonte/bloco, um por vez, não cria viés artificial; reduz o Data Confidence esperado.
5. **Zero versus ausente:** `null`, campo inexistente e falha de rede nunca são convertidos para cotação, variação ou contribuição zero.
6. **Staleness:** ultrapassar `stale_after_ms` exclui o valor do score, preserva-o apenas como dado antigo e reduz o Data Confidence.
7. **Fallback:** fallback equivalente mantém a semântica, recebe o fator de proveniência registrado e fica rastreável.
8. **Candle aberto:** variar apenas o candle em formação não altera scores confirmados, padrões confirmados nem o último candle fechado registrado.
9. **Multi-timeframe:** cada timeframe usa seu próprio último candle fechado; falha parcial não invalida os demais e reduz a cobertura.
10. **Proxy BTC:** adicionar ou remover opções, mempool, on-chain ou ETF de BTC não altera o score específico de uma altcoin.
11. **Escopo:** todas as contribuições carregam símbolo, timeframe e snapshot corretos; respostas obsoletas ou cruzadas são descartadas.
12. **Limites:** Radar e Setup permanecem entre `-100` e `+100`; Data Confidence permanece entre `0` e `100`.
13. **Incalculável:** ausência de todos os componentes resulta em `score = null`, `data_confidence = 0` e estado `unavailable`.
14. **Rastreabilidade:** fonte, horários, idade, peso/cap, regra, status e contribuição estão presentes para todos os componentes.
15. **Versão:** qualquer fixture alterado por mudança de regra exige versão e `ruleset_hash` novos, com diferença aprovada.
16. **Fixtures mínimos:** alta, baixa, lateralização, pouca liquidez, fonte parcial, TradFi `null`, fonte `stale`, fallback, candle aberto extremo, altcoin com proxies BTC e timestamps futuros.
17. **Comunicação:** nenhum texto chama Data Confidence de chance de acerto e nenhum score é mostrado como recomendação garantida.

## 13. Plano de migração do legado

### Fase 0 — congelar e observar

1. Registrar fixtures e snapshots do comportamento atual antes de corrigir fórmulas.
2. Mapear os conceitos legados:
   - score do radar atual → `Radar Score`;
   - confluência individual atual → `Setup Score`;
   - `dataQuality`/confiança atual → substituído por `Data Confidence` deste contrato;
   - aliases genéricos como `analysis.score`, `coreScore` e “Score” → deprecados.
3. Registrar divergências conhecidas como dívida de migração, sem tratá-las como baseline correto.

### Fase 1 — criar o núcleo v1 em paralelo

1. Extrair regras para funções puras sem dependência de interface ou estado global.
2. Criar o registro versionado de fontes, limites de atualidade e regras.
3. Implementar o envelope, estados, timestamps, componentes e fórmulas deste contrato.
4. Rodar legado e v1 lado a lado sobre os mesmos snapshots, sem trocar a UI principal.
5. Classificar cada diferença como correção intencional, diferença de arredondamento ou regressão.

### Fase 2 — corrigir semântica antes da troca

1. Excluir candles em formação dos resultados confirmados.
2. Remover proxies BTC das contribuições de altcoins.
3. Parar conversões de ausente/`null` para zero.
4. Aplicar staleness, fallback equivalente e falhas parciais.
5. Garantir identidade imutável de símbolo, timeframe e snapshot durante requisições concorrentes.
6. Aprovar fixtures dourados com as diferenças intencionais documentadas.

### Fase 3 — migrar a apresentação

1. Substituir rótulos genéricos por `Radar Score`, `Setup Score` e `Data Confidence`.
2. Exibir versão, horário, candle fechado, fontes e contribuições.
3. Marcar dados antigos, fallbacks e proxies de forma visível.
4. Colocar resultados v1 atrás de uma chave de ativação com rollback para comparação.
5. Manter telemetria de divergência e erros durante o período de observação.

### Fase 4 — encerrar o legado

O legado só PODE ser removido quando:

- todos os critérios de aceitação estiverem verdes;
- as diferenças entre legado e v1 estiverem explicadas e aprovadas;
- não houver alias genérico sendo consumido pela interface;
- logs e sinais persistirem a versão completa do modelo;
- houver rollback testado;
- uma janela de observação definida não apresentar mistura de ativo/timeframe, `NaN`, score sem explicação ou dado `stale` influenciando resultado.

Após a troca, qualquer backtest, relatório ou comparação DEVE segmentar resultados por versão do modelo.

### Estado da migração no runtime preview.7-codex.2

- **Fase 0:** parcialmente concluída; fixtures, snapshots, divergências e ledger existem, mas o comportamento histórico ainda não está preservado em uma base durável.
- **Fase 1:** parcialmente concluída; existe núcleo puro, registro normativo de 22 fontes e envelope schema 3 com 12 datasets/series verificáveis. A cobertura integral ainda depende de revisão independente e de referências duráveis fora do arquivo exportado.
- **Fase 2:** parcialmente concluída; candles fechados, proxies, ausências, staleness, concorrência, calendário ETF e override manual auditável foram endurecidos, mas a conformidade de todas as fontes ainda precisa ser demonstrada ponta a ponta.
- **Fase 3:** parcialmente concluída; rótulos, contribuições, horários e estados degradados estão visíveis, mas ainda não existem feature flag, telemetria de divergência e rollback operacional testado.
- **Fase 4:** bloqueada pelos itens anteriores. O legado não foi formalmente encerrado.

Portanto, o runtime **NÃO É CONFORME** ao contrato v1 neste checkpoint. Testes verdes demonstram regressão controlada no escopo exercitado, não conformidade integral. Todas as mudanças desta revisão foram feitas via Codex e permanecem **AGUARDANDO CLAUDE CODE**.

## 14. Fora do escopo desta versão

Ainda não fazem parte do contrato v1:

- probabilidade calibrada de alta ou baixa;
- taxa de acerto esperada;
- otimização de pesos por backtest;
- tamanho recomendado de posição;
- preço oficial de liquidação;
- garantia de qualidade de uma fonte externa;
- uso direcional de proxies BTC em altcoins.

Esses itens só podem ser adicionados com metodologia própria, validação fora da amostra e nova versão do contrato/modelo.
