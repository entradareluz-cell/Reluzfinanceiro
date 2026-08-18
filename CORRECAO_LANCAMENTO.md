# Correção — Novo lançamento

Esta versão mantém o Code.gs da V2 e corrige o fluxo de novo lançamento no frontend.

## Correções

- A chave de idempotência (`dedupe_key`) não é mais calculada a partir dos dados do lançamento.
- Cada novo envio recebe uma chave UUID própria.
- Isso permite cadastrar dois lançamentos legítimos com os mesmos dados no mesmo dia.
- A chave permanece durante uma tentativa com erro/reenvio, evitando duplicação por retry.
- A chave é limpa após gravação bem-sucedida ou ao limpar o formulário.
- Ao abrir edição, uma nova chave de criação não é reaproveitada.

## Teste recomendado

Criar duas despesas de R$ 100,00 com a mesma categoria, mesma data, mesmo nome e mesma forma de pagamento. As duas devem aparecer em LANCAMENTOS com IDs diferentes.
