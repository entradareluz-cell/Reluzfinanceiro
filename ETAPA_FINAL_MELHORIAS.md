# RELUZ FINANCEIRO — ETAPA FINAL DE INTEGRAÇÃO

Base: versão que já foi testada pelo usuário com criação de lançamento funcionando.

## Alterações consolidadas

### Segurança
- Sessão assinada pelo Apps Script.
- O servidor determina o usuário autenticado.
- CRUD protegido por proprietário.
- USUARIOS e AUDITORIA protegidas para operações comuns.
- Auditoria de criação, edição e exclusão.

### Lançamentos
- Novo lançamento gera ID próprio.
- Chave de idempotência evita duplicação por reenvio/duplo clique.
- Dois lançamentos legítimos com os mesmos dados podem ser criados.
- `original_amount`, `amount`, `payment_received_amount` e `remaining_amount` ficam coerentes.
- Edição passa pelo mesmo motor financeiro do servidor.
- Mensagens de erro HTTP/Apps Script ficam mais informativas.

### Pagamentos
- Validação de pagamento negativo.
- Validação para impedir pagamento acima do lançamento.
- Pagamento parcial calcula saldo restante.
- Pagamento integral fecha o saldo.
- Taxas são calculadas por forma de pagamento na edição.
- Recebimentos e parcelas são regenerados na edição quando `payment_parts` é informado.

### Parcelamento
- Datas mensais usam calendário real, em vez de simplesmente somar 30 dias.
- Datas YYYY-MM-DD são tratadas sem deslocamento de fuso.

### DRE
- Deduções de receita são consideradas no backend.
- Receita líquida e resultado operacional são recalculados no servidor.

## Ordem de teste recomendada

1. Login
2. Dashboard
3. Novo lançamento simples
4. Segundo lançamento idêntico
5. Editar lançamento
6. Excluir lançamento
7. Pagamento parcial
8. Múltiplas formas
9. Cartão parcelado
10. DRE/relatórios
11. Recorrências
12. Transferências

## Observação

Esta versão preserva a base visual e funcional do projeto. Não foram introduzidas alterações externas de banco, Firebase ou infraestrutura.
