# Runbook operacional — Crypto Live Desk

Estado: **REVISADO PARCIALMENTE PELO CLAUDE CODE (2026-07-13, checkpoint `887ec57`)** — ver `CODEX_HANDOFF.md` REV-CC-01

Este documento define o caminho reproduzivel de desenvolvimento, verificacao, deploy e recuperacao. Ele nao autoriza publicar, mover o repositorio, criar segredos ou alterar recursos externos sem aprovacao do proprietario.

## 1. Fonte de verdade e ambientes

- Repositorio: `lucasikeda98-source/crypto-live-desk`.
- Projeto Vercel vinculado: `crypto-live-desk` (`prj_72XBmbkjMfQZ68uZklCS4bttyS74`).
- Conta/time Vercel: `team_tzjFD9gonqRN2vbfFqSdM6Dt`.
- Producao: `https://crypto-live-desk.vercel.app`.
- Runtime verificado no projeto: Node.js 24.x; o codigo declara Node.js 22 ou superior.
- Branch de trabalho desta rodada: `codex/cycle-d-sources`.
- Baseline remoto anterior: commit `b124fcb68ef06e93f04fcbdc7bbeaa1b329d0324` (preview `READY`).
- Checkpoint atual: commit `887ec57` commitado e pushado para `origin/codex/cycle-d-sources` em 2026-07-13; **ainda nao deployado** (sem preview/producao para este commit).
- Mudancas posteriores ao marco `803eb67` receberam revisao cruzada parcial do Claude Code (REV-CC-01); 24 seguem `AGUARDANDO CLAUDE CODE` com correcao exigida, 7 `CONFIRMADO`.

Nunca concluir que o working tree, um preview e a producao sao equivalentes apenas porque o deploy esta `READY`. Compare commit, branch, URL e contrato exposto.

## 2. Preparacao local limpa

Requisitos: Git, Node.js 22+ e Microsoft Edge para o smoke automatizado no Windows.

```powershell
npm.cmd ci
npm.cmd test
```

Para desenvolvimento:

```powershell
npm.cmd run dev
```

Abra `http://127.0.0.1:5173`. Nao use um servidor iniciado antes da ultima alteracao de rotas como evidencia: reinicie-o para limpar o cache de modulos do Node.js.

## 3. Configuracao duravel

Copie `.env.example` para `.env.local` apenas no ambiente local. Nunca registre segredos no Git, logs, screenshots, handoff ou export analitico.

Variaveis obrigatorias para fechar persistencia e limite distribuido:

- `UPSTASH_REDIS_REST_URL`: endpoint REST do Redis provisionado pelo Vercel Marketplace.
- `UPSTASH_REDIS_REST_TOKEN`: token secreto correspondente.
- `CRON_SECRET`: valor aleatorio com ao menos 24 caracteres; autentica `/api/signal-worker`.

Sem Redis, `GET /api/signals` responde `200` com `configured=false` para uma sondagem silenciosa de capacidade; `POST`/`DELETE` respondem `503`, o cliente preserva o journal local e o rate limit informa escopo por instancia. Esse fallback e degradacao controlada, nao prova de persistencia duravel.

## 4. Gate obrigatorio antes de preview ou release

