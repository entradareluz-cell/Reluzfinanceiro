# Performance V2 — leitura inicial

Base: EDIÇÃO V4, confirmada funcional.

Correções:
- uma única chamada `initial_load` substitui sete chamadas independentes ao Apps Script;
- o Apps Script lê as tabelas uma vez por execução e devolve os sete conjuntos filtrados pelo usuário;
- categorias duplicadas não são mais apagadas durante cada carregamento: são apenas deduplicadas em memória;
- mantém criação, edição e pagamentos da V4;
- registra no console o tempo total do carregamento inicial.

Isso foi feito para atacar especificamente lentidão e falhas de leitura de categorias/lancamentos sem alterar as regras do sistema.
