# Extra Marketing

Central de planejamento de conteúdo (feed e Reels) e de resultados das filiais **Minas Farma** e **Farma e Farma**.
Especificação de origem: `FARMA_STUDIO_ESPECIFICACAO.md` (o produto foi renomeado para Extra Marketing).
Site: https://marketin-extra.vercel.app

## Stack

Next.js 16 (App Router) + TypeScript · Supabase (Postgres) acessado **só pelo servidor** via `DATABASE_URL` · Windsor.ai para métricas do Instagram e do Meta Ads · hospedagem na Vercel.
Autenticação própria (usuário + senha, sessão em cookie HttpOnly). Camadas, convenções e a receita de "como adicionar uma tela/ação": **`docs/ARQUITETURA.md`**.

## Rodar localmente

```bash
npm install
cp .env.example .env        # preencha os valores (veja "Variáveis de ambiente")
npm run db:migrate          # aplica db/migrations/*.sql (001 a 014)
INITIAL_ADMIN_USER=Gustavo INITIAL_ADMIN_PASSWORD='...' npm run db:seed-admin   # só na 1ª vez
npm run dev
```

A senha inicial **nunca** fica em arquivo: é passada só na execução do seed e gravada como hash (scrypt + salt).

## Variáveis de ambiente

| Variável | Obrigatória | Para quê |
| --- | --- | --- |
| `DATABASE_URL` | sim | Postgres do Supabase. Na Vercel use o **Transaction pooler** (porta 6543). Sem ela o login não funciona. |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | sim | Projeto Supabase (a chave publishable não lê nada: todas as tabelas têm RLS sem policy). |
| `WINDSOR_API_KEY` | para Insights | Leitura de Instagram e anúncios (só servidor). |
| `SESSION_TTL_HOURS` | não | Validade da sessão (padrão 12). |
| `DATABASE_CA` | não | Certificado (PEM) do Supabase; se definido, a conexão valida o servidor. |

## Deploy (Vercel)

Cada push na `main` publica sozinho. A função roda na região `pdx1` (`vercel.json`), perto do banco. Variáveis em Settings → Environment Variables; depois de alterar uma, faça um Redeploy. Se um deploy falhar sem erro de código, um novo push (até vazio) costuma resolver.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | testes unitários das regras puras (`tests/`) |
| `npm run db:migrate` | aplica migrações pendentes |
| `npm run db:seed-admin` | cria o usuário admin inicial (idempotente) |

## Segurança

- Todas as tabelas têm **RLS ligado e nenhuma policy**. Toda tabela nova deve nascer assim.
- Sessão: token aleatório de 256 bits; só o SHA-256 vai ao banco; cookie `HttpOnly`, `SameSite=Lax`, `Secure` + prefixo `__Host-` em produção; 12 h por padrão.
- Login com limite de tentativas (5/15 min por usuário, 20/15 min por IP) e auditoria sem senhas.
- Senha: mínimo de 10 caracteres com letras e números; senha provisória (criação/redefinição) é exibida uma única vez e troca obrigatória no primeiro acesso.
- Perfis (Administrador, Editor, Leitura) e **acesso por filial** valem no servidor: telas, ações de escrita, abertura de registro por endereço, CSV e Windsor.
- Server Actions checam a origem (CSRF); route handlers de escrita devem usar `sameOrigin()` de `src/lib/auth.ts`.
- Em produção: CSP, HSTS e demais cabeçalhos de segurança; páginas e API nunca em cache.
- **Mídias**: tipo conferido pelo conteúdo do arquivo (não pela extensão), PNG/JPG/WEBP/GIF/PDF até 4 MB, duplicados recusados por filial, download só para quem tem acesso à filial (404 para as outras) e com `Content-Security-Policy: sandbox`. Vídeos e arquivos grandes entram como link https.
- **Aprovação**: a filial pode exigir aprovação registrada antes de Aprovado/Agendado/Publicado. A aprovação vale para uma versão congelada do conteúdo (SHA-256); mudou texto ou anexo depois, ela é invalidada e o cartão volta para revisão. Quem envia não aprova o próprio envio (exceto administrador).
- Consultas ao banco e ao Windsor têm limite de tempo, para uma tela presa não travar o sistema.

## Estrutura das telas

