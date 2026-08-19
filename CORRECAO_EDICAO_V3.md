# EDIÇÃO V3

Correção final do fluxo de edição simples.

## Causa identificada
O objeto `base` do formulário sempre carregava `payment_parts`.
Mesmo uma edição simples, portanto, entrava no backend em
`replacePaymentChildren_()`. Isso fazia a edição depender do motor de
recebimentos/filhos, em vez de apenas atualizar `LANCAMENTOS`.

## Correção
- Edição simples remove `payment_parts` antes de chamar `update`.
- Edição com múltiplas formas mantém `payment_parts` e continua usando o
  mecanismo de recebimentos.
- O endpoint `update` permanece separado do `save_transaction`.
- A criação não foi alterada.
