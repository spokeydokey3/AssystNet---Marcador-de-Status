# AssystNet · Marcador de Status — Firefox 3.6.0

Extensão Manifest V3, JavaScript/HTML/CSS puros, sem frameworks, bundlers ou dependências
de execução. Os dados ficam exclusivamente em `browser.storage.local`, no perfil do navegador.
Esta entrega atualiza o Firefox. A edição Chrome publicada anteriormente continua na 3.5.0;
o projeto mantém os adaptadores Chrome e o código compartilhado para futuras entregas.

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

Ao abrir/atualizar a fila própria `#eventMonitor/4`, a extensão tenta duas varreduras completas
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
A fila deve estar atualizada no próprio AssystNet, sem filtros. Fora dessa tela não há limpeza.

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
a edição Chrome 3.5.0 não lê esse formato. Preferências de limpeza e cópias de recuperação não
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
