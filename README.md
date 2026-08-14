# Meu Financeiro — GitHub Pages + Firebase Firestore

Versão do sistema financeiro convertida de Supabase para **Firebase Authentication + Cloud Firestore**, mantendo a interface premium, Dashboard, lançamentos, categorias, cartões, recorrentes, metas, contas, relatórios, Excel e PDF.

## Estrutura

- `index.html` — interface
- `css/style.css` — identidade visual
- `js/config.js` — configuração pública do app Web Firebase
- `js/app.js` — autenticação e banco Firestore
- `firestore.rules` — segurança por usuário
- `firebase.json` — referência das Rules
- `.github/workflows/deploy.yml` — publicação automática no GitHub Pages

## 1. Criar o projeto Firebase

No Firebase Console, crie um projeto e registre um aplicativo Web.

Ative:
1. Authentication → Sign-in method → Email/Password
2. Firestore Database → Create database
3. Publique o conteúdo de `firestore.rules`

## 2. Configurar o sistema

Abra `js/config.js` e substitua os valores `COLE_AQUI...` / `SEU-PROJETO...` pelos dados do aplicativo Web do Firebase.

A configuração Web do Firebase pode ficar no frontend. **Nunca coloque neste repositório uma service account, private key ou credencial administrativa.**

## 3. Criar o repositório GitHub

Crie um repositório, por exemplo `meu-financeiro`, e envie todos os arquivos desta pasta para o branch `main`.

O workflow em `.github/workflows/deploy.yml` publica automaticamente o conteúdo no GitHub Pages a cada push.

## 4. Ativar o GitHub Pages

No repositório:
`Settings → Pages → Build and deployment → Source: GitHub Actions`

Depois do primeiro push, abra `Actions` e aguarde o workflow terminar.

A URL padrão será parecida com:
`https://SEU-USUARIO.github.io/meu-financeiro/`

## 5. Segurança

As Rules usam `request.auth.uid` para garantir que cada usuário só leia e altere seus próprios documentos. As consultas do frontend também filtram por `user_id`.

Coleções usadas:
- `users`
- `categories`
- `accounts`
- `cards`
- `transactions`
- `recurring`
- `goals`

## Observação

O sistema usa módulos Firebase diretamente pela CDN, sem necessidade de Node/npm para funcionar no GitHub Pages. A documentação oficial do Firebase recomenda a API modular para integrações novas; para produção maior, este projeto pode posteriormente ser migrado para Vite/npm e receber build otimizado.


## Funcionalidades avançadas incluídas
- Dashboard com saldo, entradas, saídas, resultado, contas a pagar/receber, cartões, evolução e comparação mensal.
- Lançamentos com subcategoria, competência, pagamento/recebimento, forma de pagamento, recorrência, parcelamento e comprovante via Firebase Storage.
- Cartões com limite, utilização, disponível, fechamento e vencimento.
- Contas correntes, poupança, dinheiro, PIX e transferências entre contas.
- Contas a pagar/receber, vencidas e projeções de 30/60/90 dias.
- Recorrências com geração automática das próximas ocorrências.
- Metas com progresso.
- Relatórios, DRE simplificada, comparativo mensal, PDF e Excel.
- Calendário financeiro e busca global.

## Firebase Storage
Publique também `storage.rules` em Firebase Storage > Rules. O upload de comprovantes fica limitado a 10 MB por arquivo e cada usuário só acessa seus próprios comprovantes.


## Correção de categorias
As consultas de dados agora são filtradas por `user_id` antes de chegar ao Firestore, e o cadastro de categorias grava diretamente com o UID do usuário. Isso evita o bloqueio das Rules por consultas não filtradas.

## Campos especiais para a categoria Pedido
Quando a categoria selecionada no lançamento for **Pedido**, o formulário exibe automaticamente:
- Valor do metal
- KG inicial
- KG final

Esses dados são gravados no documento do lançamento nos campos `metal_value`, `initial_kg` e `final_kg`. Para outras categorias, esses campos permanecem ocultos e não são gravados.

## Atualizações desta versão

- Relatórios de pedidos agora exibem valor do metal, KG inicial e KG final.
- Exportação Excel inclui os dados de metal, recebimento e classificação DRE.
- PDF mensal inclui DRE e detalhamento de pedidos/recebimentos.
- DRE empresarial com receita bruta, outras receitas, custos, despesas operacionais, despesas financeiras, resultado operacional e resultado líquido.
- Lançamentos possuem classificação DRE para permitir uma demonstração mais correta.
- Entradas podem ser recebidas por até duas formas simultâneas, por exemplo PIX + cartão de crédito, PIX + boleto ou dinheiro + PIX.
- Cada forma de recebimento possui valor próprio; cartão de crédito pode informar número de parcelas e cartão utilizado.
- O sistema valida que a soma das formas de recebimento seja exatamente igual ao valor total da entrada.
- Uso de múltiplas formas também aparece nos relatórios e no Excel.


## Atualizações — parcelamento e taxas de maquininha
- Cada cartão pode ter uma taxa da maquininha (%) cadastrada.
- Entradas no cartão podem ser parceladas automaticamente.
- O sistema calcula a taxa em cada parcela e grava valor bruto, taxa e valor líquido.
- A primeira parcela pode ficar recebida e as futuras como pendentes.
- O relatório e o Excel exibem bruto, taxa e líquido.
- O status **Pagamento parcial** abre automaticamente a caixa de formas de pagamento.
- No pagamento parcial, informe o valor pago/recebido agora e distribua em até duas formas.
- PIX, boleto, dinheiro e cartão podem ser combinados; cartão aceita parcelamento e taxa cadastrada.
