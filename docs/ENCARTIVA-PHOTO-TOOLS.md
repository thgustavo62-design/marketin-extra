# Ferramentas de foto — Encartiva Studio

## Integração
O Studio continua usando o motor web Fabric.js adaptado do Canva Clone (Apache-2.0, revisão 53f2704646714e70339ffcad88a4e96d9b2138c9).
Foram consultados os fluxos de ajustes editáveis e presets de recorte do PhotoCraft (revisão dacecbfea1d5ca3270b44d09ac35e3d195618cb0).
A implementação desta etapa é TypeScript/Fabric independente: não inclui o motor Rust, executáveis, nem código Rust do PhotoCraft.

## Uso
Abra um design ou uma promoção no Studio. Selecione uma fotografia e clique em **Ajustar foto**.
Disponíveis: brilho, contraste, saturação, desfoque, efeitos combinados, espelhamento horizontal/vertical,
recorte central 1:1/4:5/9:16/16:9, área de recorte em percentuais e sombra suave.
Restaurar cores preserva enquadramento/espelhamento/sombra. Restaurar enquadramento recupera a área original.
Os filtros, recorte, espelhamento e sombra são propriedades do elemento no documento.
Nenhuma ferramenta sobrescreve os bytes do produto original nem altera outra campanha que use a mesma fotografia.
As alterações permanecem editáveis após recarregar e participam do histórico/desfazer/refazer.
O painel usa os controles existentes do Canva Clone e uma apresentação simplificada em português.

## Exportação
PNG e PDF usam a cena editada. SVG incorpora pixels locais: instâncias com filtros mantêm seus próprios pixels,
e referências ao mesmo arquivo original não recebem o filtro de outra instância por uma colisão de cache.
Nenhum novo recurso requer chamadas de IA ou credenciais externas.
Os uploads e os documentos continuam sujeitos às mesmas permissões e políticas por empresa/filial.
Não há migração de banco nesta etapa.

## Validação
272 testes unitários e build. Suíte de 120 verificações combinadas de PostgreSQL/navegador com importação de pasta, planilha, edição e exportações.
A regressão de foto verifica filtros combinados, crop, flip, sombra, origem preservada, texto/preços intactos,
desfazer/refazer persistido, recarregamento, SVG sem URLs privadas e painel móvel acima da gaveta de camadas.
As fotografias e empresas extras dos testes só existem no banco descartável.

Esta entrega é um primeiro conjunto de edição fotográfica; não incorpora todos os recursos do Canva ou PhotoCraft.
IA, PSD, máscaras avançadas e cobrança de assinaturas são etapas separadas.
