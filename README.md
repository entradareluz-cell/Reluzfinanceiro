# RELUZ FINANCEIRO — MODAL + GOOGLE SHEETS + ID POR E-MAIL

## API Google Apps Script

URL configurada no `app.js`:

https://script.google.com/macros/s/AKfycbzE9bJFnzt1JCLOmKjn6m8SmbcknTEEwc2JgdzSyDpw6L9DPV-2Q2EoeUNKu82YXPfM/exec

## Arquivos

- `app.js` — frontend, modal de edição e integração com Apps Script.
- `Code.gs` — API Google Apps Script + Google Sheets.
- `index.html` — interface.
- `style.css` — estilos.
- `deploy.yml` — configuração existente.

## Correções desta versão

1. URL da API atualizada para a nova publicação informada.
2. ID principal do usuário novo passa a ser o e-mail normalizado.
3. Compatibilidade com usuários antigos: registros que ainda usam o UUID antigo continuam sendo encontrados pelo mesmo e-mail.
4. Edição de lançamento passa pelo `updateTransaction_` quando a tabela é `LANCAMENTOS`.
5. Ao editar lançamento com múltiplas formas de pagamento, `RECEBIMENTOS` e `PARCELAS` antigas daquele lançamento são substituídos pelos dados atuais.
6. `payment_parts` é gravado como JSON na célula do Google Sheets e volta como array para o modal.
7. Valores de PIX, dinheiro, débito e cartão são tratados como números; datas continuam nos campos de data.
8. O `user_id` enviado pelo frontend na edição é o e-mail do usuário.

## Publicação

Publique o `Code.gs` como nova versão do Web App e mantenha o acesso compatível com o uso do frontend. Depois, publique o frontend com o `app.js` deste pacote.

## Teste recomendado

- Login no computador A.
- Login no computador B com o mesmo e-mail.
- Criar lançamento simples.
- Criar lançamento PIX + dinheiro + cartão.
- Conferir `LANCAMENTOS`, `RECEBIMENTOS` e `PARCELAS`.
- Editar o lançamento e alterar valor/data/formas.
- Reabrir o lançamento e confirmar os dados.
