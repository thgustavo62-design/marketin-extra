# Arquitetura — Extra Marketing

Next.js (App Router) + TypeScript + Supabase (Postgres, só pelo servidor). Regra de ouro: **cada coisa mora em um lugar só**. Antes de criar algo novo, procure se já existe aqui.

## Camadas (de baixo para cima)

| Camada | Pasta | O que faz | Pode importar |
|---|---|---|---|
| Domínio puro | `src/lib/domain/` | regras sem banco nem rede: rótulos, datas, indicadores, CSV, Reels, gerador | só ele mesmo |
| Insights puros | `src/lib/insights/calc.ts` | períodos, variação, séries diárias, números compactos | domínio |
| Serviços de fluxo | `src/lib/production/stage.ts`, `src/lib/approvals/*`, `src/lib/storage/` | mudança de etapa (única entrada), aprovações com versão congelada, armazenamento de arquivos | db, domínio |
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
(app)/campanhas/
(app)/resultados/            page = Insights (Meta, via Windsor) · instagram · meta-ads · publicacoes (manual)
(app)/gestao/                base · unidades
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
