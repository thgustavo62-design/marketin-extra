# Encartiva — corte de produção em 27/10/2026

## Titularidade real e acessos

O usuário confirmou que Werllem Polac é proprietário de Minas Farma e Farma e Farma.
O cadastro de proprietário reaproveita o login existente Werllem e preserva seu hash de senha.
Gustavo permanece administrador da plataforma; Werllem deixa de ter administração global e passa a proprietário.
A troca inicial de senha já estava pendente no cadastro de Werllem e foi preservada.
As sessões antigas de Werllem foram revogadas na mudança de perfil.

As duas empresas preservam IDs e nomes e têm owner_id obrigatório.
Não havia filiais no banco; nenhuma unidade, endereço ou contato fictício foi criado.
O plano é identificado como acesso legado sem cobrança automática. Limites administrativos iniciais:
2 empresas, 2 filiais e 10 usuários. O administrador pode revisar contrato e limites no perfil do proprietário.
Não existe ativação de cobrança/pagamento nesta implantação.

## Dados e segurança

Migrations 037 e 038 aplicadas, além de 039 para criação de filial com INSERT RETURNING.
A aplicação usa DATABASE_RUNTIME_URL com login nova7_runtime sem SUPERUSER, CREATEROLE ou BYPASSRLS.
As consultas comerciais executam transações no papel nova7_app; autenticação mantém conexão interna separada.
As confirmações de titularidade foram auditadas (duas transferências iniciais).

Antes da migração, foi criado snapshot privado dos metadados das 66 tabelas públicas e das definições de colunas,
constraints, índices e ACLs. Foram registrados 10.940 checksums de campos binários.
Esse snapshot de metadados não é um backup externo completo dos arquivos.
Os binários foram mantidos no lugar; a conferência posterior das 10.878 partes das imagens encontrou zero diferenças.
IDs de empresas, produtos, imagens e campanhas e hashes de senhas foram preservados.

Acervo inicial: 8.872 produtos, 3.661 imagens, 2 campanhas e 2 modelos.
Esses registros antigos sem empresa permanecem preservados para classificação administrativa explícita;
não foram atribuídos automaticamente a uma das farmácias.
Os seis componentes CP-MF-001..006 foram instalados no cadastro real da Minas Farma pela interface administrativa.
Farma e Farma não recebeu esses componentes.

## Envio da pasta de produtos

Em /produtos/importar, selecionar a empresa no cabeçalho.
A página mostra o destino e a seleção de pasta inclui subpastas.
O identificador do destino acompanha os lotes; a API verifica o contexto autorizado e recusa mudança de empresa com HTTP 409.
As fotos são otimizadas e deduplicadas dentro da empresa, preservando recortes/transparência.
EAN ou nome é confrontado apenas com o catálogo autorizado da empresa/filial ativa.
Nomes do catálogo não são guardados em cache global entre clientes.
Associações incertas ficam na fila de conferência; fotos não criam produtos/preços por suposição.

O diretório Windows informado pelo usuário não é acessível pelo ambiente remoto.
Os arquivos reais só entram no banco depois que o usuário seleciona a pasta no navegador.
Nenhuma foto desse diretório foi importada automaticamente.
Se os cadastros ainda estiverem apenas no acervo legado, classificar o cadastro ou importar o ERP na empresa antes de vincular as fotos.

## Validação

264 testes; build; 74 verificações nativas de banco e 106 verificações combinadas de PostgreSQL/navegador.
Inclui criação de filial pelo proprietário com RETURNING; pasta real de arquivos de teste pelo seletor do navegador;
persistência e transparência de cinco fotos; reenvio sem duplicação; recusa de empresa divergente;
planilha com cinco preços, Stories/Feed/A4 e exportações PNG/PDF como proprietário.
Dados e arquivos de teste são exclusivamente do banco descartável.

Produção: administrador acessou Proprietários e o cadastro real.
API identificou Werllem como proprietário. RLS confirmou as duas empresas, privacidade do legado,
e criação de filial com acesso herdado em transação revertida.
A troca de senha inicial de Werllem continua sendo exigida antes das telas comerciais.
As sessões temporárias de verificação devem ser revogadas após a conferência.
