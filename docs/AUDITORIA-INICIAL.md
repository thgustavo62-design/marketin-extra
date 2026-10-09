# Auditoria inicial — Fase 0 do Plano de Evolução

Feita em 09/10/2026 contra o **código e o banco reais** (migrações 001–006, commit `da5581a`), para corrigir o plano `EXTRA_MARKETING_PLANO_COMPLETO_DE_EVOLUCAO.md`, que foi escrito sem ver o código. Nada foi alterado no comportamento do produto nesta fase.

## 1. Estado real

| Item | Situação |
|---|---|
| Stack | Next.js 16.4.0 · React 19.3.0 · TypeScript · `pg` direto (sem ORM) · Supabase só pelo servidor · Vercel (função em `pdx1`) |
| Tabelas (11, todas com RLS e sem policy) | `users`, `sessions`, `login_attempts`, `audit_events`, `brands`, `branches`, `posts`, `campaigns`, `knowledge`, `integration_accounts`, `schema_migrations` |
| Dados | 1 usuário (Gustavo), 2 filiais, **0 conteúdos / campanhas / base / unidades** — produção ainda vazia |
| Testes | 38 unitários (regras puras em `tests/`) + suítes de navegador fora do repositório (scratchpad) |
| Rotas | 24 (ver README); `api/export/conteudos` e `api/export/insights` |
| Dependências | `npm audit --omit=dev`: 0 vulnerabilidades |

## 2. Onde o plano difere da realidade (correções)

| O plano supõe | Realidade | Decisão |
|---|---|---|
| Tabela de conteúdos com status, a ser reaproveitada | `posts` existe, com `stage` (`rascunho, producao, revisao, aprovado, publicado`), `revision` (concorrência), `created_by`, `pharma_review`, resultados manuais (`reach/saves/shares`) | **`posts.stage` é a fonte única de status.** O Kanban é só outra visão de `posts`; nenhuma tabela paralela de status |
| Etapas do Kanban: Ideia, Briefing, Em produção, Em revisão, Aguardando aprovação, Aprovado, Agendado, Publicado, Cancelado | Só 5 etapas | Ampliar o CHECK para 9 etapas (`ideia, briefing, producao, revisao, aprovacao, aprovado, agendado, publicado, cancelado`); `rascunho` vira `ideia` (migração de dados) |
| Estúdio de Reels "aprimorado" | Já existe roteiro por cenas (gancho, 4 cenas com tempo/cena/fala/texto na tela, CTA) em `posts.reels` e quadro por etapa | Fica como está; só ganha "gravado" por cena e exportação (Fase 1+) |
| Concorrência otimista a criar | `posts.revision` + `update … where revision = $n` já protege a edição | Reaproveitar o mesmo mecanismo para mover cartões |
| Auditoria a criar | `audit_events` + `audit()` já existem | Reaproveitar; só acrescentar novos tipos de evento |
| Aprovação existente | **Não existe** (só `campaigns.approver` em texto livre e `posts.pharma_review` booleano) | Criar na Fase 2 |
| Mídia / storage | **Não existe** | Fase 2. Ponto aberto: provedor de storage (ver §5) |
| Metas, relatórios, alertas, jobs | **Não existem** | Fases 4–5 |
| Vínculo publicação ↔ post real | Não existe; resultados por publicação são digitados | Fase 4 (a página Instagram já lê `media_id`/`permalink` do Windsor) |
| Cache de Windsor 5 min | Existe (`next.revalidate: 300`) | Manter |
| `branch` pertence à `brand` | Só validado **nas Server Actions**; o banco aceita `posts.branch_id` de outra filial | **Lacuna**: corrigir na migração 007 com chave composta (ver §3) |

## 3. Lacunas e riscos encontrados

1. **O papel do banco ignora RLS** (`postgres`: `rolbypassrls = true`). O RLS protege apenas contra a chave publishable; **a barreira real é a checagem no servidor** (`brandAllowed`, `rowAllowed`, `getScope`), que existe e é testada. Toda nova consulta precisa continuar passando por essas funções — não confiar no RLS como defesa da aplicação.
2. **Consistência filial × unidade só na aplicação.** Corrigir no banco: `unique (id, brand_id)` em `branches` e FK composta `(branch_id, brand_id)` em `posts` (e nas tabelas novas com unidade).
3. **Sem rastreio de quem alterou por último** em `posts` (`updated_by`). Acrescentar.
4. **Sem histórico de status.** Criar `post_status_events` na Fase 1.
5. **Stage hoje é texto livre no CHECK**; mudar o conjunto exige migração + atualizar `domain/labels.ts`, CSS dos chips, gerador, filtros e testes (lista abaixo).
6. **Windsor**: o plano gratuito deixa de devolver números reais com mais contas que o permitido (já tratado, nenhum número é exibido). Os campos disponíveis estão no §4.
7. **Publicação por API não é viável sem prova de conceito** (Fase 7); hoje só há planejamento, não agendamento na Meta.

