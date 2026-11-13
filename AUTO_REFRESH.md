# Atualização automática nativa — 3.8.2

O recurso aciona o botão Atualizar do próprio AssystNet. Não usa recarregamento do navegador,
atalhos de teclado nem reproduz requisições internas. Não altera status, atribuição ou conteúdo
dos chamados. Os comportamentos reais do botão e do servidor continuam sendo os do AssystNet.

## Configurar

No popup, abra **Atualizar a lista de chamados**. Ative o recurso e selecione 30 segundos,
1 minuto, 2 minutos ou 5 minutos. O padrão é **desativado**, com **1 minuto** selecionado.
**Permitir também em abas em segundo plano** começa desativado. As preferências ficam em
browser.storage.local no perfil atual, via o adaptador Chrome quando necessário.
Fechar o navegador conserva as preferências. Elas não são incluídas no backup JSON de chamados.

O primeiro clique automático ocorre depois do intervalo selecionado. Após a conclusão observada,
o próximo intervalo é contado novamente. Navegar ou mudar as preferências reinicia o agendamento.
Ao desativar, não são agendados novos cliques. Uma atualização que já começou pode terminar.
Abas ocultas, suspensas, computadores em espera ou limitações do navegador podem atrasar os
temporizadores, mesmo com a opção de segundo plano ligada. O recurso depende de uma aba AssystNet
aberta e não renova nem contorna a sessão autenticada.

## Verificar funcionamento

Depois de atualizar a extensão, recarregue a aba pelo navegador (F5/Ctrl+R) uma vez para
carregar os scripts novos. Atualizar pelo botão do AssystNet atualiza apenas a aplicação.
No popup, **Verificar funcionamento** consulta o estado da aba de origem, sem clicar no botão
nativo. Pode indicar intervalo, campo em edição, seleção/menu aberto, conferência da fila,
carregamento, segundo plano ou ausência do código na aba. Não transmite dados nem altera marcas.

Em 3.8.2, wrappers .dijitPopup estacionados fora da tela não são considerados menus abertos.
O carregamento inclui os underlays de dojox/widget/Standby, movidos para body e animados por
style (display/opacity). A conclusão pode ser observada mesmo sem mudanças nos chamados.
Os cliques manuais também são acompanhados com a opção automática desligada, para a leitura
da fila não concorrer com o carregamento. Nenhum clique automático é gerado nessa situação.
Mudanças contínuas da animação não adiam a verificação independente do prazo de 45 segundos.
O formato padrão de Standby foi conferido no código público DojoX 1.17.3:
https://github.com/dojo/dojox/blob/1.17.3/widget/Standby.js
O HTML exato do indicador institucional não foi inspecionado.

## Seleções e menus efetivamente abertos

A partir de 3.8.2, o popup distingue texto selecionado, linha marcada, menu e diálogo. A
seleção de texto precisa ter conteúdo e estar visível na área da fila; ranges de painéis
ocultos não bloqueiam. Linhas marcadas precisam pertencer à grade com referências do chamado
no painel próprio. Classes em células comuns, aria-selected=false e checkboxes booleanos
sem a função dgrid-selector não são interpretados como seleção de linha.

Um wrapper .dijitPopup vazio não é um menu aberto. Listboxes/menus permanentes só bloqueiam
quando têm itens visíveis e pertencem a um popup, têm foco ou são expostos por um controle
aria-expanded=true (aria-controls/aria-owns). Diálogos precisam estar na tela, sem opacity=0,
e ter conteúdo/controles visíveis ou indicação modal explícita. As seleções reais continuam
pausando os cliques; não são limpas para permitir a atualização.

## Telas e seletores

- Fila própria, rota `#eventMonitor/4`: um único botão visível
  `[data-component-tag="eventMonitorRefreshButton"][role="button"]`.
- Página Inicial, rota `#homepage`: um único cabeçalho visível
  `.axios-homepage-titlebar-outer` cujo `h2.axios-homepage-titlebar-inner` tem o texto
  “Chamados Atribuídos a mim”. Somente dentro desse cabeçalho é procurado
  `[data-component-tag="refresh"][role="button"]` com o ícone `.refreshButtonIcon`.

Os IDs uniqName e dijit_layout gerados dinamicamente não são utilizados. Outros painéis da
Página Inicial, outras filas e páginas individuais de chamado não recebem cliques automáticos.
Botões ausentes, ocultos, ambíguos ou desabilitados são ignorados sem erros repetitivos.
O botão é localizado novamente a cada tentativa; nós removidos não ficam guardados.

## Pausas e conclusão

O recurso adia cliques enquanto há edição/foco em campos, seleção de linhas ou texto,
diálogos e menus, gravação de tags/contatos, leitura/conferência da fila ou carregamento nativo.
Não limpa filtros nem altera os valores da interface. A preservação de filtros, rolagem e demais
estados pelo clique depende do comportamento nativo e precisa ser validada no sistema real.

Depois do clique, observa sinais nativos de carregamento e mudanças da grade, aguardando
estabilização. Há um único temporizador do controlador e nenhum MutationObserver adicional:
o módulo usa os registros do observer já existente em content.js, incluindo style/hidden.
A UI não percorre a grade novamente a cada frame dessas animações. A limpeza/CSV aguarda a
atualização, e novos cliques automáticos aguardam o fim de uma conferência da fila.

Se a conclusão não puder ser observada em 45 segundos, o controlador pausa novos cliques nessa
tela e mantém a proteção da limpeza. Uma mudança posterior dos dados ou atualização manual
observável pode liberar a espera; mudar de tela também reinicia o controle. Não se assume
sucesso apenas porque o botão foi clicado. Se isso acontecer no AssystNet, inspecione os sinais
de carregamento para adaptar a detecção antes de distribuir amplamente.

Atualizar os dados no AssystNet e limpar marcações locais são opções distintas. A limpeza
continua limitada à fila completa própria, sem filtros, com cópia de recuperação. Ela também
pode conferir o painel isolado “Chamados Atribuídos a mim” na Página Inicial. Outros painéis
não autorizam exclusões. Veja QUEUE_REPORT.md para a lista salva usada no CSV.

## Validar no ambiente real

1. Comece com um minuto e segundo plano desligado. Observe dois ciclos em cada tela.
2. Confirme que somente o painel “Chamados Atribuídos a mim” é atualizado na Página Inicial.
3. Confira que não há navegação/recarregamento completo, nem ações em chamados.
4. Verifique filtros, seleção, rolagem, menus e edição. A extensão deve adiar cliques durante
   operações reconhecidas; confira também se o botão nativo preserva os estados ao atualizar.
5. Teste resposta lenta, falha de rede e sessão expirada; não deve haver cliques sobrepostos.
6. Alterne as telas, ative/desative, mude o intervalo e teste a preferência de segundo plano.
7. Exporte CSV e sincronize a fila enquanto o recurso está ativo; a conferência deve aguardar
   uma atualização e as marcações só podem ser limpas após uma leitura completa válida.
8. Compare o estado no popup com a tela: sem edição/seleção, deve aguardar o intervalo;
   observe pelo menos dois ciclos mesmo sem mudanças na fila. Menus abertos ainda pausam.
9. Feche e reabra o navegador e confira a persistência das preferências.

Os seletores vieram do HTML fornecido pelo usuário. Os testes automatizados usam DOM e
atualizações simuladas; não confirmam o comportamento Ajax/Dojo do ambiente institucional.
