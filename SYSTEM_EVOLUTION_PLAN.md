# Plano mestre de evolucao — Crypto Live Desk

Data-base: 2026-07-13  
Estado: **EM EXECUCAO — FASE 1 (gate de codigo da Fase 0 verde; verificacoes externas pendentes)**  
Revisao conceitual: **REVISADO PELO CLAUDE CODE — COM RESSALVAS (REV-CC-02, 2026-07-17)** — plano solido-com-ressalvas; emendas obrigatorias incorporadas abaixo (ver blocos "EMENDA REV-CC-02")

## EMENDAS REV-CC-02 (2026-07-17) — vinculantes antes de executar as fases citadas

1. **Fase 4 — risco geo 451 e split.** A migracao dos klines para proxy /api NAO pode assumir que a Vercel alcanca a Binance: runners US ja recebem HTTP 451 e as funcoes Vercel rodam em regioes US por padrao. Antes de executar: fixar regiao da funcao (ex.: gru1/cdg1) OU validar venue alternativa (data-api.binance.vision) do datacenter, com fallback documentado. A Fase 4 fica DIVIDIDA: 4a = proxy/microestrutura basica; 4b = derivativos avancados (vol surface, dispersao, cross-venue). Cada sub-fase com gate proprio.
2. **Taxonomia de estados — mapeamento normativo.** O envelope (`ok/partial/stale/invalid/missing/error/proxy`) mapeia para o contrato analitico assim: `ok->fresh`, `partial->fresh_fallback` (credito parcial), `stale->stale`, `invalid->invalid` (INELEGIVEL para score — aplicado em app.js desde CC-FIX-04), `missing->missing`, `error->error`, `proxy->proxy_info`. Qualquer divergencia futura exige teste que falhe.
3. **Fase 9 antecipada.** Rotacao de segredos, limites de storage/custo, CI deterministico e runbook de rollback sao PRE-REQUISITOS continuos a partir da Fase 2 — nao capstone. Itens de seguranca/CI da Fase 9 migram para o gate de saida de cada fase.
4. **Fase 0 — fechamento.** `run.json` foi removido (CC-FIX-03); boot-check reexecutado verde no ambiente permitido (2026-07-17, inclusive com dados ao vivo). Pendencia remanescente da Fase 0: somente `npm run test:browser` (smoke autoritativo) antes do proximo release.
5. **Licencas em producao.** Auditar termos do CoinGecko/CoinPaprika (free tier, atribuicao) para dashboard publico — o criterio `licenseClass` do proprio plano vale tambem para as fontes JA em uso, nao so para as novas.
6. **Retencao e custo.** Toda serie temporal nova (FRED vintages, BLS, telemetria) entra com politica declarada de retencao/TTL e estimativa de custo mensal Upstash; teto operacional definido antes da Fase 3.

## 1. Objetivo

Transformar o Crypto Live Desk de um painel analitico amplo em uma plataforma de decisao auditavel, profissional e estatisticamente defensavel. O produto deve responder, nesta ordem:

1. O dado e confiavel e esta fresco?
2. Qual e o regime atual e o que mudou?
3. Existe uma oportunidade ou um risco relevante?
4. Quais evidencias independentes sustentam ou contradizem essa leitura?
5. Qual evento invalida a tese e qual e o risco de execucao?
6. O modelo demonstrou valor fora da amostra, depois de custos?

O objetivo nao e maximizar a quantidade de indicadores. Novas fontes so entram quando acrescentam informacao ortogonal, melhoram a confiabilidade ou reduzem um ponto cego operacional.

## 2. Principios de produto e dados

