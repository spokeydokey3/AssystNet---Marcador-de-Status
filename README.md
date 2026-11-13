# AssystNet · Marcador de Status — Firefox e Chrome 3.8.2

Extensão Manifest V3, JavaScript/HTML/CSS puros, sem frameworks, bundlers ou dependências
de execução. Os dados ficam exclusivamente em `browser.storage.local`, no perfil do navegador.
As edições Firefox e Chrome 3.8.2 usam o mesmo código de dados, interface e fila. Os manifestos
e downloads têm adaptação por navegador. Veja CHROME.md para atualizar a instalação Chrome.

## Tags criadas por cada operador

Novas instalações começam sem tags. Crie as suas no popup ou diretamente no seletor do chamado.
As tags e marcações já existentes são preservadas ao atualizar. Backups antigos recuperam somente
as definições legadas necessárias às suas marcações, além das tags explicitamente salvas.

## Planilha sem voltar à lista

Após uma conferência completa da fila, baixe o CSV de qualquer tela pelo popup da extensão.
A lista dos chamados abertos fica salva localmente com a data da conferência. Inclui chamados
sem tag e usa as tags/caixas atuais. Não exporta todos os registros históricos do armazenamento.
A Página Inicial também permite a conferência automática do painel “Chamados Atribuídos a mim”.
O popup e o nome do CSV indicam a data da fila; mudanças posteriores no servidor requerem nova
conferência. Sem fila salva, a exportação tenta ler a fila visível em uma das duas telas.
Importar JSON ou desfazer uma limpeza invalida essa lista; tags e contatos são preservados.
Veja [QUEUE_REPORT.md](QUEUE_REPORT.md).

Os mesmos recursos estão habilitados nos ambientes interno e externo:
- http://cati.tj.ce.gov.br/assystnet/
- https://cati.tjce.jus.br/assystnet/

No mesmo perfil/navegador, ambos usam as mesmas marcações. Entre computadores ou navegadores,
transfira o backup JSON; a fila conferida deve ser lida novamente no destino.

## Pausas reais e elementos permanentes — 3.8.2

A atualização distingue texto visível selecionado, linhas/seletores da grade da sua fila,
menus abertos e diálogos visíveis. Listboxes permanentes sem foco/controle expandido,
wrappers vazios, diálogos invisíveis/offscreen, classes de seleção em células comuns e
checkboxes de dados booleanos não pausam a atualização. Seleções de painéis ocultos ou
linhas de outros painéis não bloqueiam o painel próprio. O popup informa a categoria real
da pausa; não usa mais a mensagem agrupada “texto/linha ou menu”.

## Proteções da atualização automática mantidas

Menus Dojo fechados e guardados fora da tela não são mais tratados como abertos. A conclusão
reconhece a animação de Standby por display/opacity, inclusive sem alteração dos chamados.
A animação não reinicia o temporizador de segurança; a atualização manual também protege
leituras da fila quando o agendamento automático está desligado.

O popup mostra o estado da atualização. **Verificar funcionamento** consulta a aba de origem,
sem atualizar o AssystNet. Indica espera, carregamento, campo em edição, seleção, leitura da
fila ou código ainda não carregado. Após instalar esta atualização, recarregue a aba pelo
navegador (F5/Ctrl+R), uma vez; o botão nativo do AssystNet não recarrega os scripts da extensão.

## Atualizar os dados no AssystNet

