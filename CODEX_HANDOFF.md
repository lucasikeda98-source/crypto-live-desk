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
- Estado: **AGUARDANDO CLAUDE CODE**
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
- Estado: **AGUARDANDO CLAUDE CODE**
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
- Estado: **AGUARDANDO CLAUDE CODE**
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
- Estado: **AGUARDANDO CLAUDE CODE**
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

### CX-005 — Ciclo D fase 1: microestrutura e CFTC

- Data: 2026-07-12
- Responsavel: Codex
- Branch: `codex/cycle-d-sources`
- Base: `8d18107`
- Estado: **AGUARDANDO CLAUDE CODE**
- Escopo:
  - Versao de desenvolvimento elevada para `1.0.0-preview.6`.
  - Nova rota `api/market-microstructure.js` consulta ate 1.000 aggTrades Binance e tickers publicos Binance, Coinbase, Bybit e OKX.
  - CVD usa o campo Binance `m` para separar agressao compradora e vendedora em notional de cotacao.
  - Comparacao cross-venue calcula mediana, dispersao e Coinbase premium vs Binance.
  - Fonte oficial CFTC Legacy Futures Only adicionada ao proxy institucional para o contrato Bitcoin CME (`133741`).
  - Interface ganhou paineis de Microestrutura cross-venue e CFTC COT.
  - Todas as novas leituras permanecem informativas e fora de Radar Score, Setup Score e Data Confidence.
- Fontes primarias conferidas:
  - Binance Spot API / aggTrades.
  - Coinbase Exchange / product ticker.
  - Bybit V5 / market tickers.
  - OKX V5 / market ticker.
  - CFTC Public Reporting Environment, dataset Legacy Futures Only `6dca-aqww`.
- Validacao Codex:
  - 98 de 98 testes deterministas aprovados.
  - Consulta real BTC retornou quatro venues, 1.000 aggTrades e nenhuma falha de fonte.
  - Painel local exibiu CVD, imbalance, Coinbase premium, dispersao e quatro venues sem erros de console.
  - CFTC real exibiu relatorio de 07/07/2026: non-commercial net +3.500, variacao -270, commercial net -3.217 e OI 18.832 contratos.
- Limitacoes conhecidas:
  - CVD cobre somente os ultimos 1.000 aggTrades, nao uma serie acumulada de longo prazo.
  - Coinbase pode nao listar todos os ativos em par USD; falha parcial fica explicita e nao invalida os demais venues.
  - CFTC e contexto semanal de Bitcoin/CME e nao deve ser aplicado como posicionamento especifico de cada altcoin.
  - CoinGecko derivatives, unlocks DeFiLlama, calendario macro e FRED ainda nao fazem parte desta fase.
- Revisao futura solicitada:
  - Confirmar a interpretacao do campo Binance `m`, unidades CFTC e politica de manter as fontes fora dos scores.

## Revisoes do Claude Code

Nenhuma revisao registrada ate o momento.