- **Qualidade antes de score:** nenhum dado ausente, stale, futuro, revisado ou usado como proxy pode parecer evidencia plena.
- **Evento e disponibilidade separados:** registrar quando o fato aconteceu e quando ficou disponivel ao sistema, evitando look-ahead em historico e backtest.
- **Proveniencia visivel:** fonte, unidade, escopo, horario, atraso, cobertura, transformacao, licenca e fallback acompanham cada metrica.
- **Fontes independentes antes de fontes redundantes:** evitar somar varias leituras derivadas do mesmo preco, volume ou posicionamento.
- **Informativo por padrao:** uma fonte nova nasce fora dos scores. Ela so ganha peso depois de contrato, teste causal, amostra suficiente e revisao de dupla contagem.
- **Progressive disclosure:** a primeira tela orienta; detalhes tecnicos ficam disponiveis sem dominar a decisao.
- **Sem falsa precisao:** score heuristico nao e probabilidade; taxa de acerto sem amostra e intervalo nao e evidencia.
- **Release rastreavel:** mudanca de regra exige versao, hash, golden fixtures, journal segmentado e comparacao antes/depois.

## 3. Estado observado

### Pontos fortes

- Cobertura ampla: spot, futuros, opcoes, microestrutura, on-chain, DeFi, ETF, CFTC, macro, TradFi, noticias e journal.
- Separacao conceitual entre Radar Score, Setup Score e Data Confidence.
- Registro normativo de fontes, snapshots exportaveis e contratos de freshness.
- Testes adversariais, fuzz numerico, scripts Lua executados em VM e gates de navegador.
- Interface responsiva sem overflow horizontal do documento nos viewports auditados.

### Lacunas prioritarias

- A arvore local esta suja e o gate falha porque o `rulesetHash` mudou sem reconciliacao.
- A qualidade dos dados aparece como um percentual agregado, mas nao como um painel operacional de fonte, atraso, cobertura e degradacao.
- O navegador ainda consulta fontes externas diretamente; isso fragmenta cache, observabilidade, CORS, rate limit e reprodutibilidade.
- A interface e densa, mistura diagnostico, qualidade, contexto e acao, e repete `preview` em excesso.
- A navegacao secundaria e horizontal no mobile; itens importantes ficam fora da primeira dobra.
- O journal ainda tem amostra insuficiente para validar o modelo e a simulacao nao incorpora todos os custos de execucao.
- Documentos de estado se contradizem sobre producao, contagem de testes e infraestrutura.

## 4. Arquitetura-alvo

### 4.1 Camada de ingestao

Cada fonte deve possuir um adaptador server-side isolado com:

- allowlist de parametros e simbolos;
- deadline absoluto, retry limitado e backoff com jitter;
- cache stale-while-revalidate;
- validacao de schema e de semantica upstream;
- rate limit por fonte e por consumidor;
- circuit breaker e status de degradacao;
- telemetria de latencia, erro, cache hit e quota;
- fixture contratual versionada.

Chamadas externas relevantes devem migrar do navegador para `/api/*`. O cliente recebe um contrato interno estavel; mudancas upstream ficam contidas nos adaptadores.

### 4.2 Envelope unificado de dados

Todo dataset normalizado deve publicar, no minimo:

- `datasetId`, `schemaVersion`, `sourceId` e `sourceTier`;
- `entity`, `symbol`, `venue`, `timeframe` e `grain`;
- `observedAt`, `availableAt`, `retrievedAt`, `cacheStoredAt` e `expiresAt`;
- `unit`, `currency`, `timezone` e politica de arredondamento;
- `status`: `ok`, `partial`, `stale`, `invalid`, `missing` ou `proxy`;
- `coverage`, `completeness`, `latencyMs` e `qualityFlags`;
- `provenance`, `fallbackUsed`, `revision` e `licenseClass`;
- `errors` tipados e mensagem publica sanitizada;
- hash do payload normalizado para identidade e replay.

Para macro e dados revisaveis, acrescentar `vintageAt` e guardar a primeira publicacao quando ela for usada em backtest.

### 4.3 Camada semantica

- Um catalogo canonico define metrica, formula, unidade, sinal esperado, escopo e owner.
- Transformacoes puras ficam fora da UI.
- Joins temporais usam `availableAt <= decisionAt`.
- Dados de ativo, mercado, venue e proxy nao podem ser misturados sem rotulo e fator de proveniencia.
- Cada contribuicao do score referencia os datasets que a produziram.

### 4.4 Camada de decisao

