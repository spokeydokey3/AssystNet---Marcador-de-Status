# Validação do Firefox e Chrome 3.7.0

- `node --test tests/*.test.cjs`: 61 testes aprovados, com persistência/validação das preferências,
  migração dos dados, callbacks Chrome e transferência JSON/CSV.
- `tests/dom.cjs`: sete cenários aprovados, incluindo os controles do popup e um único observer.
- `tests/refresh-dom.cjs`: treze cenários aprovados com jsdom 26.1.0 e temporizadores simulados
  por @sinonjs/fake-timers 13.0.5. Usam o HTML dos botões fornecido pelo usuário e grids sintéticos.
- `tests/chrome-browser.cjs`: quatro verificações Chromium/Playwright 1.64.1 aprovadas com APIs
  WebExtension simuladas, incluindo a UI existente e URLs Blob com Unicode.
- Pacote Firefox: web-ext 10.8.0, zero erros, avisos e notificações.
- Pacotes reproduzidos byte a byte a partir do ZIP de fontes. JavaScripts compartilhados iguais
  nas duas edições. Nenhuma nova permissão.
- Os quatro testes de portabilidade foram executados também com os arquivos dos ZIPs 3.6.0 e
  3.7.0, em ambas as combinações Firefox/Chrome. O JSON permanece v3 e o CSV mantém os bytes/BOM.

## Cenários do novo recurso

Padrão desativado, intervalo de um minuto, opções válidas 30/60/120/300, segundo plano opt-in,
persistência após reinício, interrupção de cliques ao desligar, troca de intervalo sem duplicar
temporizadores, Página Inicial limitada ao painel nomeado, IDs dinâmicos, navegação SPA,
botões ausentes/desabilitados e painéis ambíguos, edição, seleções de linhas/texto, diálogos,
gravações e leituras da fila, cliques manuais, conclusão lenta/ausente, botão recriado, BFCache e
liberação tardia da espera. A proteção de limpeza/CSV é mantida durante uma atualização.

## Limites e validação institucional

Não foi acessada uma sessão real do AssystNet. Os testes simulam o comportamento de clique,
carregamento e conclusão da grade; não confirmam como o Ajax/Dojo real responde ao clique,
se preserva filtros/rolagem nem quais sinais de carregamento são emitidos em cada instalação.
Siga AUTO_REFRESH.md para validar dois ciclos por tela, resposta lenta, sessão expirada,
preservação dos estados e interação com CSV/limpeza no Firefox e Chrome da equipe.

Se não observar conclusão, o controlador pausa novos cliques nessa tela para impedir
sobreposição. Se o navegador suspender ou limitar temporizadores em abas ocultas, os
intervalos podem atrasar. Não há alteração de políticas administrativas nem instalação
permanente/publicação nas lojas por esta entrega.
