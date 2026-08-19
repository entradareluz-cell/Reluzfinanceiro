# Contas a receber de vendas parceladas

A partir desta versão, quando `save_multiple_payments` receber uma forma de pagamento
com `installments > 1`, cada parcela gera:

1. uma linha em `PARCELAS`, para manter a compatibilidade com o fluxo existente;
2. uma linha em `CONTAS_RECEBER`, que representa o valor esperado para cair na conta.

As datas são calculadas a partir da data do pagamento e avançam um mês por parcela:
- parcela 1 = +1 mês
- parcela 2 = +2 meses
- parcela 3 = +3 meses
- etc.

A conta a receber começa com `status = a_receber`, `paid_date` vazio e guarda:
- `expected_date`
- valor bruto
- taxa
- valor líquido
- conta/cartão
- método
- número/total da parcela
- vínculo com o lançamento e com a parcela.

O endpoint `mark_receivable_paid` permite marcar uma conta a receber como recebida
e sincroniza a parcela correspondente.

A edição de um lançamento com formas parceladas remove as contas a receber antigas
daquele lançamento e recria o cronograma, evitando duplicação.

Observação: a criação do cronograma não lança automaticamente dinheiro no saldo da conta
antes da data prevista. O registro permanece como `a_receber` até ser marcado como recebido.