Separar cinco saidas:

1. **Regime:** tendencia, volatilidade, liquidez e macro.
2. **Setup:** direcao, gatilho, confirmacoes e contradicoes.
3. **Risco:** invalidacao, stop estrutural, liquidez, slippage e concentracao.
4. **Catalisadores:** eventos futuros e fatos recentes capazes de alterar a tese.
5. **Evidencia:** historico comparavel, amostra, intervalo, custo e desempenho por versao.

## 5. Roadmap de execucao

### Fase 0 — estabilizacao e baseline

Objetivo: voltar a ter uma base confiavel antes de ampliar o produto.

- [x] Preservar a arvore local preexistente e registrar autoria/escopo sem apagar trabalho anterior.
- [x] Resolver o `rulesetHash` sem criar uma versao analitica artificial para utilitario de rede.
- [x] Corrigir sanitizacao de erros internos.
- [x] Corrigir perda de exclusividade quando o lock entre abas perde heartbeat.
- [x] Implementar limite global atomico de registros no Redis, alem do limite por namespace.
- [x] Cobrir o fallback do parser macro e os novos ramos de degradacao.
- [ ] Decidir com o proprietario o destino de `run.json`; o arquivo foi preservado por ser preexistente e nao rastreado.
- [x] Reconciliar README, handoffs, ledger, contagem de testes e estado de producao para o lote CX-012.
- [x] Executar suite, cobertura e checks estaticos locais.
- [ ] Reexecutar audit de dependencias, boot e smoke nos ambientes que permitam rede e processo de navegador.

**Criterio de saida:** arvore deliberada, 100% dos testes aprovados, cobertura acima dos pisos, documentacao coerente e entrada `AGUARDANDO CLAUDE CODE` completa.

### Fase 1 — qualidade, proveniencia e observabilidade de dados

Objetivo: tornar a confiabilidade do dado verificavel antes de qualquer nova fonte.

- [x] Implementar o envelope unificado e migrar a rota piloto `market.overview.v1`.
- [x] Criar validadores reutilizaveis de timestamp, range, ordenacao, duplicidade e staleness; validadores de unidade por dataset continuam na migracao das rotas.
- [x] Introduzir `availableAt`, `vintageAt` e elegibilidade bitemporal; o piloto macro declara explicitamente que valores atuais sem primeira publicacao nao sao seguros para backtest.
- [x] Criar a primeira definicao de SLA para o dataset piloto; expandir para o catalogo permanece pendente.
- [x] Criar health registry piloto limitado por instancia com latencia p50/p95, erros, cache hit, fallback e ultimo sucesso; agregacao distribuida e eventos 429 permanecem para a fase operacional.
- [x] Criar o primeiro bloco “Saude dos dados” com status, cobertura, latencia, qualidade e hash do piloto.
- [x] Centralizar sanitizacao de erro publico e tipagem basica de falhas; migracao de todos os envelopes permanece pendente.
- [ ] Migrar chamadas externas do browser para proxies server-side por prioridade.
- [x] Criar contratos e testes de schema drift para mercado e macro.
- [ ] Adicionar fixtures reais minimizadas e expandir schema drift para as demais rotas.

**Criterio de saida:** nenhuma metrica de score sem envelope, freshness e proveniencia; degradacao parcial visivel; replay deterministico do snapshot.

### Fase 2 — experiencia e hierarquia profissional

Objetivo: reduzir carga cognitiva e orientar a decisao.

- [ ] Redesenhar a home em quatro blocos: Regime, Oportunidades, Riscos e Catalisadores.
- [ ] Manter qualidade do dado separada da leitura direcional.
- [x] Substituir repeticoes de `preview` por um selo unico de versao/modelo.
- [ ] Reorganizar Ativo em: Tese, Evidencias, Mercado, Derivativos, On-chain, Eventos, Risco e Journal.
- [ ] Exibir primeiro “o que mudou desde o snapshot anterior”.
- [ ] Criar resumo de tese com confirmacoes, contradicoes e invalidacao.
- [ ] Melhorar estados loading, vazio, partial, stale e erro.
- [x] Trocar navegacao horizontal mobile por controle compacto e acessivel e limpar estados `aria-pressed` quando a area do ativo esta oculta.
- [ ] Revisar contraste, foco, leitura por teclado, zoom 200% e anuncios de estado.
- [ ] Reduzir texto tecnico exposto por padrao; manter glossario contextual sob demanda.

