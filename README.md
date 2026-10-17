# AssystNet · Marcador de Status

Extensão Chrome/Firefox Manifest V3 para marcar chamados na tabela do AssystNet.
JavaScript, HTML e CSS puros, sem frameworks, bundlers ou dependências de execução.
Os dados ficam exclusivamente em `browser.storage.local`, no perfil de cada navegador e computador.

## Versão 3.5.0 — Chrome e Firefox

A edição Chrome usa service worker, adaptação local das APIs e um documento offscreen para
downloads. O código de dados, interface e captura da fila é compartilhado. Não há frameworks,
bundlers nem dependências de execução. Para instalar e transferir os dados do Firefox, siga
[CHROME.md](CHROME.md). A distribuição nas lojas é separada; backups JSON são portáveis.


Permite registrar até quatro tentativas no mesmo dia ou em dias consecutivos, tanto na fila
quanto ao lado do número na página do chamado. No Firefox, mantém o ID da extensão, as tags e os históricos
da versão 3.4.1. No Chrome, use o backup JSON para transferir os dados entre navegadores. Cada nova marcação recebe a data local de hoje; marcar contatos anteriores
não recupera suas datas reais. O aviso de revisão mantém sete dias desde a primeira marcação
e o dia seguinte à quarta tentativa, sem resposta informada.

A página individual usa a referência completa da rota `#events/`, inclusive prefixos como `R`,
e confere o número visível no breadcrumb. `eventType` e `currentIndex` não alteram a identificação.
Os controles compartilham os mesmos dados da fila; durante mudanças de chamado, ações em
controles antigos são bloqueadas. Não há um segundo MutationObserver.

O CSV lê uma nova lista de referências da fila “Chamados atribuídos a mim” a cada exportação.
Percorre a rolagem do dgrid e só gera o arquivo quando a contagem de referências únicas coincide
com o contador “Exibição de eventos … de …”. Confere a coluna “Status (Texto)” e inclui somente
status Aberto/Open. A ordenação é por tag e número, com “Sem tag” para referências sem marcação.
Atualize a fila no AssystNet, remova filtros e não altere a seleção durante a coleta.
A leitura falha com uma mensagem caso não reconheça a tabela/contador, detecte mudanças ou
não consiga carregar a fila inteira em 45 segundos. A coleta não consulta APIs privadas nem
percorre automaticamente páginas controladas por botões; paginação desse tipo requer adaptação.
O HTML real do AssystNet ainda deve ser validado pelo usuário. Os testes DOM usam uma simulação
do dgrid com reciclagem de linhas, incluindo filas completas, incompletas, vazias e alteradas.

A seção “Chamados marcados” permite buscar por número/tag e remover uma marcação de um
chamado que saiu da fila, sem excluir a definição da tag. As marcações antigas são preservadas
no JSON; nenhum histórico é apagado automaticamente durante a exportação.

Remove a propriedade `background.persistent`, que gera um aviso ao carregar o manifesto
no Firefox. O Manifest V3 já usa um background não persistente; esta correção não altera
as tags, as marcações, o ID da extensão ou o armazenamento local.

O manifesto permite execução nos endereços HTTP antigo e HTTPS novo:
`https://cati.tjce.jus.br/assystnet/*`. A tabela no novo endereço ainda precisa ser validada
no Firefox real. Os endereços mostram a mesma base de chamados, conforme confirmado pelo
usuário. O código mantém as marcações por referência do chamado, compartilhadas entre os
dois endereços no mesmo perfil, sem necessidade de outra migração.

Para assinar, instalar permanentemente e compartilhar com a equipe, siga [PUBLICAR.md](PUBLICAR.md).
Para aparecer na loja, envie uma nova versão no mesmo cadastro e escolha “Neste site”.
O Firefox desktop mínimo é 140.0. O fluxo Android não foi validado; selecione desktop no portal.
O uso em navegação privada foi desabilitado para evitar persistir dados dessas sessões.

