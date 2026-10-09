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

## Divisão de trabalho

- **Visual** (CSS, componentes de UI, identidade): `src/app/globals.css`, `src/components/`, `public/brand/`. Branches `visual/*`.
- **Dados e lógica** (banco, auth, API): `db/`, `src/lib/`, `scripts/`, `tests/`. Branches `dados/*`.
- Entram no `main` por PR.

## Etapas

- [x] **1 — Acesso**: login, sessão, sair, troca de senha, limite de tentativas, auditoria.
- [x] **2 — Base operacional**: unidades, campanhas, base de informações (validade e confirmação), calendário mensal, conteúdos (feed/carrossel/Reels) com edição e detecção de conflito, estúdio de Reels, resultados manuais, gerador semanal por modelos, exportação CSV, tela de fontes.
- [ ] 3 — IA com contexto · 4 — Pesquisa recorrente · 5 — Instagram.