**Criterio de saida:** tarefas “entender regime”, “abrir ativo”, “identificar tese” e “ver risco” executaveis sem procurar em varias abas; desktop e 390 px auditados visualmente.

### Fase 3 — fontes gratuitas de maior valor

Objetivo: adicionar informacao ortogonal com baixo custo operacional.

#### Macro e liquidez global

- [ ] FRED/ALFRED: DXY amplo, real yield 10Y, Fed balance sheet, TGA, RRP, M2, high-yield spread e condicoes financeiras.
- [ ] BLS: CPI, payroll, desemprego e PPI com status preliminar/revisado.
- [ ] Calendario de releases FRED/BLS com `scheduledAt`, `releasedAt`, consenso quando licenciado e surpresa somente quando comparavel.

#### On-chain e rede

- [ ] Expandir Coin Metrics Community somente apos consultar o catalogo por ativo.
- [ ] Priorizar realized cap/MVRV, SOPR, new/funded addresses, fees e supply age quando realmente disponiveis na camada Community.
- [ ] Etherscan V2: gas/base fee para Ethereum e redes suportadas, inicialmente informativo.

#### Eventos e expectativas

- [ ] Polymarket publico: probabilidades de eventos macro/regulatorios selecionados, com liquidez, resolucao e risco de mercado fino.
- [ ] SEC EDGAR: filings de emissores/tesourarias cripto e ETFs escolhidos, via proxy com politica de uso e User-Agent adequados.

**Criterio de saida:** cada fonte com contrato, licença verificada, cache, testes, health e exibicao informativa; nenhuma entra automaticamente no score.

### Fase 4 — microestrutura, futuros e opcoes

Objetivo: melhorar timing, liquidez e risco de execucao.

- [ ] CVD multi-horizonte, volume profile e agressao por janela, nao apenas ultimos 1.000 trades.
- [ ] Profundidade e slippage a 0,1%, 0,5% e 1% por venue.
- [ ] Spread, dislocacao cross-venue e qualidade de preco com timestamps comparaveis.
- [ ] Funding, basis e OI por venue; dispersao e crowding cross-venue.
- [ ] Liquidacoes por janela e venue com cobertura declarada.
- [ ] Deribit: term structure de IV, skew 25-delta, risk reversal, butterfly e concentracao de OI por strike/vencimento.
- [ ] Separar medidas observadas de inferencias como gamma exposure; documentar hipoteses.
- [ ] Proxyar Binance Futures para eliminar a dependencia de CORS/regiao do browser.

**Criterio de saida:** painel distingue preco, posicionamento, volatilidade e liquidez; custos de execucao entram na simulacao, nao no score direcional sem validacao.

### Fase 5 — macro, institucional e catalisadores

Objetivo: modelar mudancas de regime e eventos, sem usar noticia como numero magico.

- [ ] Regime de liquidez global e stress de credito.
- [ ] Calendario economico com janela pre/post-evento.
- [ ] CFTC Traders in Financial Futures quando aplicavel, separando dealers, asset managers e leveraged funds.
- [ ] ETF: fluxo, AUM, volume, premium/discount e cobertura por emissor quando licenciado.
- [ ] Classificador de noticias por entidade, tema, novidade, fonte e horizonte.
- [ ] Deduplicacao semantica e agrupamento de uma historia em um unico evento.
- [ ] Linha do tempo de catalisadores: macro, regulatorio, unlock, upgrade, governance e earnings de proxies.
- [ ] Overrides manuais continuam auditaveis e separados de dados automaticos.

**Criterio de saida:** cada catalisador informa horario, estado, fonte, novidade e possivel mecanismo; ausencia nunca vira neutro automatico.

