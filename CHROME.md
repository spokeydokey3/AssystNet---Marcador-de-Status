# AssystNet para Chrome — 3.7.0

Esta é uma extensão Manifest V3 para Chrome desktop 116 ou posterior. Usa os mesmos
dados, tags, quatro tentativas de contato, interface e relatórios da versão Firefox.
É desenvolvida no mesmo projeto, com pacote e manifesto específicos para cada navegador.

## Instalar para testar

1. Baixe e extraia `AssystNet-3.7.0-chrome.zip` em uma pasta permanente.
2. Abra `chrome://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta extraída que contém `manifest.json`.
4. No menu de extensões, fixe o ícone do AssystNet se desejar.
5. Recarregue a página do AssystNet e teste as marcações na fila e na página individual.

Esse modo não exige iniciar um programa auxiliar. A instalação permanece no perfil ao
fechar o Chrome. Mantenha a pasta extraída; não use uma pasta temporária nem remova a extensão.
Para atualizar durante os testes, substitua os arquivos na mesma pasta e use **Recarregar**
no cartão da extensão. Não remova a instalação anterior nem carregue a atualização de outra
pasta como uma extensão diferente: o ID da instalação sem compactação depende da pasta.
Exporte um backup JSON antes de atualizar e recarregue todas as abas do AssystNet depois.
Em computadores administrados, a política do Chrome pode restringir o modo do desenvolvedor;
nesse caso a distribuição precisa ser combinada com a TI.

## Levar os dados do Firefox

1. Mantenha **Firefox e Chrome na versão 3.6.0 ou posterior** para trocar backups novos.
   No navegador de origem, use **Salvar backup JSON** e confira o download.
2. No Chrome, abra a extensão e **Importar backup JSON**. Uma janela de transferência será aberta.
3. Nessa janela, escolha o JSON, confira a prévia e confirme **Mesclar** ou **Substituir**.
4. Confira alguns chamados, tags e tentativas antes de abandonar o perfil anterior.

JSON é o formato de restauração. CSV é o relatório da fila atual. Os dois navegadores e os
diferentes computadores têm armazenamentos separados; não há sincronização automática.
O JSON v3 é o mesmo nos dois navegadores e preserva as posições das quatro caixas, tags,
cores, referências completas e datas informativas. Os formatos antigos, inclusive os backups
do Chrome 3.5.0, continuam aceitos e são convertidos. Clientes 3.5.0 ou anteriores não importam
o JSON v3: atualize o destino primeiro. Preferências de limpeza e cópias de recuperação são
locais a cada perfil; não viajam no backup normal. Para levar a cópia anterior à limpeza,
baixe-a pelo botão específico. CSV tem o mesmo formato nos dois navegadores, com UTF-8/BOM,
ponto e vírgula e datas de marcação; ele não substitui o JSON para restaurar os dados.
Dados ficam em `browser.storage.local`, que a adaptação Chrome direciona somente a
`chrome.storage.local`. Fechar o navegador não os apaga. Remover a extensão ou o perfil
pode apagá-los. Continuem exportando o JSON ao trocar de computador.

## Testes operacionais sugeridos

- Criar uma tag com acentos, trocar sua cor e aplicar a um chamado.
- Marcar/desmarcar qualquer caixa de contato sem confirmação, incluindo posições intermediárias.
- Abrir o chamado por `#events/2142782` e por uma referência com prefixo, como `#events/R2478233`.
- Navegar entre chamados e rolar a fila; a marcação deve permanecer ligada ao número correto.
- Exportar/importar JSON entre Chrome e Firefox, conferindo as marcações.
- Exportar CSV com a fila “Chamados atribuídos a mim” aberta e atualizada. Somente abertos
  da fila conferida devem aparecer, ordenados por tag e referência.
- Fechar completamente e reabrir o Chrome no mesmo perfil, conferindo os dados.
- Abrir uma referência pela Página Inicial e conferir os mesmos controles da fila.
- Conferir a limpeza da fila sem filtros, a recuperação da última limpeza e a pausa automática.

Cada marcação recebe a data atual, que pode não ser a data do contato real. Datas, dias corridos
e referência de sete dias são apenas informativos; não há bloqueio por intervalo, fins de
semana, feriados ou resposta informada. A extensão não autoriza nem realiza encerramentos.

## Atualização automática da lista

Na versão 3.7.0, ative “Acionar automaticamente o botão Atualizar” no popup e escolha
30 segundos, 1, 2 ou 5 minutos. O padrão é desligado, um minuto, sem segundo plano.
O recurso usa os botões nativos da Página Inicial e da fila própria, sem recarregar a página.
São adiados cliques durante edição, seleção, carregamento, gravação ou conferência da fila.
Se o término não for observado, novas tentativas automáticas são pausadas.
Veja AUTO_REFRESH.md para testar o comportamento nativo, os filtros e a sessão autenticada.
O JSON v3 continua compatível com o Firefox/Chrome 3.6.0; não é preciso migrar os backups.
As preferências de atualização são locais e não entram nesse JSON.

## Limpeza da fila

Está ativada por padrão ao abrir/atualizar “Chamados atribuídos a mim” na rota #eventMonitor/4.
São exigidas duas leituras completas da grade e uma nova verificação do contexto. Filtros
detectados, carregamento, outra fila ou leitura incompleta impedem exclusões. Somente vínculos
de tags e contatos de chamados ausentes são removidos; as definições das tags permanecem.
Uma fila vazia exige confirmação manual. O popup separa o total da última fila conferida
do número de registros com tag. A cópia anterior à última limpeza permite recuperar registros;
desfazer pausa a limpeza para evitar apagá-los novamente. Uma nova limpeza com remoções
substitui essa cópia. Confira o comportamento no AssystNet real antes de distribuir à equipe.

## Publicar para a equipe

Depois de testar no ambiente real, envie `AssystNet-3.7.0-chrome.zip` como atualização no mesmo cadastro da Chrome Web Store.
O ZIP já contém o manifesto e os arquivos de execução na raiz. A listagem, imagens, justificativas
das permissões e declarações de privacidade são preenchidas no painel; esta entrega não publica na loja.
Após a instalação da loja, as atualizações da mesma extensão mantêm o ID e o armazenamento.
A passagem da instalação de teste para a instalação da loja pode mudar o ID: transfira os dados
por JSON antes de remover a instalação anterior.

Permissões: `storage` para os dados locais, `downloads` para JSON/CSV e `offscreen` para criar
os arquivos localmente quando o serviço de segundo plano do Chrome não tem acesso a URLs Blob.
O documento auxiliar é fechado depois que seus downloads terminam ou são cancelados.
Não há telemetria, código remoto, envio de chamados para terceiros ou permissões para outros sites.
O acesso está restrito aos dois endereços AssystNet já usados pela equipe.

## Construir

```sh
python3 build.py --browser chrome
```

O resultado é `releases/AssystNet-3.7.0-chrome.zip`. Veja `CONSTRUIR.md` para todos os comandos,
requisitos e verificações de reprodução. O arquivo `AssystNet-3.7.0-fontes.zip` contém o código
compartilhado e os adaptadores dos dois navegadores.
