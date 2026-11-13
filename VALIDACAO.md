# Validação do Firefox e Chrome 3.8.3

- `node --test tests/*.test.cjs`: 72 testes aprovados, com persistência/validação das preferências,
  migração dos dados, callbacks Chrome, transferência JSON/CSV, perfis novos sem presets, fila
  salva após reinício, exportação sem aba, invalidação por importação/undo e falhas atômicas.
- `tests/dom.cjs`: onze cenários aprovados, incluindo os controles do popup e um único observer.
- `tests/refresh-dom.cjs`: vinte e quatro cenários aprovados com jsdom 26.1.0 e temporizadores simulados
  por @sinonjs/fake-timers 13.0.5. Usam o HTML dos botões fornecido pelo usuário e grids sintéticos.
- `tests/chrome-browser.cjs`: quatro verificações Chromium/Playwright 1.64.1 aprovadas com APIs
  WebExtension simuladas, incluindo a UI existente e URLs Blob com Unicode.
- `tests/refresh-browser.cjs`: quatro cenários Chromium aprovados com DOM real e relógio
  controlado: dois hosts, duas telas, clique direto no input valueNode único do markup fornecido,
  animação de um segundo sem mudanças de dados, menu estacionado, wrapper vazio, lista permanente, checkbox booleano, diálogo offscreen e
  dois ciclos com um observer.
  A resposta do servidor, APIs da extensão e o widget são simulados; não executa o Dojo real.
- Pacote Firefox: web-ext 10.8.0, zero erros, avisos e notificações.
- Pacotes reproduzidos byte a byte a partir do ZIP de fontes. JavaScripts compartilhados iguais
  nas duas edições. Nenhuma nova permissão.
- Os quatro testes de portabilidade foram executados também com os arquivos dos ZIPs 3.6.0 e
  3.8.3, em ambas as combinações Firefox/Chrome. O JSON permanece v3 e o CSV mantém os bytes/BOM.

## Popup e botão nativo em 3.8.3

O popup foi renderizado a 380px no Chromium e inspecionado visualmente. A lista de tags,
criação/gerenciamento, backup, relatório, limpeza e atualização estão nessa ordem. Os handlers
existentes do popup passam pelos mesmos testes de preferências, relatório e recuperação.
O caso novo do Dijit confere input desabilitado, IDs dinâmicos e um único acionamento do
valueNode nas duas telas, sem segundo clique no span. O Chromium usa o markup completo
fornecido e mantém dois ciclos por tela/host simulado. Os contadores verificam tentativas e
conclusões observadas. A versão/DOM implantados no tribunal não foram acessados; a falha real
não foi reproduzida numa sessão autenticada e este ajuste ainda depende de teste do operador.

## Fila salva e Página Inicial

A grade virtual do painel próprio é percorrida duas vezes, ignorando grade, contador e filtro de
outros painéis. Os testes cobrem os dois hosts permitidos, conferência automática sem abrir a
fila completa, tags nas duas entradas de chamado e atualização nativa nas duas telas. Filtros,
loading, títulos duplicados, contador ausente ou linhas incompletas impedem exclusão e exportação
sem lista salva. A fila salva inclui sem tag, exclui resolvidos/ausentes e usa marcações atuais.
Fila vazia pode gerar relatório vazio sem apagar as marcações. Mudanças de status entre duas
leituras rejeitam a nova conferência. São preservadas a última lista válida e a cópia de recuperação
quando a gravação falha. Há apenas um observer. Os hosts são simulados, não acessados na rede.

## Correção da falsa seleção mantida da 3.8.2

Foram reproduzidas pausas falsas da versão anterior com lista permanente e seleção de painel
oculto. Os testes novos cobrem listas/listboxes sem relação com controles expandidos, wrappers
vazios, booleanos da tabela, classes em células comuns, diálogos offscreen/transparentes,
aria-selected=false, seleção de outra grade e texto em painel oculto. Textos visíveis, linhas
reais, seletores dgrid, menus expandidos e diálogos com conteúdo mantêm as pausas corretas.
Cada categoria apresenta sua própria mensagem. O navegador real também executa dois ciclos
com os elementos permanentes presentes nas duas telas e nos dois hosts simulados.

## Correção de atualização nativa mantida

Quatro cenários novos reproduziram falhas da 3.8.0 antes da alteração: Standby somente por style,
menu offscreen, ausência de proteção de clique manual com a opção desligada e animações
adiando o watchdog. Todos passaram após a correção. O observer real do content.js foi testado
no Chromium com display/opacity, sem recriar linhas. O teste DOM de interrupção de captura
confirma que não se restaura scroll nem se apagam marcas durante a atualização manual.
As mensagens de estado explicam pausas e ausência do receptor na aba; não alteram dados.
O formato de Standby foi consultado no fonte público DojoX 1.17.3, sem assumir que essa é a
versão instalada no tribunal. A causa exata na sessão do usuário requer seu novo teste.

## Atualização nativa mantida

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
Siga QUEUE_REPORT.md e AUTO_REFRESH.md para validar lista salva, filtros, dois ciclos por tela,
resposta lenta, sessão expirada,
preservação dos estados e interação com CSV/limpeza no Firefox e Chrome da equipe.

Se não observar conclusão, o controlador pausa novos cliques nessa tela para impedir
sobreposição. Se o navegador suspender ou limitar temporizadores em abas ocultas, os
intervalos podem atrasar. Não há alteração de políticas administrativas nem instalação
permanente/publicação nas lojas por esta entrega.