O visual segue o padrão do sistema do Grupo Extra (menu azul-marinho, item ativo laranja, painéis com cabeçalho escuro, páginas de métricas e Configurações em tema escuro), para facilitar a integração futura. Tokens e componentes em `src/app/globals.css` e `src/components/`.

```
src/app/(app)/
  page.tsx                  Dashboard (mês, por filial, semanas, indicadores — agregado em SQL)
  planejamento/             calendario · conteudos (+novo, [id]) · reels · gerar
  producao/                 quadro Kanban de produção (cartões, detalhe, checklist, comentários, histórico, anexos e aprovação)
    aprovacoes/ · solicitacoes/ · biblioteca/   fila de aprovações · pedidos de peças que viram conteúdo · biblioteca de mídias com versões
  campanhas/                lista de campanhas · modelos/ (campanhas recorrentes)
  resultados/               page = Insights (Meta via Windsor) · instagram · meta-ads · publicacoes (manual) · vinculos (publicações reais) · metas · relatorios
  alertas/                  central de alertas (sino no cabeçalho)
  gestao/                   base (base de informações) · unidades (lojas, opcional) · links (UTM + QR) · referencias (concorrentes e inspirações)
  configuracoes/            abas escuras: usuarios · fluxo (política de aprovação) · integracoes · auditoria · conta
```

