# RELUZ FINANCEIRO — Google Sheets + Apps Script

## Arquitetura

- Front-end: GitHub Pages
- Login: Firebase Authentication
- Banco de dados: Google Sheets
- API: Google Apps Script
- Comprovantes/anexos: Firebase Storage (opcional, mantido para não perder a função de anexos)

## 1. Google Sheets

Crie uma planilha e abra **Extensões → Apps Script**.

Cole o arquivo `Code.gs` deste pacote.

Execute a função `setupDatabase` uma vez e autorize o acesso.

## 2. Publicar o Apps Script

Em **Implantar → Nova implantação**:

- Tipo: Aplicativo da Web
- Executar como: Eu
- Quem tem acesso: Qualquer pessoa

A URL usada pelo sistema já está configurada no `app.js`:

`https://script.google.com/macros/s/AKfycbwNTGqkiHjOVEbFrxfN409gY0DPr8sAwoJ_q0Zc1hStpXgAfoDC4ZtvE5Uamq_7qiyl/exec`

Se você criar uma nova implantação/URL, altere `API_URL` no `app.js`.

## 3. Atualizar uma implantação existente

Se você já tinha publicado o Apps Script, substitua o código pelo `Code.gs` novo, salve e publique uma nova versão da mesma implantação. Não crie uma URL diferente se quiser manter o `API_URL` atual.

## 4. Primeiro teste

Abra no navegador:

`.../exec?action=health`

Deve retornar JSON com:

`RELUZ FINANCEIRO API — Google Sheets funcionando.`

Depois:

`.../exec?action=setup`

Isso cria/atualiza as abas.

## 5. Dados

As principais abas são:

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

O login continua sendo validado pelo Firebase Authentication. O Apps Script recebe o `user_id` do usuário autenticado e grava os registros na planilha.

Para uma implantação empresarial com múltiplos usuários, recomenda-se posteriormente validar o token do Firebase no backend antes de aceitar operações de escrita.
