# Fila salva e tags pessoais — 3.8.3

## Planilha de qualquer tela

Ao conferir a fila completa e sem filtros, a extensão salva `assyst_queue_snapshot` em
`browser.storage.local`: total da fila, referências abertas e data da conferência. A gravação
acontece junto com a limpeza e sua cópia de recuperação, após duas leituras concordantes e
verificação final de contexto. Mudanças de status entre as leituras também invalidam a operação.
Uma fila vazia validada pode salvar um relatório vazio sem apagar marcações; apagar tudo
continua exigindo confirmação manual.

O botão **Baixar planilha da fila (CSV)** usa essa lista salva sem abrir, consultar ou navegar
para outra aba. Inclui chamados sem tag e aplica as tags/contatos atuais no momento do download.
Não usa a presença de tags como prova de que um chamado continua aberto. O popup e o nome do CSV
mostram quando a lista foi conferida. As colunas, BOM, separador e ordenação permanecem iguais.

Essa lista é a última observação válida, não uma consulta em tempo real. Novos chamados,
transferências e resoluções no servidor aparecem após nova conferência na Página Inicial ou na
fila completa. A limpeza automática precisa estar ligada para atualizar a lista automaticamente;
com ela desligada, use **Conferir e limpar agora**. Sem lista salva, o CSV tenta ler uma fila
visível completa e sem filtros, sem apagar marcações. Uma leitura incompleta interrompe o CSV.

Fechar o navegador mantém a lista no mesmo perfil. Importar JSON (mesclar ou substituir) ou
desfazer uma limpeza invalida a lista para exigir nova conferência. O backup normal continua
JSON v3 de tags/contatos e não carrega a lista de fila de outro computador. Ao atualizar da
3.7.0, aguarde a primeira conferência para habilitar o download independente da tela.

## Página Inicial

Na rota #homepage, somente o painel cujo título h2.axios-homepage-titlebar-inner é
“Chamados Atribuídos a mim”, dentro de uma única .axios-homepage-titlebar-outer visível, é
considerado. O ancestral precisa conter a grade sem englobar títulos de outros painéis.
Contador, referências, coluna Status (Texto), filtros e loading são conferidos nesse painel.
Títulos duplicados, tabelas ambíguas, filtro preenchido, contagem ausente/incompleta ou mudança
de rota impedem a limpeza e não substituem a última lista válida. IDs Dojo não são utilizados.
O observer existente é reutilizado; nenhuma permissão ou requisição privada foi adicionada.

## Tags e compatibilidade

Perfis novos começam com lista vazia. Cada operador cria suas próprias tags. Atualizar a
extensão preserva todas as definições e marcações existentes; apagar uma definição usada
apagaria suas marcações. Na importação de formatos antigos sem lista de definições, as tags
legadas são recuperadas somente se referenciadas pelos chamados. Tags personalizadas explícitas
continuam preservadas. Nenhuma definição predefinida é adicionada a um perfil vazio.

O mesmo manifesto injeta os mesmos scripts em http://cati.tj.ce.gov.br/assystnet/ e
https://cati.tjce.jus.br/assystnet/. Os dados são compartilhados entre esses hosts no mesmo
perfil; Firefox/Chrome e computadores diferentes usam JSON para transferir as marcações.

## Conferir no AssystNet real

Nos dois endereços, teste tags/contatos na fila e no chamado, atualização nativa nas duas telas,
conferência automática no painel próprio, fila virtual maior que a área visível, filtros e
loading. Após conferir, abra um chamado e baixe CSV: compare referências abertas, “Sem tag”,
data da lista e exclusão de resolvidos/transferidos. Confira também importação JSON, reinício,
perfil novo sem tags e atualização de perfil antigo. Os testes sintéticos não comprovam o
comportamento Ajax/Dojo da implantação institucional nem diferenças de DOM entre os hosts.
