# Atualização automática nativa — 3.8.0

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
o módulo usa os registros do observer já existente em content.js. A limpeza/CSV aguarda a
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
8. Feche e reabra o navegador e confira a persistência das preferências.

Os seletores vieram do HTML fornecido pelo usuário. Os testes automatizados usam DOM e
atualizações simuladas; não confirmam o comportamento Ajax/Dojo do ambiente institucional.
