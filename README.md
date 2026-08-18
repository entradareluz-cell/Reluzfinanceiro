# RELUZ FINANCEIRO — Google Sheets + Apps Script

## Arquitetura

- Front-end: GitHub Pages
- Login: **Google Sheets + Google Apps Script**
- Banco de dados: **Google Sheets**
- API: Google Apps Script
- Firebase/Firestore: **não é mais usado pelo sistema**
- Comprovantes: o campo de anexo continua disponível para referência, mas o upload para Firebase foi removido.

## 1. Google Sheets

Crie uma planilha e abra **Extensões → Apps Script**.

Cole o arquivo `Code.gs` deste pacote.

Execute a função `setupDatabase` uma vez e autorize o acesso.

## 2. Publicar o Apps Script

Em **Implantar → Nova implantação**:

- Tipo: Aplicativo da Web
- Executar como: Eu
- Quem tem acesso: Qualquer pessoa

A implantação usada neste pacote é:

`https://script.google.com/macros/s/AKfycbzmN3PTZUfie-PvoS1NL8IooXfz3nz57aWHaYDxXCk6ggX0dz98HVasyPeeiwZWlosT/exec`

## 3. Inicializar

Depois de publicar, abra:

`.../exec?action=setup`

Isso cria/atualiza as abas do sistema.

## 4. Login

O cadastro e o login agora são feitos diretamente no Apps Script.

- E-mail fica na aba `USUARIOS`.
- A senha **não é armazenada em texto puro**: o navegador envia um hash SHA-256.
- A sessão fica somente no navegador (`localStorage`).
- Não existe mais dependência de Firebase Authentication ou Firestore para entrar no sistema.

## 5. Dados

Principais abas:

- LANCAMENTOS
- CATEGORIAS
- CONTAS
- CARTOES
- TAXAS
- PARCELAS
- RECEBIMENTOS
- RECORRENTES
- METAS
- PEDIDOS
- CLIENTES
- FORNECEDORES
- PROJETOS
- USUARIOS

O Apps Script cria novas colunas automaticamente quando o front-end enviar um campo novo.

## 6. Funcionalidades preservadas

- Login/cadastro
- Lançamentos
- Categorias
- Contas
- Cartões
- Taxas de maquininha
- Múltiplas formas de pagamento
- Pagamento parcial
- Parcelamento
- Parcelas futuras
- Pedido/metal
- Valor do metal
- KG inicial/final
- DRE
- Dashboard
- Metas
- Recorrentes
- Relatórios
- Busca
- PDF/Excel
- Edição de lançamento

## Segurança

A API do Apps Script é pública para permitir o funcionamento do GitHub Pages. Por isso, a autenticação do usuário é feita no Apps Script e as senhas são armazenadas apenas como hash SHA-256 na aba `USUARIOS`.

Para um ambiente com vários usuários e dados altamente sensíveis, recomenda-se adicionar autenticação por token no Apps Script posteriormente.


## Correção de duplicidade de lançamentos

A versão atual adiciona proteção de idempotência ao salvamento de lançamentos. O botão de salvar fica bloqueado durante o envio e o Apps Script usa uma chave de segurança (`dedupe_key`) para impedir que o mesmo lançamento seja gravado novamente por duplo clique, reenvio ou repetição da requisição.

A funcionalidade de múltiplas formas de pagamento, parcelamento e pagamento parcial foi preservada.

Após atualizar o GitHub, publique uma nova versão do `Code.gs` na mesma implantação do Google Apps Script.