- **Vocabulário**: **Filial** = Minas Farma ou Farma e Farma (tabela `brands`). **Unidade** = loja dentro de uma filial, opcional (tabela `branches`; o seletor de unidade só aparece se a filial tiver alguma).
- **Escopo global Filial › Unidade** (seletor no topo, cookie `extra_scope`): filtra calendário, conteúdos, Reels, resultados, dashboard, campanhas e base. Conteúdo de "Todas as unidades" aparece em qualquer unidade da filial.
- **Quadro de produção** (`/producao`): 9 etapas — Ideia, Briefing, Em produção, Em revisão, Aguardando aprovação, Aprovado, Agendado, Publicado, Cancelado. É só outra visão de `posts` (`posts.stage` é a única fonte de status; calendário e Conteúdos mostram o mesmo). Arrastar e soltar (ou o seletor do cartão), responsável, revisor, prioridade, prazo, bloqueio com motivo, checklist, comentários que não se apagam e histórico de cada mudança de etapa. Concorrência protegida por `revision`; "Publicado" exige confirmação; medicamentos exigem revisão farmacêutica antes de aprovado/agendado/publicado; cartão bloqueado só recua ou cancela.
- **Biblioteca de mídias** (`/producao/biblioteca`): artes e PDFs até 4 MB guardados no banco (privados, por filial) e links para vídeos grandes; várias versões por peça, versão final, etiquetas, "aprovada para reutilização" e onde cada peça está em uso. O armazenamento fica atrás de uma interface (`src/lib/storage`) para trocar por outro serviço sem mexer nas telas.
- **Aprovações** (`/producao/aprovacoes` e o detalhe do cartão): enviar para aprovação congela a versão; o revisor indicado ou um administrador aprova, pede ajustes ou reprova (com motivo); histórico completo. A política é por filial em Configurações › Fluxo de aprovação.
- **Solicitações** (`/producao/solicitacoes`): briefing de peça com tipo, prioridade e prazo. Pedido de oferta só vira conteúdo com preço e validade preenchidos, dentro da validade e **confirmados por uma pessoa**; mexer na oferta tira a confirmação. A conversão cria o cartão em Briefing com o briefing nos comentários.
- **Campanhas recorrentes** (`/campanhas/modelos`): modelo por filial/unidade com recorrência (semanal, a cada 15 dias, mensal ou datas específicas), duração, vigência, antecedência, prazos D-n, entregas (formato × quantidade × dia de publicação), responsável/aprovador padrão e checklist. **Geração manual** (um clique): cria a campanha real, os cartões em Briefing e os marcos de prazo de cada ocorrência da janela. Idempotente — chave `modelo|filial|unidade|início` única no banco, com o modelo travado durante a geração (dois cliques simultâneos não duplicam). Editar o modelo só vale para as próximas; o que já foi gerado não muda. **Nunca copia preço, oferta ou validade**: o cartão gerado só segue para aprovação depois que uma pessoa reconfirma produtos, preços, validade e estoque, e a página do modelo avisa sobre informações da base e ofertas vencidas. Cancelar uma ocorrência cancela os cartões em preparo e a ocorrência não volta. Agendador automático (cron) fica para depois de validar a geração manual em uso real.
- **Publicações vinculadas** (`/resultados/vinculos`): a coleta é **manual** ("Coletar métricas agora", limite de 1 a cada 5 min por filial) e guarda no banco as publicações do Instagram dos últimos 90 dias com um retrato de métricas por dia (alcance, visualizações, curtidas, comentários, salvamentos, compartilhamentos; interações do Reel). A tela lê **só o que foi guardado** e diz "Histórico — atualizado em …". Ausente é **N/D**, nunca zero; se o Windsor falhar, nada é gravado nem apagado. O vínculo com o conteúdo planejado é sempre confirmado por uma pessoa (manual ou sugestão confirmada, com autor registrado); a sugestão só aparece quando é inequívoca (mesma filial, dia e formato, uma publicação e um conteúdo). Um conteúdo aceita várias publicações, cada uma com seu vínculo e suas métricas (nunca somadas). Diagnóstico por formato = **mediana** com n, só de publicações com 7+ dias, com a fórmula declarada (engajamento = interações ÷ alcance × 100). CSV em `/api/export/publicacoes` com o mesmo recorte da tela.
- **Metas** (`/resultados/metas`): metas mensais por filial (e unidade) para conteúdos planejados/publicados, visualizações, interações, seguidores, investimento, conversas e custo por conversa. Mostra meta, realizado, % e o mês anterior, sem afirmar causa. Fonte do realizado: sistema, Windsor ao vivo ou — se o Windsor falhar — o último retrato guardado, identificado como histórico. Não existe meta de "soma de alcance" (alcance não é aditivo) nem de "novos seguidores" (a API só cobre 30 dias).
- **Alertas** (`/alertas` e o sino do cabeçalho): calculados sobre registros reais — conteúdo atrasado ou sem responsável, aprovação parada (48 h), campanha recorrente a iniciar sem reconfirmação, arte final ausente com publicação próxima, Windsor sem coleta há 7+ dias, falha de coleta e meta interna fora do ritmo (só com 10+ dias de mês). Reavaliados sozinhos a cada 2 min (quem pega a vez roda). **Deduplicados** por evento + registro e **resolvidos sozinhos** quando a causa some; ler, dispensar e reabrir valem só para cada pessoa; cada alerta leva ao registro; só aparecem alertas de filiais autorizadas.
- **Relatórios** (`/resultados/relatorios`): operacional, resultados e executivo, por filial/unidade, semana (seg–dom), mês ou período de até 93 dias, com filtros de formato e campanha. Usam só o que está guardado no banco (nunca o Windsor ao vivo), informam a data da última coleta e separam orgânico (Instagram) de pago (Meta Ads). Saem em tela, **PDF A4** (identidade Extra Marketing + filial) e **CSV** (cabeçalho com filial, período, filtros, fonte e legenda); N/D nunca vira zero. Cada relatório guarda o retrato dos números; no mesmo dia o mesmo pedido não duplica, e "gerar de novo" cria retrato novo com a data. PDF/CSV/tela exigem acesso à filial do relatório (404 por URL direta para quem não tem). Agendamento automático fica para depois.
- **Dashboard**: visão **Operacional** (hoje/semana, atrasos, aprovações, campanhas, pendências, alertas) e **Executiva** (por filial: publicados, publicações reais, engajamento mediano, investimento, metas, alertas críticos). A troca é só de apresentação (preferência salva no navegador) e cada cartão abre a listagem filtrada.
- **Links e QR Codes** (`/gestao/links`): URL com UTM (origem, meio, campanha, termo, conteúdo) por filial/unidade/campanha. O destino é validado de forma **estática** (https, domínio público, sem usuário/senha, sem IP nem porta; o servidor não abre o endereço, para evitar SSRF); UTM antigo no destino é substituído e avisado; valores viram minúsculas sem acento. **QR Code só depois de aprovado** por outra pessoa (ou administrador), que confirma ter aberto o destino; PNG e SVG (conferidos por leitura do código). O sistema **não mede cliques nem atribui vendas** — use o analytics do site de destino filtrando pelos UTM. CSV no mesmo recorte da tela.
- **Referências e inspirações** (`/gestao/referencias`): cadastro **manual** de contas públicas de referência (rede, relevância, categoria, região) e biblioteca de ideias, formatos, datas sazonais e exemplos (fonte pública, etiquetas, vínculo opcional a campanha, conteúdo/Reels e arquivo da biblioteca). Sem raspagem, sem credenciais de terceiros, sem métricas privadas.
- **Publicação**: o sistema **não publica sozinho**. Cada conteúdo tem método *manual* ou *assistido* (o método *API* existe mas fica desabilitado); a data/hora do conteúdo é o agendamento interno; o alerta **"Hora de publicar"** lembra; a pessoa publica na rede e **confirma no cartão com o endereço da publicação** (https de Instagram/Facebook/TikTok/YouTube) — passa pelas regras de aprovação de sempre e, se o endereço bater com uma publicação já coletada, o vínculo com as métricas é feito. Prova de viabilidade e bloqueios em `docs/VIABILIDADE-PUBLICACAO.md`.
- **Insights** (`/resultados`): visualizações, alcance, interações, cliques no link do perfil, contas engajadas e seguidores (Instagram) + investimento, conversas iniciadas, cliques, impressões, custo por conversa e CPM (Meta Ads). Total, variação contra o período anterior do mesmo tamanho, gráfico diário, 7/28/90 dias e CSV. Só mostra o que o Windsor entrega: sem visitas ao perfil, sem Facebook orgânico; "novos seguidores" cobre no máximo 30 dias (limite da API do Instagram).
- **Usuários** (só administrador): nome, e-mail, papel editável na linha, filiais com acesso e situação; cria, edita, desativa (encerra as sessões) e redefine senha. Nunca fica sem administrador ativo.
- **Integrações**: cada conta do Windsor é **identificada pelo nome** usando os apelidos de cada filial (`brands.aliases`, editáveis; ex.: "minas farma", "extra farma", "farma e farma", "drogaria melhor preço"). Associação manual (`integration_accounts`) só para exceções e vence o nome. Nome que casa com as duas filiais não é adivinhado; conta não identificada só aparece em "Todas as filiais", sinalizada.
- **Windsor**: leitura direta (cache de 5 min), sem cópia no banco. Se devolver o aviso de "leituras pausadas" (plano gratuito com mais contas que o permitido), nenhum número é exibido.
- Endereços antigos (`/calendario`, `/unidades`, `/fontes`...) redirecionam para os novos.

