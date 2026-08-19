# Retorno à base estável

Esta versão abandona a tentativa experimental de cache/localStorage e leitura
direta em massa que causou:
- entrada automática;
- dados vazios;
- categorias ausentes.

Base: `LOGIN-TRAVAMENTO-CORRIGIDO`, que foi a versão em que o usuário confirmou
que o login estava funcionando.

Não há cache local de autenticação e não há auto-login adicionado por esta
correção.

O próximo ajuste deve ser feito somente depois de confirmar:
1. tela de login aparece;
2. login manual funciona;
3. dados voltam a aparecer.

Não alterar Code.gs nesta etapa.
