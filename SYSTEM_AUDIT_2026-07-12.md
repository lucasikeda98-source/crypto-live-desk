# Crypto Live Desk - auditoria completa

Data: 2026-07-12

> **Registro historico substituido:** este documento preserva o resultado pontual da auditoria original, mas nao representa o estado atual nem aprovacao definitiva. Uma rodada posterior do Codex confirmou inconsistencias que contradizem algumas conclusoes abaixo. O protocolo vigente esta em `AUDIT_LOOP.md` e os achados abertos em `AUDIT_LEDGER.md`. Estado: **AGUARDANDO CLAUDE CODE**.

## Escopo

- Dashboard geral e radar multiativos.
- Resumo, Grafico, Historico e padroes, Futuros, Institucional, Macro e fluxo e Calculadora.
- Desktop e mobile.
- Navegacao, seletores, botoes, estados, APIs, semantica, contraste e console.

## Resultado funcional

| Area | Estado | Validacoes |
| --- | --- | --- |
| Dashboard geral | Aprovado | Ordenacao por score, 24h e volume; Live; atualizacao manual; cards de ativos |
| Timeframes | Aprovado | 16 intervalos Binance; `1 min` e `1 mes` distintos na UI e nos calculos |
| Resumo | Aprovado | Confluencia, analise escrita, noticias, contexto e troca entre 24 pares |
| Grafico | Aprovado | Price action, datas, 16 botoes de tempo, 10 overlays e 4 quantidades de candles |
| Historico | Aprovado | Seis horizontes, padroes tecnicos e plano operacional |
| Futuros | Aprovado | OI, funding, basis, long/short, taker e risco |
| Institucional | Aprovado | Liquidacoes Binance, opcoes Deribit, exchange flows e ETF flows gratuitos |
| Macro e fluxo | Aprovado | Fluxo de capital, TradFi e cobertura analitica |
| Calculadora | Aprovado | Spot, futuros, long, short, taxas, funding, margem, break-even e liquidacao aproximada |
| Mobile | Aprovado | Todas as sete abas sem overflow de pagina |

## Correcoes feitas durante a auditoria

1. Rotulos de `1m` e `1M` alterados para `1 min` e `1 mes` em todos os pontos visiveis.
2. Status do modo manual de noticias corrigido; nao informa mais atualizacao automatica.
3. Atualizacao externa agora redesenha imediatamente macro, fluxo e saude das fontes.
4. Overflow de 7 px no seletor de noticias do Resumo mobile removido.
5. CoinGecko movida para um proxy com cache no backend e fallback gratuito para CoinPaprika.

## APIs

- Market data: 24 ativos, CoinGecko publica com fallback CoinPaprika.
- Opcoes: 870 instrumentos BTC no teste.
- ETF flows: 31 dias, sem chave e sem erros.
- Macro: Treasury e VIX online.
- TradFi: 10 mercados.
- Noticias: 40 itens de 4 fontes.
- Painel: 21/21 fontes online no teste final.

## Acessibilidade e qualidade

- 66 botoes com nome acessivel.
- 26 campos com rotulo.
- 259 IDs sem duplicatas.
- 38 explicacoes de indicadores acessiveis por hover e foco de teclado.
- Nenhum link externo inseguro e nenhum erro de console do aplicativo.
- Contraste medido entre 5.58:1 e 16.78:1 nos estados principais.
- Teste visual nao substitui uma certificacao WCAG completa com leitor de tela.

## Evidencias

As capturas aceitas estao em:

`C:/Users/lucas/.codex/visualizations/2026/07/03/019f25e5-5bc7-70d1-a733-e45c5e366885/system-audit-2026-07-12/`

1. `01-dashboard-geral.png`
2. `02-ativo-resumo.png`
3. `03-grafico-price-action.png`
4. `04-historico-padroes.png`
5. `05-futuros-perpetuos.png`
6. `06-institucional.png`
7. `07-macro-fluxo.png`
8. `08-calculadora.png`
9. `09-mobile-dashboard.png`
10. `10-mobile-grafico.png`
11. `11-mobile-calculadora.png`
