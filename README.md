# Reluz Financeiro

Sistema financeiro pessoal inspirado em dashboards financeiros modernos, com:
- Firebase Authentication
- Cloud Firestore
- Dashboard com indicadores e gráfico
- Lançamentos
- Contas
- Cartões
- Recorrentes
- Metas
- Categorias
- Relatórios
- Exportação CSV
- GitHub Pages

## Configuração
1. Ative Authentication > E-mail/senha no Firebase.
2. Crie o Firestore.
3. Publique `firestore.rules`.
4. O `config.js` já contém a configuração Web do projeto `reluz-financeiro`.
5. No Firebase Authentication > Settings > Authorized domains, adicione `entradareluz-cell.github.io`.
6. Envie para a branch `main`.
7. Em Settings > Pages, selecione GitHub Actions.

## Importante
As regras usam o UID do usuário. Cada usuário só acessa seus próprios documentos.
