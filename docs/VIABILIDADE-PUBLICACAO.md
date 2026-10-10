# Viabilidade — publicação automática no Instagram

**Situação: NÃO habilitada.** O plano (Fase 7) exige uma prova de viabilidade com conta de teste autorizada antes de programar qualquer publicação automática. Essa prova ainda não foi feita (falta app Meta e autorização). Enquanto isso o sistema usa a **fase segura**: método *manual* ou *assistido* (agenda por dentro + alerta "Hora de publicar" + confirmação humana com o endereço da publicação). O método `api` existe no banco, mas a tela o mantém desabilitado e a ação recusa.

Pesquisa feita em 2026-10-10 na documentação oficial da Meta ([Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing), [limite de publicação](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit)). Reconferir antes de implementar: a Meta muda permissões e regras com frequência.

## O que a API exige

| Ponto | Requisito encontrado |
|---|---|
| Conta | Conta profissional do Instagram (comercial/criador); em alguns casos ligada a uma Página do Facebook. Página que exige *Page Publishing Authorization* só publica depois de concluí-la. |
| Aplicativo | Um app Meta nosso, com fluxo de login (OAuth) e, se usar webhooks, um servidor para receber notificações. O Windsor **não** serve: é leitura de métricas. |
| Permissões | Login do Instagram: `instagram_business_basic` + `instagram_business_content_publish`. Login do Facebook: `instagram_basic` + `instagram_content_publish` + `pages_read_engagement`. Revisão de app (App Review) pode ser exigida para uso fora de contas de teste/funções do app — a documentação consultada não detalha. |
| Mídia | Precisa estar em **URL pública** no momento da publicação. A biblioteca deste sistema é privada (download só autenticado), então exigiria um armazenamento público/assinado separado. Imagem: apenas JPEG. |
| Tipos | Foto, vídeo, Reels e carrossel (até 10 itens). Há restrições (sem marcação de produtos, sem filtros, corte do carrossel pela primeira imagem). |
| Fluxo | 1) criar *container* (`/media`), 2) enviar vídeo se necessário (assíncrono), 3) consultar `status_code` até `FINISHED`, 4) publicar (`/media_publish`). Vídeo é processado de forma assíncrona. |
| Limite | 100 publicações por API em 24 h móveis por conta (carrossel conta como 1). |

## O que impede de começar hoje

1. Não existe app Meta nem conta de teste autorizada por quem responde pelas contas (Minas Farma e Farma e Farma).
2. Armazenamento de mídia pública (ou URLs assinadas de curta duração) ainda não existe.
3. Credenciais (tokens de longa duração) precisariam ser guardadas com segurança e renovadas — fora do escopo atual.
4. Cada filial teria uma autorização própria; uma autorização não vale para outra.

## O que seria a prova de conceito (quando houver autorização)

1. Criar app Meta em modo desenvolvimento, adicionar **uma conta de teste** como testadora, obter token e publicar **um JPEG de teste**.
2. Medir: tempo de processamento, erros, comportamento em timeout (consultar status remoto antes de repetir) e limites reais.
3. Só se der certo: `PublishingProvider` (interface), tabela `publication_jobs` (chave de idempotência = destino + conteúdo + janela + versão aprovada, tentativa gravada **antes** de chamar a API), feature flag por filial e por usuário, consentimento do responsável, publicar somente versão aprovada e não expirada.
4. Aceite: falha simulada nunca marca como publicado; sem permissão o botão fica desabilitado e o fluxo manual continua; repetir o job não publica duas vezes.

Até lá, nada disso é construído — para não criar uma funcionalidade que pareça pronta e não seja.

## Concorrentes (módulo de referências)

Cadastro **manual** de contas públicas e de inspirações. Não há raspagem de páginas, credenciais de terceiros nem contorno de bloqueios; não se prometem métricas privadas de concorrentes. Qualquer coleta automática futura precisa ter origem, permissão e limites documentados aqui antes de ser construída.

## Links e QR Codes

O destino é validado de forma **estática** (https, domínio público, sem usuário/senha, sem IP/porta). O servidor **não abre** o endereço (evita SSRF); quem aprova confirma que abriu a página. O sistema não mede cliques nem atribui vendas: use o analytics do site de destino filtrando pelos parâmetros UTM.
