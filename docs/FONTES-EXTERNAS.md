# Fontes externas de dados (inteligência de mercado)

O sistema guarda no próprio banco dados **públicos e abertos** que ajudam a decidir e a conferir o que vai ao ar. Nada é raspado de sites sem permissão, nenhuma chave de terceiros é usada e **nada é atualizado sozinho**: a pessoa clica em atualizar (Inteligência › Mercado / Preços). Não há agendador (cron) ainda.

| Fonte | O que traz | Endereço | Tabela | Licença / termos |
|---|---|---|---|---|
| BrasilAPI — feriados | feriados nacionais do ano atual e do próximo | `brasilapi.com.br/api/feriados/v1/{ano}` | `holidays` | API aberta, sem chave |
| IBGE SIDRA, tabela 7060 | IPCA mensal e acumulado em 12 meses | `servicodados.ibge.gov.br/api/v3/agregados/7060` | `ipca_monthly` | dados públicos do IBGE, citar a fonte |
| CMED/Anvisa — lista de preços | PMC (preço máximo ao consumidor) por alíquota de ICMS, EAN, regime de preço, tarja | página `gov.br/anvisa/.../cmed/precos` (planilha XLSX) | `cmed_products` | dado público do governo; o PMC é a regra oficial |

Cada importação fica registrada em `external_imports` (quando, quem, quantas linhas, erro). Falha **nunca apaga** o que já estava guardado. Limite de 1 atualização a cada 10 minutos por fonte; a CMED só reimporta se houver lista nova (a menos que se force).

## Fontes avaliadas e **não** usadas

- **Open-Meteo (clima)**: o plano gratuito é só para uso não comercial. Não usamos clima até haver fonte com termos compatíveis.
- **Raspagem de preços de concorrentes, redes sociais de terceiros, marketplaces**: fora de escopo (termos de uso e LGPD). Referências de concorrentes continuam **manuais** (`/gestao/referencias`).

## Como os dados são usados

- **Datas importantes × planejamento**: feriados e datas sazonais da base são cruzados com os conteúdos planejados. Data próxima sem conteúdo vira **achado** na Inteligência e **alerta** (`date_uncovered`), que se resolve sozinho quando um conteúdo é planejado.
- **Contexto de preços**: o IPCA importado entra como contexto (o texto avisa que é inflação geral, não o preço da sua loja).
- **Preço máximo (CMED)**: confere o preço de uma oferta contra o PMC da alíquota de ICMS **da filial**. Sem ICMS cadastrado (`brands.icms_pct`, só administrador) o sistema **não afirma** que está acima do teto. Na Solicitação de oferta, informe o EAN: se o preço passa do PMC, a conversão em conteúdo é **bloqueada**.
- **Regras de propaganda (RDC 96/2008, Anvisa)**: verificador por regras sobre título, legenda e roteiro (no editor do conteúdo e no cartão da produção). Aponta termos de risco (ex.: promessa de cura, “o melhor”, estímulo ao uso de medicamento). É uma **referência** de apoio, não parecer jurídico.
- **Notas de pesquisa** (`research_notes`): conclusões da pesquisa, cada uma com a fonte.

## Limites a lembrar

- A lista da CMED é de **teto** de preço, não do preço praticado por concorrentes.
- Medicamento “liberado” (regime sem PMC) não tem teto na lista.
- A alíquota de ICMS correta deve ser confirmada com o contador.
- Textos legais são referências; a responsabilidade pelo anúncio é da farmácia.
