# Validação do Firefox 3.6.0

- `node --test tests/*.test.cjs`: 53 testes aprovados.
- `node --test tests/dom.cjs`, com jsdom 26.1.0: sete cenários aprovados.
- `tests/chrome-browser.cjs`, com Playwright 1.64.1 e Chromium: quatro verificações de interface
  e URLs Blob aprovadas. As APIs de extensão são simuladas.
- Pacote Firefox: web-ext 10.8.0, zero erros, avisos e notificações.
- O ZIP Firefox foi reconstruído a partir dos fontes e comparado byte a byte.

Cobertura: breadcrumb curto/longo, navegação e controles antigos, referências alfanuméricas,
caixas intermediárias livres e UI otimista, datas apenas informativas, migração e transferência
JSON, erros de gravação e concorrência, duas varreduras da grade virtual, filtros visíveis/ocultos,
outras filas, carregamento, contagem incompleta, mudanças antes da gravação, confirmação de fila
vazia, cópia atômica de recuperação, restauração sem sobrescrever edições e pausa automática.

Não há Firefox instalado no ambiente de revisão. Isso não substitui a instalação nativa nem o
teste na interface institucional real. Valide os filtros e carregamento antes de distribuir a
atualização à equipe; se a estrutura do AssystNet variar, pause a limpeza até conferir.
Não foi realizada publicação ou assinatura na loja Mozilla nem alteração no AssystNet.