## 4. Catálogo verificado do Windsor (esta conta)

- **Instagram, por dia e conta:** `views`, `views_followers`, `views_non_followers`, `reach`, `reach_followers`, `reach_non_followers`, `total_interactions`, `accounts_engaged`, `likes`, `comments`, `shares`, `saves`, `replies`, `follower_count` (**só 30 dias**), `follows_and_unfollows`, `profile_links_taps`, `followers_count` (instantâneo), `media_count`.
- **Instagram, por publicação:** `media_id`, `media_type`, `media_product_type`, `timestamp`, `media_permalink`, `media_caption`, `media_reach`, `media_saved`, `media_shares`, `media_like_count`, `media_comments_count`, `media_views`.
- **Público:** `audience_gender_*`, `audience_age_*`, `audience_country_*` (cidade não disponível).
- **Anúncios (Facebook Ads):** `spend`, `impressions`, `clicks`, `link_clicks`, `reach`, `frequency`, `ctr`, `cpc`, `cpm`, `actions_onsite_conversion_messaging_conversation_started_7d`, `actions_purchase` (0 aqui).
- **Não entregam dados:** `profile_views`, `website_clicks`, cliques de contato (retornam 0 em linha única) → o sistema **não** mostra visitas ao perfil. **Facebook orgânico:** nenhuma página conectada.

## 5. Decisões e pontos em aberto

| Tema | Decisão / pergunta |
|---|---|
| Fonte do status | `posts.stage` (decidido) |
| Quadro de produção | Rota nova `/producao` (grupo "Produção" no menu); calendário e Conteúdos continuam lendo `posts` |
| Estados, prioridade, responsável, prazo | Colunas novas em `posts` (não tabela separada), mais `post_checklist_items`, `post_comments`, `post_status_events` |
| Storage de mídia (Fase 2) | **Em aberto — decisão do dono.** Opções: Supabase Storage (bucket privado, chave só no servidor; já tem o projeto) ou Cloudflare R2/S3. Recomendação: Supabase Storage, por já existir e evitar mais uma conta/custo |
| IA (Fase 6) | **Em aberto — decisão do dono**: provedor, chave e teto de gasto mensal |
| Publicação por API (Fase 7) | Só após prova de conceito em conta de teste e autorização da Meta |

## 6. Arquivos afetados por fase (resumo)

- **Fase 1 (produção):** migração `007`; `src/lib/domain/labels.ts` (+ stages), `rules.ts`; `src/lib/data/posts.ts`; novo `src/lib/data/production.ts`; `src/app/(app)/producao/*`; ajustes em `planejamento/conteudos/*`, `planejamento/reels`, `planejamento/gerar/actions.ts` (stage inicial), `page.tsx` do Dashboard, `app-shell.tsx`, `globals.css`; testes.
- **Fase 2:** migrações `008–009`; novo adaptador de storage; `producao/biblioteca`, `producao/solicitacoes`, `producao/aprovacoes`.
- **Fase 3:** migração `010`; serviço de recorrência; `gestao/campanhas-recorrentes`.
- **Fase 4–5:** migrações `011–012`; `resultados/*`, `lib/insights/*`, relatórios, alertas.
- **Fases 6–7:** `013–014`, provedores de IA e publicação, atrás de feature flag.

## 7. Verificação de segurança desta fase

- Next.js 16.4.0 sem vulnerabilidades pelo `npm audit`; Server Actions com checagem de origem nativa; `sameOrigin()` disponível para handlers de escrita.
- Sem segredos no repositório (varredura do histórico completo, 0 ocorrências).
- Cookies, CSP, HSTS e limites de tempo conferidos em produção.
- Nenhuma credencial é exposta ao navegador (`DATABASE_URL`, `WINDSOR_API_KEY` só no servidor).
