# RELUZ FINANCEIRO — Integração Etapa 2

Baseado no Code.gs original, com correções incrementais.

## Alterações
- sessão HMAC assinada no servidor;
- `user_id` não é mais autoridade do cliente para operações protegidas;
- validação de propriedade em get/update/delete/upsert;
- proteção de USUARIOS e AUDITORIA;
- auditoria de operações;
- pagamento parcial com `remaining_amount`;
- DRE reconhece `deducao_receita`;
- `health` continua público;
- login e cadastro continuam compatíveis com o app.js atual.

## Implantação
1. Restaure o Code.gs original se necessário.
2. Substitua pelo `Code.gs` desta pasta.
3. Publique como Web App com acesso compatível com o seu uso.
4. Não altere a URL da API no app.js.
5. Teste primeiro `?action=health`.
6. Depois faça login e teste criação de lançamento.

Esta versão não altera o layout da aplicação.