## Etapas

- [x] **1 — Acesso**: login, sessão, sair, troca de senha, limite de tentativas, auditoria.
- [x] **2 — Base operacional**: unidades, campanhas, base de informações (validade e confirmação), calendário mensal, conteúdos (feed/carrossel/Reels) com edição e detecção de conflito, estúdio de Reels, resultados manuais, gerador semanal por modelos, exportação CSV.
- [x] **Reorganização**: subpastas, escopo filial › unidade, visual do Grupo Extra, Configurações com Usuários (e-mail, papel, acesso por filial), Integrações e Auditoria.
- [x] **Fase 0 — Auditoria** do plano de evolução (`docs/AUDITORIA-INICIAL.md`).
- [x] **Fase 1 — Central de produção**: quadro Kanban, tarefas, histórico, integração com o calendário.
- [x] **Fase 2 — Mídias, solicitações e aprovações**: biblioteca com versões, anexos nos cartões, fila e política de aprovação, solicitações com confirmação de oferta.
- [x] **Fase 3 — Campanhas recorrentes**: modelos, geração manual idempotente, tarefas e checklist, reconfirmação obrigatória, aviso de dados vencidos.
- [x] **Fase 4 — Métricas por publicação e metas**: publicações reais, retratos de métricas, vínculo conferido por pessoa, diagnóstico por mediana, metas mensais e histórico quando o Windsor falha.
- [x] **Fase 5 — Dashboard executivo, alertas e relatórios**: central de alertas, visões do Dashboard e relatórios HTML/PDF/CSV com acesso por filial.
- [x] **Fase 7 — Links, referências e publicação (fase segura)**: links UTM/QR com aprovação, referências manuais e publicação manual/assistida com lembrete; publicação por API **não** habilitada (sem prova de viabilidade).
- [x] **Resultados (Windsor)**: Insights no estilo da Meta, Instagram (publicações e público) e Meta Ads, separados por filial.
- [ ] Fase 6 (assistente de IA): dispensada por decisão do responsável. Fase 7 — publicação por API: só após prova de viabilidade em conta de teste autorizada.
