# CONTEXTO DO PROJETO — RELUZ FINANCEIRO

## Regra obrigatória de trabalho

A partir deste documento, qualquer agente, independentemente do modelo, deve seguir este padrão antes de implementar qualquer alteração.

### 1. Toda tarefa deve virar uma Issue do GitHub

Cada tarefa deve ser registrada como uma Issue antes da implementação, salvo correção emergencial de produção.

A Issue deve ser classificada obrigatoriamente como uma destas categorias:

- **Correção** — comportamento existente que está incorreto, quebrado ou regressivo.
- **Melhoria** — aprimoramento de comportamento existente sem criar uma função de negócio nova.
- **Nova função** — funcionalidade nova que ainda não existia.

Usar também, quando aplicável, os rótulos:
- `bug`
- `enhancement`
- `feature`
- `frontend`
- `backend`
- `google-apps-script`
- `google-sheets`
- `performance`
- `security`
- `deploy`

### 2. Nenhuma alteração direta em produção

Toda implementação deve ocorrer em uma branch própria vinculada à Issue.

Formato recomendado:

`fix/<numero>-<descricao>`
`improvement/<numero>-<descricao>`
`feature/<numero>-<descricao>`

A branch principal não deve receber alterações experimentais diretamente.

### 3. Toda entrega deve ocorrer por Pull Request

Cada mudança deve ser entregue por Pull Request relacionado à Issue.

O PR deve obrigatoriamente:

1. mencionar a Issue relacionada, usando `Closes #N` ou `Refs #N`;
2. explicar claramente o que mudou;
3. informar os arquivos/componentes alterados;
4. descrever como a mudança foi validada;
5. registrar riscos e limitações;
6. registrar próximos passos;
7. informar se houve alteração de banco/Google Sheets;
8. informar se houve alteração no Google Apps Script;
9. informar se houve alteração no frontend;
10. informar o procedimento de deploy, quando aplicável.

### 4. Validação obrigatória antes do merge

Antes de aprovar um PR, validar no mínimo:

- login;
- sessão/autenticação;
- carregamento inicial;
- leitura do Google Sheets;
- categorias;
- lançamentos;
- criação;
- edição;
- exclusão, quando afetada;
- múltiplas formas de pagamento, quando afetadas;
- parcelamento, quando afetado;
- dados após atualizar a página;
- compatibilidade com registros existentes.

Se uma área não foi alterada, registrar no PR que ela foi preservada e não deve ser modificada sem Issue específica.

### 5. Regra de preservação

**Não alterar código que já funciona sem necessidade técnica comprovada.**

Especialmente preservar, salvo Issue específica:

- login;
- autenticação;
- sessão;
- `user_id` baseado em e-mail;
- carregamento inicial;
- leitura das categorias;
- leitura dos lançamentos;
- edição de lançamentos;
- URL do Web App;
- estrutura existente do Google Sheets.

Quando uma nova função exigir alteração em uma área estável, a Issue deve explicar a dependência e o risco de regressão.

### 6. Google Apps Script e Google Sheets

Alterações no `Code.gs` devem ser isoladas sempre que possível.

Alterações de estrutura de dados devem documentar:

- nome da tabela/aba;
- colunas novas;
- compatibilidade com dados antigos;
- migração necessária;
- rollback.

Nunca apagar ou recriar dados existentes automaticamente.

### 7. Deploy

Deploy somente após:

1. Issue criada;
2. branch criada;
3. implementação concluída;
4. PR aberto;
5. validação registrada;
6. riscos avaliados;
7. aprovação/merge.

O deploy deve ser identificado no PR e, quando possível, acompanhado de versão/tag.

### 8. Regra para regressões

Se uma alteração causar regressão em uma área que estava funcionando:

1. interromper novas alterações relacionadas;
2. registrar a regressão em Issue própria;
3. voltar para a última versão estável, quando necessário;
4. corrigir a regressão em branch própria;
5. somente depois retomar a nova funcionalidade.

### 9. Estado atual conhecido

O projeto utiliza:

- frontend web (`index.html`, `app.js`, `style.css`);
- Google Apps Script (`Code.gs`) como API;
- Google Sheets como banco de dados;
- autenticação/sessão integrada ao fluxo existente;
- identificação principal de usuário por e-mail normalizado;
- compatibilidade com registros antigos que ainda possam conter UUID;
- lançamentos com possibilidade de múltiplas formas de pagamento;
- parcelas e recebimentos relacionados.

### 10. Backlog inicial

As tarefas abaixo foram separadas para evitar alterações misturadas:

| Tipo | Tarefa | Prioridade |
|---|---|---|
| Correção | Garantir login e sessão sem salto para sistema vazio | Alta |
| Correção | Garantir carregamento dos dados após login e atualização da página | Alta |
| Correção | Corrigir leitura/atualização das categorias | Alta |
| Correção | Corrigir edição e persistência de lançamentos | Alta |
| Correção | Tratar respostas 404/HTML do Apps Script como erro de integração | Alta |
| Melhoria | Otimizar carregamento e reduzir chamadas ao Apps Script | Média |
| Nova função | Suportar múltiplas formas de pagamento de forma consistente | Alta |
| Nova função | Gerar Contas a Receber para lançamentos parcelados | Alta |
| Melhoria | Atualizar Contas a Receber quando um lançamento parcelado for editado | Alta |
| Melhoria | Criar validações/regressão automatizadas para login, leitura e edição | Média |
| Melhoria | Padronizar documentação, Issues, PRs e deploys | Alta |

### 11. Regra para agentes futuros

Antes de editar qualquer arquivo:

1. ler este `CONTEXTO_DO_PROJETO.md`;
2. localizar a Issue correspondente;
3. verificar o último PR/versão estável;
4. identificar o menor conjunto de arquivos necessário;
5. não alterar módulos não relacionados;
6. implementar;
7. validar;
8. documentar riscos;
9. entregar por PR.

Se não existir Issue para a alteração solicitada, criar primeiro a Issue ou preparar a especificação da Issue antes de implementar.

## 12. Padrão obrigatório de Motion e Interação

O projeto segue o **Design Motion Principles** de kylezantos. Para este dashboard financeiro, a prioridade é velocidade, contenção e acabamento de produção. O skill recomenda decidir primeiro se uma interação precisa de movimento, usar animações curtas para interações ocasionais, evitar animação em ações de altíssima frequência e sempre suportar `prefers-reduced-motion`. citeturn0search0turn0search3

Toda nova interface deve considerar:
- lazy loading quando houver conteúdo pesado ou fora da viewport;
- skeleton screen em carregamentos de dados que poderiam deixar a interface vazia;
- entradas/saídas curtas e discretas;
- estado de progresso/bloqueio em ações assíncronas;
- feedback visual imediato após ações do usuário;
- transições consistentes entre páginas, cards, modais e listas;
- acessibilidade com `prefers-reduced-motion`;
- nenhuma animação decorativa que prejudique produtividade.

Antes de concluir uma mudança visual, o agente deve revisar a interface como designer de produto sênior e remover movimentos bruscos, genéricos, excessivos ou não funcionais.