- Backup JSON validado, com prévia e modos de mesclagem ou substituição.
- Importação em uma janela independente, que permanece aberta durante a seleção de arquivo.
- Downloads gerenciados pela API do Firefox; fechar o popup não revoga o arquivo imediatamente.
- Planilha CSV com chamado, tag, contagem, quatro datas, resposta informada e acompanhamento, somente dos abertos na fila atual conferida.
- Popup com busca, contagem de chamados por tag e edição recolhível.
- Cores sugeridas, seletor nativo de cores, HEX e prévia com contraste automático.
- Modal inline com estilos isolados em Shadow DOM, navegação por teclado e fechamento por Escape.
- Gravações serializadas em um único background para evitar sobrescritas entre abas e frames.
- Atualização otimista das tags, com retorno ao estado salvo e mensagem quando a gravação falha.
- Observer agrupado por frame, sem leitura do armazenamento a cada alteração do DOM.
- Identificação atualizada quando o dgrid reutiliza ou recria uma célula.
- Excluir uma tag também remove seus vínculos; uma lista vazia não restaura as tags padrão.
- Nomes longos criados pelo modal antigo são preservados na migração.
- A primeira migração salva uma cópia local dos dados anteriores, exportável pelo popup.

## Tentativas de contato

Ao lado de cada tag há quatro caixas pequenas e um botão de detalhes. A próxima caixa vazia fica disponível após a gravação da anterior, inclusive no mesmo dia. Cada clique conta uma tentativa e recebe automaticamente a data local atual. As quatro datas podem ser iguais; dias sem marcação não aumentam a contagem. A extensão não verifica se o contato ocorreu nem exige intervalo entre tentativas.

Desmarcar a última caixa pede confirmação e desfaz somente a última tentativa. Os detalhes mostram as datas e permitem informar/desmarcar uma resposta ou limpar o acompanhamento com confirmação. Informar resposta mantém as datas e interrompe a contagem e a indicação de encerramento. Limpar apaga as datas; faça um backup antes se precisar preservá-las.

Quatro contatos não autorizam uma ação automática no AssystNet. O controle destaca **revisar encerramento por falta de comunicação** somente no dia seguinte ao quarto contato, quando também passaram sete dias desde o primeiro, sem resposta informada. O operador confere a situação e realiza qualquer encerramento no sistema. A extensão não lê respostas por telefone ou outros canais. Backups aceitam datas iguais ou consecutivas, mas rejeitam datas impossíveis, fora da ordem cronológica ou mais de quatro tentativas.

As caixas usam estilos isolados em Shadow DOM. O mesmo observer já existente atualiza as linhas recicladas; não há observer adicional nem gravações durante a rolagem. Ao retornar à página ou virar o dia, a disponibilidade é recalculada. Um clique atualiza visualmente antes de aguardar o armazenamento; falhas revertem ao último estado confirmado.

O estado local passa do esquema 1 para 2, mantendo `assyst_ticket_tags` e as definições existentes. A atualização da 3.4.0 para 3.4.1 mantém esse esquema. Os contatos usam a chave separada `assyst_contacts`. Os backups mantêm `formatVersion: 2`; históricos com datas iguais ou consecutivas exigem 3.4.1 ou posterior. Versões antigas que exigem dias alternados podem rejeitar esses históricos. Backups antigos mesclados preservam contatos locais. Na mesclagem de backups novos, o histórico recebido de um mesmo chamado prevalece por inteiro; tentativas não são somadas. A opção Substituir também substitui contatos, com confirmação. Ao trocar de computador, exporte o JSON atualizado.

## Arquivos necessários

Mantenha estes arquivos juntos na raiz da pasta ou pacote:

```text
manifest.json
data.js
background.js
queue.js
content.js
popup.html
popup.css
popup.js
detail.js
```

A versão mantém o ID `assyst-status-tagger@tjce.local` e as chaves de dados existentes.
Atualizar uma instalação permanente no mesmo perfil mantém essas marcações; não desinstale
primeiro. Fechar o Firefox não limpa `storage.local`. Na passagem de uma instalação temporária
para a permanente, exporte primeiro e importe depois. A cópia anterior à migração não acompanha
novas marcações; continue salvando um JSON atualizado antes de trocar de computador.
O manifesto mantém os content scripts restritos aos caminhos `/assystnet/*` dos dois endereços e solicita somente
as permissões `storage` e `downloads`. A permissão de downloads permite salvar JSON e CSV.

## Testar no Firefox

1. Faça uma cópia dos dados da instalação atual antes de removê-la ou trocar seu perfil.
   Se o exportador antigo falhar, preserve a instalação/perfil até testar a atualização com o mesmo ID.