Execute na ordem:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:coverage
npm.cmd audit --audit-level=high
npm.cmd run audit:inventory
npm.cmd run test:browser
```

Depois, verifique manualmente no navegador:

1. console sem erros ou avisos novos;
2. dashboard, lista, ativo e todas as abas em desktop e 390 px;
3. troca rapida de ativo/timeframe sem dados cruzados;
4. estados de loading, parcial, stale, indisponivel e recuperacao;
5. export schema 3, hashes e envelope bruto;
6. journal: gerar/capturar, sincronizar, recarregar e reencontrar em outro dispositivo;
7. worker: horizonte ainda pendente, horizonte devido, retry e idempotencia;
8. headers de seguranca, cache e `X-RateLimit-Scope`.

Falha em qualquer etapa bloqueia release. Uma segunda tentativa pode diagnosticar oscilacao externa, mas nao transforma falha recorrente em sucesso.

## 5. Prova especifica da persistencia

So marcar `ANL-003`, `OPS-005` e `API-006` como comprovados em producao quando houver evidencia de todos os itens:

1. Redis provisionado e variaveis presentes em preview e producao;
2. `POST /api/signals` persiste sem expor o codigo privado;
3. `GET /api/signals` recupera os mesmos registros em sessao/dispositivo separado;
4. registros com horizonte pendente sobrevivem ao cap e ao TTL;
5. `/api/signal-worker` rejeita segredo ausente/incorreto e processa com o correto;
6. resultado existente nao e sobrescrito por retry;
7. rate limit retorna escopo `distributed` em duas instancias/deploys, sem depender do mapa local;
8. logs nao contêm token, codigo privado nem payload integral do journal.

## 6. Cron e recuperacao

O cron esta configurado para `17 4 * * *`. Ele e retrospectivo: calcula o primeiro candle fechado disponivel no ou depois de cada horizonte e reprograma falhas transitorias. Cada invocacao processa lotes de 100, no maximo 3 lotes/300 registros e ate um budget interno de 24 segundos. A resposta informa `batches`, `backlogMayRemain` e `stopReason`; qualquer `backlogMayRemain=true` exige alerta e nova drenagem, nao pode ser tratado como sucesso completo.

Esse teto cobre aproximadamente um unico cliente continuamente aberto em 5m (288 candles/dia), mas nao cobre dois clientes equivalentes, 1m/1s ou backlog acumulado. No plano Hobby, a propria Vercel limita cron a uma execucao diaria, nao faz retry automatico e recomenda lock + idempotencia porque pode haver overlap ou entrega duplicada ([documentacao oficial](https://vercel.com/docs/cron-jobs/manage-cron-jobs)). Portanto `OPS-012` continua aberto ate existir execucao mais frequente ou fila/workflow duravel e metrica de profundidade do backlog.

O merge de outcome usa Lua `EVAL` porque pipeline reduz round-trips, mas nao e atomico; a documentacao do Upstash confirma que comandos de outros clientes podem intercalar num pipeline ([pipeline/transaction](https://upstash.com/docs/redis/sdks/ts/pipelining/pipeline-transaction), [EVAL](https://upstash.com/docs/redis/sdks/py/commands/scripts/eval)). Essa garantia ainda precisa ser provada contra o Redis real provisionado.

Em incidente:

1. interrompa novas releases;
2. registre deployment, horario UTC, rota, status e request ID sem segredos;
3. verifique erros/runtime logs e saude dos upstreams;
4. se o defeito veio do ultimo deploy, promova o ultimo deployment comprovadamente saudavel;
5. preserve Redis e journals; nao apague dados como primeiro passo;
6. reproduza localmente e adicione regressao antes de republicar;
7. atualize `AUDIT_LEDGER.md` e `CODEX_HANDOFF.md`.

## 7. Saida segura do OneDrive (`OPS-006`)

O working tree atual esta dentro do OneDrive. Nao mover nem copiar a pasta suja: isso pode perder mudancas, duplicar `.git` ou misturar arquivos enquanto o sincronizador atua.

Procedimento recomendado, executado somente apos aprovacao do proprietario:

1. terminar a auditoria e revisar `git status`;
2. criar commits intencionais e fazer push da branch, sem incluir `.env`, `node_modules` ou exports;
3. escolher um destino local nao sincronizado, por exemplo `C:\dev\crypto-live-desk`;
4. clonar novamente do GitHub nesse destino;
5. executar `npm ci` e todo o gate da secao 4 no clone novo;
6. conferir branch, commit e `git status --short` vazio;
7. validar um preview a partir do clone novo;
8. arquivar a copia OneDrive somente depois da equivalencia comprovada.

Se houver mudancas que ainda nao podem ser commitadas, gere antes um patch e um inventario de hashes, guarde-os fora da pasta a ser movida e teste a aplicacao em um clone descartavel. Nunca trate uma copia do Explorador como migracao Git validada.

## 8. Checklist de release

- [ ] Working tree e escopo revisados.
- [ ] Dependencias instaladas pelo `package-lock.json`.
- [ ] Suite, cobertura, audit de dependencias, inventario e browser verdes.
- [ ] Credenciais configuradas sem exposicao.
- [ ] Preview corresponde ao commit candidato.
- [ ] Persistencia/cron/rate limit testados no ambiente candidato.
- [ ] Runtime logs sem novo erro.
- [ ] Documentacao e handoff reconciliados.
- [ ] Rollback conhecido.
- [ ] Revisao independente Claude Code registrada ou pendencia explicitada.
