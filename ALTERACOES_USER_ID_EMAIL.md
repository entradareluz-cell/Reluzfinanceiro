# Ajuste de compatibilidade de user_id

Base preservada: versão estável de recuperação.

Alterado somente o Code.gs:
- `userKeys_()` deixou de chamar `list_()`/`findUserByEmail_()` recursivamente.
- A compatibilidade procura diretamente a aba `USUARIOS`.
- Registros podem ser encontrados por e-mail normalizado, user_id antigo ou id/UUID antigo.
- `list_()` calcula as chaves uma vez e usa Set para filtrar.
- `removeDuplicateCategories_()` usa as mesmas chaves de compatibilidade.

Não foi alterado:
- login/senha;
- criação de sessão;
- app.js;
- fluxo de criação de lançamentos;
- fluxo de edição;
- pagamento/parcelas;
- estrutura das tabelas.