2. Extraia o pacote ZIP em uma pasta. Abra `about:debugging#/runtime/this-firefox`.
3. Escolha **Carregar extensão temporária** e selecione `manifest.json`.
4. Abra ou recarregue o AssystNet. Verifique as tags na coluna Referência.
5. Teste escolha de tag, criação inline, edição de cor, rolagem da tabela, exportação e importação.

O ZIP é um pacote de código para teste, **não é um XPI assinado**. Instalações temporárias
são removidas quando o Firefox reinicia; não use esse modo como instalação permanente no escritório.
Para uso contínuo no Firefox padrão, a distribuição precisa de um XPI assinado pela Mozilla
(inclusive distribuição não listada) ou do mecanismo autorizado pela administração de TI.
Esta entrega não assina, publica nem instala a extensão nos computadores do escritório.

## Levar marcações para outro computador

1. No computador de origem, abra a extensão e clique em **Salvar backup JSON**.
2. Conclua o download e confira o arquivo nos downloads do Firefox. Guarde o JSON em um local
   acessível no próximo computador conforme a prática do escritório.
3. No destino, use a mesma extensão instalada no perfil correto do Firefox.
4. Clique em **Importar backup JSON**. Uma janela será aberta; nela, clique novamente no botão
   para escolher o arquivo. Confira a quantidade de tags e chamados antes de confirmar.
5. Use **Mesclar** para preservar as marcações locais. Para o mesmo chamado ou ID de tag,
   os valores do arquivo importado prevalecem. Use **Substituir** somente para restaurar exatamente
   o conjunto do backup; essa opção remove os dados locais após confirmação.

A importação atualiza as abas do AssystNet automaticamente. O backup inclui marcações fora da
tabela visível e preserva referências alfanuméricas, como `S2471375` e `R2478223`.
Não há sincronização automática entre computadores. Antes de sair, exporte um backup atualizado;
o arquivo anterior não acompanha mudanças feitas posteriormente.

São aceitos backups sem campo de versão, os formatos 1 e 2 e o formato antigo com
`assyst_custom_tags` e identificadores `key`. Definições ausentes de tags ainda usadas são
recuperadas com nome igual ao ID e uma cor neutra, preservando a marcação. Arquivos inválidos
não são aplicados. Listas vazias são preservadas. A seleção de arquivo limita o tamanho a 32 MB.

## Planilha

Abra “Chamados atribuídos a mim”, remova filtros, atualize a fila e clique em **Exportar minha fila atual (CSV)** no ícone da extensão dessa aba. O relatório confere a fila inteira e inclui somente os abertos, incluindo chamados sem tag. Contém Chamado, Tag, Tentativas, Contato 1 a 4, Resposta informada em e Acompanhamento. Cada chamado ocupa uma linha, ordenada por tag e número. Contatos antigos fora da fila ficam no JSON, nunca no relatório. A janela de transferência usa a aba de origem capturada ao abrir; se ela for fechada ou mudar de site, reabra a janela a partir da fila.

O CSV usa UTF-8 com BOM, separador `;`, aspas escapadas e linhas CRLF para compatibilidade
com Excel e LibreOffice. Caso necessário, importe como **UTF-8**, separado por **ponto e vírgula**.
Para preservar zeros iniciais de referências numéricas, configure a coluna Chamado como **Texto**
na importação da planilha. Nomes que poderiam ser interpretados como fórmulas recebem um apóstrofo
de proteção. O CSV é para consulta; para restaurar a extensão, use o backup **JSON**.

## Desenvolvimento e validação

Use este checkout existente; tarefas na nuvem já são isoladas e não exigem outro worktree.
Não há instalação de dependências da extensão nem serviço para iniciar.

Com Node.js, execute os testes de dados, migração, serialização e downloads com APIs simuladas:

```sh
node --test tests/*.test.cjs
```

Para validar com a ferramenta da Mozilla, pode-se instalar `web-ext` em uma pasta de ferramentas
fora do projeto e executar:

```sh
web-ext lint --source-dir . --ignore-files 'chrome/**' 'tests/**' 'releases/**' '*.md' '*.py' NOTAS-AMO.txt REPRODUCAO.txt
```

Os testes automatizados não substituem o teste de integração no Firefox e no AssystNet real.
Também foram exercitados DOM reciclado, atualização otimista, erros de gravação, criação inline,
prévia de importação e controles do popup com APIs simuladas. A interface foi renderizada em
Chromium para inspeção visual; a execução nativa das APIs WebExtension no Firefox ainda deve ser
verificada no ambiente do usuário.