### Fase 6 — DeFi, stablecoins, tokenomics e on-chain avancado

Objetivo: medir fluxos fundamentais, nao apenas niveis.

- [ ] TVL change de 1d/7d/30d e fluxo ajustado por preco.
- [ ] Stablecoin supply por chain, mint/burn e migracao entre chains.
- [ ] Fees, revenue, active users e DEX volume com cobertura e metodologia.
- [ ] Lending utilization, borrow rates e risco de liquidacao por protocolo selecionado.
- [ ] Bridge inflows/outflows e fragmentacao de liquidez.
- [ ] Token unlocks/emissions e diluicao projetada.
- [ ] Yields separados em base, incentivos e risco do protocolo.
- [ ] Avaliar DefiLlama Pro apenas se unlocks/bridges/yields justificarem custo e licença.

**Criterio de saida:** painel fundamental explica variacao e fluxo; dado pago so e contratado depois de um teste de valor e custo.

### Fase 7 — risco, portfolio e execucao

Objetivo: transformar leitura de mercado em decisao de risco reproduzivel.

- [ ] Watchlists e portfolio opcional com exposicao por ativo, narrativa, chain e beta.
- [ ] Correlacao e beta rolling com cobertura e estabilidade.
- [ ] Volatilidade, drawdown, VaR/CVaR historico e stress scenarios, sempre com limitacoes.
- [ ] Position sizing por risco, stop e liquidez.
- [ ] Custo estimado: spread, slippage, fees e funding.
- [ ] R:R liquido e invalidacao estrutural.
- [ ] Alertas por mudanca de tese, qualidade do dado e risco, nao apenas threshold de score.
- [ ] Paper trading com fills causais, custos e politicas stop-first.

**Criterio de saida:** toda tese possui invalidacao, risco financeiro, custo estimado e tamanho coerente; simulacao nao usa fill impossivel.

### Fase 8 — validacao estatistica e governanca do modelo

Objetivo: descobrir se o modelo agrega valor e onde falha.

- [ ] Congelar snapshots por versao e horizonte.
- [ ] Medir coverage, precision direcional, retorno, R, MAE/MFE e drawdown.
- [ ] Segmentar por regime, ativo, timeframe, gatilho e qualidade de dado.
- [ ] Usar intervalos, tamanho minimo e correcao para multiplas comparacoes.
- [ ] Walk-forward e out-of-sample; nunca recalcular passado com dado revisado atual.
- [ ] Comparar com baselines simples: buy-and-hold, momentum e random estratificado.
- [ ] Calibrar probabilidade somente se houver amostra e estabilidade suficientes.
- [ ] Monitorar drift de features, cobertura, performance e fonte.
- [ ] Criar processo de promocao/deprecacao de regra.

**Criterio de saida:** nenhuma alegacao de eficacia sem baseline, custos, intervalo e amostra; regras fracas podem ser removidas com evidencia.

### Fase 9 — operacao, seguranca e release

Objetivo: operar de forma previsivel e auditavel.

- [ ] Observabilidade por rota, fonte, cache, quota, cron e backlog.
- [ ] SLOs e alertas: disponibilidade, freshness, erro, latencia e drenagem do worker.
- [ ] Limites globais de armazenamento e abuso; rotacao de segredo e isolamento de namespace.
- [ ] Politica de dados/licencas e inventario de chaves.
- [ ] Teste de carga, caos de upstream e recuperacao de Redis.
- [ ] Migrar trabalho ativo para clone fora do OneDrive.
- [ ] CI completo em Node suportado, browser gate deterministico e smoke pre-release.
- [ ] Preview, diff de contrato, revisao Claude Code, promocao e rollback documentado.

**Criterio de saida:** release reproduzivel, observavel, reversivel e revisada; nenhum estado documental contraditorio.

## 6. Priorizacao de APIs

