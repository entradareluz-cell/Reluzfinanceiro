# OTIMIZAÇÃO DE PERFORMANCE V1

Base: ETAPA FINAL EDIÇÃO V4, que foi confirmada funcionando.

Objetivos:
- reduzir recargas completas após operações;
- atualizar a lista local após criação/edição quando o servidor já devolve o registro;
- preparar cache curto de estruturas de leitura no Apps Script;
- não alterar regras financeiras.

Alterações:
- após edição confirmada, a interface atualiza o item local em vez de chamar `load()` novamente;
- após criação confirmada, o novo item é inserido localmente quando a resposta traz o registro;
- headers de planilhas podem ser cacheados no Apps Script por 5 minutos.

Rollback: substituir pelos arquivos da V4.
