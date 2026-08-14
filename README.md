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