O novo módulo autoRefresh.js aciona somente os botões nativos das duas telas fornecidas:
Página Inicial (#homepage), dentro do painel “Chamados Atribuídos a mim”, e fila própria
(#eventMonitor/4). O recurso é opcional e começa desligado, com intervalo padrão de um minuto.
Há opções de 30 segundos, 1, 2 e 5 minutos, e segundo plano desligado por padrão.
Ele não recarrega a página, não reproduz requisições internas e não altera chamados.
As preferências ficam no perfil em browser.storage.local, separadas do backup de chamados.

Há pausas para edição, seleção, carregamento e varredura da fila, um único temporizador por
controlador e nenhum observer adicional. Sem confirmação observável de término, não são
repetidos cliques. Consulte AUTO_REFRESH.md para seletores, limites e validação real necessária.
A atualização dos dados pelo botão nativo e a limpeza das marcações locais são opções distintas.
O JSON continua no formato v3, intercambiável com Firefox/Chrome 3.6.0 ou posterior.

## Marcações em qualquer página de chamado

O seletor de tag e as quatro caixas aparecem na fila e no breadcrumb da página individual.
A referência completa da rota `#events/` precisa coincidir com um breadcrumb visível e único.
O índice do breadcrumb pode variar: Página Inicial, fila, busca e links diretos usam a mesma
referência. `eventType` e `currentIndex` não identificam o chamado. Prefixos R/S são preservados.
Controles antigos são bloqueados durante a navegação e recriados para o chamado correto.

## Contatos livres

As quatro caixas são independentes: qualquer uma pode ser marcada ou desmarcada sem confirmação.
Não há bloqueio por datas, intervalo entre contatos, dias úteis, feriados ou resposta informada.
Cada marcação recebe a data local atual. A data pode não ser a do contato real, que deve ser
conferido no histórico do AssystNet. Datas e dias corridos ficam nos detalhes/tooltip, com uma
referência informativa de sete dias. A extensão não autoriza nem realiza encerramentos.
Informar resposta mantém as marcações; limpar o acompanhamento inteiro ainda pede confirmação.

## Limpeza automática da fila

Ao abrir/atualizar o painel próprio na Página Inicial `#homepage` ou a fila `#eventMonitor/4`, a extensão tenta duas varreduras completas
do dgrid, conferindo referências únicas, contador, nome da fila, filtros e estabilidade da página.
Os dois resultados precisam coincidir, e o contexto é verificado novamente antes da gravação.
São removidos os vínculos de tags e os contatos de chamados ausentes. As definições das tags
permanecem. A comparação usa todos os chamados da fila, inclusive um resolvido que ainda esteja
listado; o CSV continua incluindo somente os abertos.

Buscas preenchidas, filtros detectados, carregamento, outras filas, contagens incompletas ou
mudanças de página impedem a limpeza. Uma fila vazia nunca apaga tudo automaticamente:
use **Conferir e limpar agora** e confirme a leitura vazia. A identificação dos filtros depende
do DOM institucional; se o AssystNet alterar esses controles, valide antes de retomar a limpeza.
Não se consulta a API privada do sistema nem se força uma atualização de dados do servidor.
A fila deve estar atualizada no próprio AssystNet, sem filtros. Fora dessas duas telas não há limpeza.

O popup mostra a quantidade de registros com tag separada do total da última fila conferida.
A limpeza automática pode ser pausada. Antes de remover registros, é salva uma única cópia de
recuperação na mesma gravação dos dados novos. **Desfazer a última limpeza e pausar** recupera
registros removidos que ainda não foram alterados, sem sobrescrever edições posteriores, e
desliga a limpeza até o operador reativá-la. Uma nova limpeza com remoções substitui a cópia.
Também é possível baixar essa cópia como JSON. O backup normal contém apenas os dados atuais.
Marcar um chamado fora da fila continua possível; a próxima limpeza poderá remover esse registro.

## Atualização e troca de computador

Mantenha o ID Firefox `assyst-status-tagger@tjce.local` e atualize sem desinstalar.
Fechar uma instalação permanente mantém os dados no mesmo perfil. Salve um JSON antes de
atualizar, remover a extensão, mudar de perfil ou trocar de computador. Instalações temporárias
não substituem uma instalação permanente assinada pela Mozilla.

A migração para o esquema 3 preserva tags, tentativas e datas anteriores. Backups sem versão,
v1 e v2 continuam aceitos. O formato JSON v3 preserva quais caixas estão marcadas, inclusive
posições intermediárias. Para importar um backup v3, o destino precisa da versão 3.6.0 ou posterior;
a edição Chrome 3.5.0 não lê esse formato; atualize para Chrome 3.6.0 para trocar JSON nos dois sentidos. Preferências de limpeza e cópias de recuperação não
são transferidas no JSON normal. Importe backups pela janela de transferência, confira a prévia
e escolha Mesclar ou Substituir; este último modo exige confirmação.

## Construção e validação

Veja [CONSTRUIR.md](CONSTRUIR.md), [VALIDACAO.md](VALIDACAO.md) e [PUBLICAR.md](PUBLICAR.md).
Python 3.12+ constrói pacotes reproduzíveis; Node 24 roda os testes sem instalar dependências.
Ferramentas de revisão como jsdom, Playwright e web-ext ficam fora da extensão.

Há um único MutationObserver, com agrupamento por frame e exclusão da UI própria.
A sincronização usa esse observer, debounce, limite de frequência e restauração da rolagem.
Não há acesso ao armazenamento dentro do callback do observer. Gravações são serializadas no
background; a UI de tags e caixas é otimista e reverte se houver erro.

Permissões Firefox: storage, downloads e somente os dois hosts AssystNet declarados no manifesto.
Não há código remoto, telemetria, sincronização automática entre computadores ou envio de dados
a terceiros. A integração institucional real ainda precisa ser testada no Firefox da equipe.
