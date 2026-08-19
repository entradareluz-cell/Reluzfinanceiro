# EDIÇÃO V4

A edição simples foi separada completamente do motor financeiro de
pagamentos.

O frontend chama `update_simple_transaction`.

O backend:
1. exige sessão;
2. verifica proprietário;
3. atualiza diretamente a linha existente em LANCAMENTOS;
4. preserva o estado de pagamento existente;
5. registra auditoria;
6. retorna o registro atualizado.

O fluxo `save_transaction` usado para criação não foi alterado.
