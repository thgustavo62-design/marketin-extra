# Extra Marketing

Central de planejamento de conteúdo (feed e Reels) das redes **Minas Farma** e **Farma e Farma**.
Especificação de origem: `FARMA_STUDIO_ESPECIFICACAO.md` (o produto foi renomeado para Extra Marketing).

## Stack

Next.js (App Router) + TypeScript · Supabase (Postgres) acessado **só pelo servidor** via `DATABASE_URL`.
Autenticação própria (usuário + senha, sessão em cookie HttpOnly).

## Rodar localmente

```bash
npm install
cp .env.example .env        # preencha SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY e DATABASE_URL
npm run db:migrate          # aplica db/migrations/*.sql
INITIAL_ADMIN_USER=Gustavo INITIAL_ADMIN_PASSWORD='...' npm run db:seed-admin   # só na 1ª vez
npm run dev
```

A senha inicial **nunca** fica em arquivo: é passada só na execução do seed e gravada como hash (scrypt + salt).

## Deploy (Vercel)

Variáveis de ambiente do projeto na Vercel (Settings → Environment Variables): `DATABASE_URL` (no Supabase, use a string do **Transaction pooler**, porta 6543), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `WINDSOR_API_KEY`. Sem `DATABASE_URL` o login não funciona.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | testes unitários (`tests/`) |
| `npm run db:migrate` | aplica migrações pendentes |
| `npm run db:seed-admin` | cria o usuário admin inicial (idempotente) |

## Segurança (Etapa 1)

- Todas as tabelas têm **RLS ligado e nenhuma policy**: a chave publishable não lê nem escreve nada. Toda tabela nova deve nascer com RLS.
- Sessão: token aleatório de 256 bits; só o SHA-256 vai ao banco; cookie `HttpOnly`, `SameSite=Lax`, `Secure` + prefixo `__Host-` em produção; validade de 12 h (`SESSION_TTL_HOURS`).
- Limite de tentativas: 5 falhas/15 min por usuário e 20/15 min por IP. Eventos em `audit_events`, sem senhas.
- Server Actions checam a origem (CSRF); route handlers de escrita devem usar `sameOrigin()` de `src/lib/auth.ts`.
- Troca de senha exige a senha atual, mínimo de 10 caracteres e encerra as outras sessões.

## Estrutura das telas

O visual segue o padrão do sistema do Grupo Extra (menu azul-marinho, item ativo laranja, painéis com cabeçalho escuro, páginas de métricas em tema escuro), para facilitar a integração futura. Tokens e componentes em `src/app/globals.css` e `src/components/`.

```
src/app/(app)/
  page.tsx                  Dashboard (mês, rede › filial, semanas, indicadores)
  planejamento/             calendario · conteudos (+novo, [id]) · reels · gerar
  campanhas/
  resultados/               page (por publicação, manual) · instagram · meta-ads  (Windsor)
  gestao/                   base (base de informações) · filiais
  configuracoes/            usuarios · integracoes · auditoria · conta
```

- **Escopo global Rede › Filial** (seletor no topo, cookie `extra_scope`): filtra calendário, conteúdos, Reels, resultados, dashboard, campanhas e base. Conteúdo de "Todas as filiais" aparece em qualquer filial da rede.
- **Perfis**: Administrador (tudo), Editor (cria e edita), Leitura (só vê). Regra no servidor (`writerOrError`/`requireAdmin` em `src/lib/auth.ts`); a interface só esconde o que o perfil não pode usar.
- **Usuários** (só administrador): cria com senha provisória exibida uma única vez (a pessoa troca no primeiro acesso), muda perfil, desativa (encerra as sessões) e redefine senha. Nunca fica sem administrador ativo.
- **Integrações**: cada conta do Windsor (Instagram, anúncios) é associada a uma rede e, se quiser, a uma filial; é isso que separa os resultados. Contas sem associação só aparecem em "Todas as redes", sinalizadas.
- **Windsor**: leitura direta (cache de 5 min), sem cópia no banco. Se o Windsor devolver o aviso de "leituras pausadas" (plano gratuito com mais contas que o permitido), nenhum número é exibido.
- Endereços antigos (`/calendario`, `/unidades`, `/fontes`...) redirecionam para os novos.

## Etapas

- [x] **1 — Acesso**: login, sessão, sair, troca de senha, limite de tentativas, auditoria.
- [x] **2 — Base operacional**: filiais, campanhas, base de informações (validade e confirmação), calendário mensal, conteúdos (feed/carrossel/Reels) com edição e detecção de conflito, estúdio de Reels, resultados manuais, gerador semanal por modelos, exportação CSV.
- [x] **Reorganização**: subpastas, escopo rede › filial, novo visual, Configurações (usuários, integrações, auditoria), Resultados do Instagram e do Meta Ads via Windsor.
- [ ] 3 — IA com contexto · 4 — Pesquisa recorrente · 5 — Publicação e métricas gravadas no banco.
