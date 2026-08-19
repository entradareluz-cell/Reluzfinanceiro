# Atualização — login, carregamento e edição

1. O sistema não mostra mais a aplicação vazia durante a primeira leitura.
2. Falha de uma leitura não substitui os dados atuais por arrays vazios.
3. O `load()` só troca o estado da aplicação depois de confirmar as leituras.
4. A edição de lançamento usa `action=update` com `sheet=LANCAMENTOS`.
5. O Apps Script aplica `updateTransaction_()` na mesma linha/ID.
6. `update_simple_transaction` também foi reforçado para usar `updateTransaction_()`.
7. Login, user_id por e-mail e compatibilidade UUID/e-mail foram preservados.
