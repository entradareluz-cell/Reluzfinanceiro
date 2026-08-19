# Correção do travamento após login

Base: arquivo enviado pelo usuário `Reluzfinanceiro-main (5).zip`.

Causa funcional identificada:
`start()` aguardava `getDoc(users)` e depois `load()` antes de esconder a tela
de entrada. Qualquer atraso/erro de leitura do Google Apps Script mantinha o
overlay de carregamento na tela de login, mesmo com a autenticação já
confirmada.

Correção:
- autenticação confirmada -> entra imediatamente na aplicação;
- carregamento dos dados ocorre depois;
- erro de leitura não invalida o login;
- Code.gs não foi alterado;
- API_URL não foi alterada;
- regras de lançamentos/categorias não foram alteradas.
