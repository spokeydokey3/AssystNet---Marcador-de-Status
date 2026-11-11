# Validação do Firefox e Chrome 3.6.0

- `node --test tests/*.test.cjs`: 57 testes aprovados, incluindo quatro de portabilidade Firefox/Chrome.
- `node --test tests/dom.cjs`, com jsdom 26.1.0: sete cenários aprovados.
- `tests/chrome-browser.cjs`, com Playwright 1.64.1 e Chromium: quatro verificações de interface
  e URLs Blob aprovadas. As APIs de extensão são simuladas.
- Pacote Firefox: web-ext 10.8.0, zero erros, avisos e notificações.
- O ZIP Firefox foi reconstruído a partir dos fontes e comparado byte a byte.
- O ZIP Chrome foi reproduzido dos fontes e os arquivos compartilhados foram comparados com o Firefox já publicado.
- Os quatro testes de portabilidade também foram executados usando os arquivos extraídos dos ZIPs de execução.

A atualização Chrome reutiliza sem alterações o código de execução compartilhado do Firefox
3.6.0, em que foram verificadas as interfaces acima. Os novos testes executam também a ponte
de mensagens callback do Chrome, a migração do esquema 2, JSON v1/v2, JSON v3 com caixas não
consecutivas, Unicode, referências com prefixos/zeros, limpeza e recuperação, mesclagem e
substituição, ida e volta Firefox/Chrome e os bytes do CSV com BOM.

Cobertura: breadcrumb curto/longo, navegação e controles antigos, referências alfanuméricas,
caixas intermediárias livres e UI otimista, datas apenas informativas, migração e transferência
JSON, erros de gravação e concorrência, duas varreduras da grade virtual, filtros visíveis/ocultos,
outras filas, carregamento, contagem incompleta, mudanças antes da gravação, confirmação de fila
vazia, cópia atômica de recuperação, restauração sem sobrescrever edições e pausa automática.

Não há Firefox instalado no ambiente de revisão. Os testes das APIs Chrome usam simulações;
a instalação nativa Chrome e o teste na interface institucional real continuam necessários.
Valide os filtros e carregamento antes de distribuir a
atualização à equipe; se a estrutura do AssystNet variar, pause a limpeza até conferir.
Não foi realizada publicação nas lojas Mozilla/Chrome Web Store nem alteração no AssystNet.
