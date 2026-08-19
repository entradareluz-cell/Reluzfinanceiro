# Correção definitiva — login/carregamento e edição

- A página não reutiliza automaticamente uma sessão do localStorage ao abrir.
- O app só aparece depois da primeira leitura crítica do Sheets concluir.
- O frontend não aplica mais filtro local exato por user_id; o Apps Script faz
  a filtragem compatível entre e-mail e UUID legado.
- A edição usa `update_simple_transaction`, que valida propriedade, mantém o
  mesmo ID, atualiza a linha existente e preserva os campos de pagamento em
  uma edição normal.
- Não foi alterado o fluxo de criação de lançamentos.
