# Arquitetura — Extra Marketing

Next.js (App Router) + TypeScript + Supabase (Postgres, só pelo servidor). Regra de ouro: **cada coisa mora em um lugar só**. Antes de criar algo novo, procure se já existe aqui.

## Camadas (de baixo para cima)

| Camada | Pasta | O que faz | Pode importar |
|---|---|---|---|
| Domínio puro | `src/lib/domain/` | regras sem banco nem rede: rótulos, datas, indicadores, CSV, Reels, gerador | só ele mesmo |
| Insights puros | `src/lib/insights/calc.ts` | períodos, variação, séries diárias, números compactos | domínio |
| Serviços de fluxo | `src/lib/production/stage.ts`, `src/lib/approvals/*`, `src/lib/storage/` | mudança de etapa (única entrada), aprovações com versão congelada, armazenamento de arquivos | db, domínio |
| Campanhas recorrentes | `src/lib/domain/recurrence.ts`, `src/lib/campaigns/generate.ts` | cálculo puro das ocorrências (testado) e motor de geração idempotente | db, domínio |
| Métricas e metas | `src/lib/domain/publication-metrics.ts`, `targets.ts`, `src/lib/publications/collect.ts`, `src/lib/targets/realized.ts` | cálculos puros (N/D, medianas, maturidade, sugestão de vínculo, progresso de metas) · coleta manual para o banco · realizado das metas (sistema → Windsor → histórico) | db, domínio, windsor |
| Alertas e relatórios | `src/lib/domain/alerts.ts`, `reports.ts`, `src/lib/alerts/sync.ts`, `src/lib/reports/*` | regras de alerta e períodos (puros) · reavaliação idempotente · montagem do retrato → blocos → HTML/CSV/PDF | db, domínio, targets |
| Links e referências | `src/lib/domain/links.ts`, `src/app/(app)/gestao/{links,referencias}`, `api/links/[id]/qr` | validação estática de destino, UTM, URL de publicação (puros) · QR com a lib `qrcode` | domínio, db |
| Regras de acesso | `src/lib/perms.ts`, `src/lib/integrations.ts` | perfis, acesso por filial, identificação das contas do Windsor | domínio |
| Banco | `src/lib/db.ts` | pool único, com limites de tempo | — |
| Dados (leitura) | `src/lib/data/*` (importe de `@/lib/data`) | consultas por assunto: `brands`, `posts`, `campaigns`, `knowledge`, `users`, `integrations`, `dashboard` | db, domínio |
| Sessão e permissão | `src/lib/session.ts`, `src/lib/auth.ts`, `src/lib/access.ts`, `src/lib/scope.ts` | login, guardas (`requireUser`, `requireAdmin`, `writerOrError`…), acesso por filial, escopo da tela | data |
| Windsor | `src/lib/windsor.ts`, `src/lib/insights/server.ts` | cliente do Windsor + carregamento dos Insights já filtrados por filial | data, insights |
| Telas e ações | `src/app/(app)/**` | páginas (leitura) e `actions.ts` (escrita) de cada área | tudo acima |
| Componentes | `src/components/` | peças de interface reutilizáveis | domínio |

Regra: **telas não escrevem SQL** (usam `@/lib/data`); **cálculo não fica na tela** (vai para `domain` ou `insights/calc`) e ganha teste em `tests/`.

## Mapa das telas

```
(app)/page.tsx               Dashboard (getDashboard: tudo agregado em SQL)
(app)/planejamento/          calendario · conteudos (+novo, [id]) · reels · gerar
(app)/producao/              quadro Kanban (board.tsx, task-drawer.tsx, actions.ts) — lê `posts` via `src/lib/data/production.ts`
   aprovacoes/ · solicitacoes/ · biblioteca/   (cada uma com page + actions)
(app)/campanhas/             lista · modelos/ (campanhas recorrentes: page, [id], novo, actions)
(app)/resultados/            page = Insights (Meta, via Windsor) · instagram · meta-ads · publicacoes (manual) · vinculos · metas
(app)/gestao/                base · unidades · links · referencias
(app)/alertas/               central de alertas (a reavaliação roda no sino do layout)
(app)/configuracoes/         layout com abas escuras: usuarios · fluxo · integracoes · auditoria · conta
api/export/                  conteudos.csv · insights.csv
api/media/                   POST envio de arquivo · [id] GET download autorizado
```

## Como adicionar uma coisa (receita)

**Nova tela de leitura** — `page.tsx` na pasta da área; comece com `const user = await requireUser()` e `const scope = await getScope()`; busque via `@/lib/data` passando `scope.brand?.slug` / `scope.branch?.id`. Dados lentos (Windsor) vão dentro de `<Suspense>` para a página aparecer na hora.

**Nova ação de escrita** — `actions.ts` com `'use server'`:
1. guarda: `writerOrError()` (formulário) ou `writerOrRedirect()` (botão), `adminOrError()` para administração;
2. valide a entrada; confira a filial: `brandAllowed(user, brandId)` e, para registro existente, `rowAllowed(user, 'tabela', id)`;
3. grave com SQL parametrizado; `audit('acao', …)` (nunca grave senha);
4. `redirect()` ou devolva `{ error }` / `{ ok }` (`FormState`) para o `ActionForm`.

**Status de conteúdo** — a única fonte é `posts.stage` (9 etapas em `domain/labels.ts`). **Toda mudança de etapa passa por `changeStage` (`src/lib/production/stage.ts`)**: revisão farmacêutica, bloqueio, confirmação de "Publicado", aprovação exigida pela filial, checagem de `revision` e `post_status_events`. Nunca faça `update posts set stage` direto em tela nova.