| Prioridade | Fonte | Valor esperado | Custo/risco | Decisao inicial |
| --- | --- | --- | --- | --- |
| P0 | FRED/ALFRED | Liquidez, juros reais, credito, vintages e calendario | Chave gratuita; cuidado com revisoes | Implementar na Fase 3 |
| P0 | Coin Metrics Community | On-chain adicional e catalogo por ativo | Licenca Community/non-commercial e cobertura desigual | Fazer discovery e piloto |
| P0 | Deribit Public | Skew e term structure de opcoes | Calculo e normalizacao complexos | Expandir adaptador atual |
| P0 | Binance Futures via proxy | Remove CORS/451 e melhora observabilidade | Rate limit e dependencia regional | Migrar antes de novas fontes |
| P1 | BLS Public API | CPI, emprego e revisoes oficiais | Frequencia baixa; chave opcional/limites | Integrar com calendario |
| P1 | Polymarket Public | Expectativas de eventos | Liquidez, selecao e resolucao variam | Informativo, curadoria estrita |
| P1 | SEC EDGAR | Filings e tesourarias institucionais | Parsing, identidade e politica de acesso | Watchlist pequena |
| P1 | Etherscan V2 | Gas e atividade de redes EVM | Chave e limites; overlap on-chain | Gas primeiro |
| P2 | DefiLlama Pro | Unlocks, bridges, yields e inflows | Assinatura e dependencia comercial | Prova de valor antes de contratar |
| P2 | Coin Metrics Pro | Flows/valuation institucionais e mercado | Custo/licenca | Somente apos gap medido |
| P2 | Kaiko/Amberdata/CoinGlass | Dados cross-venue profissionais | Alto custo e licenca | Comparar por RFP curta |

## 7. KPIs do programa

### KPIs primarios

1. **Cobertura confiavel de decisao:** percentual de snapshots em que todos os datasets obrigatorios da decisao estao `ok` e dentro do SLA.
2. **Reprodutibilidade:** percentual de snapshots que reproduzem identidade, inputs e resultado exatamente em replay.
3. **Valor fora da amostra:** retorno/R e taxa direcional contra baseline, liquidos de custos, por versao e com intervalo.

### Drivers

- freshness por dataset;
- erro e fallback por fonte;
- cache hit e latencia p95;
- cobertura de proveniencia/unidade/timestamp;
- tempo para identificar tese e invalidacao;
- amostras avaliadas por celula;
- backlog e idade maxima do journal.

### Guardrails

- zero look-ahead confirmado;
- zero `Infinity`/NaN direcional ou ausencia transformada em neutro;
- nenhuma regra promovida sem teste de reversao e revisao;
- nenhuma fonte paga sem ganho incremental demonstrado;
- nenhum score apresentado como probabilidade sem calibracao comprovada.

## 8. Metodo de execucao por lote

Cada lote deve seguir o mesmo ciclo:

1. Definir problema, decisao afetada e risco de dupla contagem.
2. Escrever contrato de dados e criterios de aceite.
3. Implementar adaptador/transformacao isolados.
4. Adicionar fixtures, testes adversariais e degradacao parcial.
5. Integrar primeiro como informativo.
6. Verificar desktop, mobile, teclado e estados de falha.
7. Medir custo, latencia e observabilidade.
8. Atualizar documentacao e `CODEX_HANDOFF.md`.
9. Solicitar revisao Claude Code mantendo `AGUARDANDO CLAUDE CODE`.
10. Promover apenas com gate completo e plano de rollback.

## 9. Fora de escopo ate haver evidencia

- Execucao automatica de ordens ou custodia.
- Promessas de rentabilidade ou recomendacao personalizada.
- IA generativa alterando score sem regra deterministica auditavel.
- Compra imediata de feeds caros sem piloto comparativo.
- Adicionar dezenas de indicadores derivados do mesmo OHLCV.
- Probabilidade de acerto exibida antes de calibracao fora da amostra.

## 10. Proximo lote

O proximo lote continua a **Fase 1**: ampliar o contrato piloto para validadores reutilizaveis, politica bitemporal, health registry e schema drift. A Fase 2 pode corrigir problemas claros de navegacao e acessibilidade em paralelo apenas quando nao alterar regras analiticas; novas APIs continuam informativas ate passarem pelos gates de qualidade.