**Editou conteúdo ou anexo** — chame `invalidateIfChanged(postId, userId, motivo)` (`src/lib/approvals/service.ts`) depois de gravar: se a versão aprovada/pendente não confere mais, a aprovação é invalidada e o cartão volta para revisão.

**Campanhas recorrentes** — as ocorrências saem de `occurrencesBetween` (datas ISO, sem fuso/horário de verão); a geração é `generateInstances` (trava o modelo, `on conflict do nothing` na `generation_key`). Instância é independente do modelo. Cartão gerado só passa de Briefing/Em produção/Em revisão após `reconfirmed_at` (regra `reconfirmBlockedReason`, aplicada em `changeStage`). Para ligar um agendador, chame `generateInstances(id, actor, hoje, 'job')` por modelo ativo — a idempotência já está garantida.

**Métricas por publicação** — a tela de vínculos nunca chama o Windsor: lê `external_publications` + `publication_metric_snapshots`. Só `collectMetrics` escreve (um retrato por publicação por dia; valor ausente nunca sobrescreve valor existente; falha na leitura principal = nada gravado). Campos verificados no Windsor: media_reach, media_views, media_like_count, media_comments_count, media_saved, media_shares, media_reel_total_interactions, account_id, media_permalink. **Não usar** media_video_views/media_plays/media_impressions (vêm sempre 0). Vínculo: `linkPublicationAction` — `verified_match` é recalculado no servidor, nunca aceito do navegador. Nova métrica de meta: acrescente em `TARGET_METRICS` (`domain/targets.ts`), na CHECK de `brand_targets.metric_key` (migração nova) e em `loadRealized`.

**Alertas** — `syncAlerts` é a única que escreve em `notification_events`: faz upsert por `dedupe_key` e marca `resolved_at` no que não foi visto na rodada. `maybeSyncAlerts` usa `alert_sync_state` como trava (2 min). Novo tipo de alerta: acrescente em `ALERT_TYPES`, na CHECK da tabela (migração nova) e uma consulta em `sync.ts`; todo parâmetro de data com soma precisa de cast (`$2::int`).

**Relatórios** — `buildReport` só lê o banco e devolve um retrato JSON (gravado em `reports.snapshot`). `snapshotToBlocks` decide o conteúdo uma vez; HTML (`ReportView`), CSV e PDF (pdf-lib, fontes padrão: texto passa por `pdfSafe`) renderizam os mesmos blocos. Rotas de download usam `rowAllowed(user, 'reports', id)` → 404 sem acesso. Novo tipo de relatório: dados em `build.ts`, blocos em `blocks.ts`, tipo na CHECK de `reports.type`.

**Links** — `validateDestination` nunca abre a URL (sem SSRF); `buildFinalUrl` é a única que monta o link; QR só de link `aprovado` e aprovado por outra pessoa (`canApproveLink`). **Publicação** — `confirmPublicationAction` passa por `changeStage` (mesmas regras de aprovação) antes de gravar `published_url`; método `api` é recusado até existir prova de viabilidade.

**Arquivos** — envio só por `POST /api/media` (limite de 4 MB por causa do corpo de requisição da Vercel; tipo conferido pelos primeiros bytes) e leitura por `/api/media/[id]`, que confere a filial. O armazenamento é `getStorage()` (hoje Postgres, `media_blobs`); para outro serviço, implemente a interface `StorageProvider` em `src/lib/storage`.

**Nova tabela** — arquivo novo em `db/migrations/NNN_nome.sql` com `enable row level security` e **nenhuma policy**; rode `npm run db:migrate`.

**Novo indicador do Windsor** — confirme o nome do campo na API (o Windsor sugere o nome certo no erro); acrescente ao conjunto em `src/lib/insights/server.ts`; monte o cartão com `MetricCard`. Campos com limite de dias (ex.: novos seguidores, 30 dias) vão em consulta separada.

## Convenções

- **Vocabulário:** *Filial* = Minas Farma ou Farma e Farma (`brands`); *Unidade* = loja dentro da filial, opcional (`branches`).
- **Acesso:** Administrador (tudo) · Editor (cria/edita) · Leitura (só vê). Editor e Leitura podem ser limitados a certas filiais (`users.brand_ids`); a regra vale no servidor, a interface só esconde.
- **Honestidade:** nada de número inventado. Sem dado → "—" e o motivo; integração não conectada aparece como "Não conectado".
- **Segredos:** só em `.env` (ignorado pelo Git) e nas variáveis da Vercel; nunca em código, log ou commit.
- **Estilo:** tokens e componentes em `src/app/globals.css` (padrão do sistema do Grupo Extra); textos em português do Brasil; datas como texto ISO (`YYYY-MM-DD`) para não ter problema de fuso.

## Velocidade

- Função na região `pdx1` (`vercel.json`), perto do banco (Supabase em Oregon).
- Listas usam consultas leves (`listPostsLite`, paginadas); o Dashboard é calculado em SQL, em paralelo.
- Windsor: cache de 5 min no servidor, carregamento em streaming, limite de 12 s.
- Banco: limites de tempo por consulta (15 s) para uma página presa não travar o sistema.
- Arquivos estáticos (logo, JS) são cacheáveis; páginas e API nunca.

## Testes

`npm run typecheck` · `npm test` (regras puras em `tests/`). Fluxos de tela são testados em navegador real antes de publicar; ao mudar um fluxo, rode o teste dele.
