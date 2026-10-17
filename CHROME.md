# AssystNet para Chrome — 3.5.0

Esta é uma extensão Manifest V3 para Chrome desktop 116 ou posterior. Usa os mesmos
dados, tags, quatro tentativas de contato, interface e relatórios da versão Firefox.
É desenvolvida no mesmo projeto, com pacote e manifesto específicos para cada navegador.

## Instalar para testar

1. Baixe e extraia `AssystNet-3.5.0-chrome.zip` em uma pasta permanente.
2. Abra `chrome://extensions` e ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e selecione a pasta extraída que contém `manifest.json`.
4. No menu de extensões, fixe o ícone do AssystNet se desejar.
5. Recarregue a página do AssystNet e teste as marcações na fila e na página individual.

Esse modo não exige iniciar um programa auxiliar. A instalação permanece no perfil ao
fechar o Chrome. Mantenha a pasta extraída; não use uma pasta temporária nem remova a extensão.
Para atualizar durante os testes, substitua os arquivos na mesma pasta e use **Recarregar**
no cartão da extensão. Exporte um backup JSON antes de qualquer troca de instalação.
Em computadores administrados, a política do Chrome pode restringir o modo do desenvolvedor;
nesse caso a distribuição precisa ser combinada com a TI.

## Levar os dados do Firefox

1. No Firefox com a versão 3.4.1 ou posterior, use **Salvar backup JSON** e confira o download.
2. No Chrome, abra a extensão e **Importar backup JSON**. Uma janela de transferência será aberta.
3. Nessa janela, escolha o JSON, confira a prévia e confirme **Mesclar** ou **Substituir**.
4. Confira alguns chamados, tags e tentativas antes de abandonar o perfil anterior.

JSON é o formato de restauração. CSV é o relatório da fila atual. Os dois navegadores e os
diferentes computadores têm armazenamentos separados; não há sincronização automática.
Dados ficam em `browser.storage.local`, que a adaptação Chrome direciona somente a
`chrome.storage.local`. Fechar o navegador não os apaga. Remover a extensão ou o perfil
pode apagá-los. Continuem exportando o JSON ao trocar de computador.

## Testes operacionais sugeridos

- Criar uma tag com acentos, trocar sua cor e aplicar a um chamado.
- Marcar quatro tentativas no mesmo dia, desfazer a última e informar uma resposta.
- Abrir o chamado por `#events/2142782` e por uma referência com prefixo, como `#events/R2478233`.
- Navegar entre chamados e rolar a fila; a marcação deve permanecer ligada ao número correto.
- Exportar/importar JSON entre Chrome e Firefox, conferindo as marcações.
- Exportar CSV com a fila “Chamados atribuídos a mim” aberta e atualizada. Somente abertos
  da fila conferida devem aparecer, ordenados por tag e referência.
- Fechar completamente e reabrir o Chrome no mesmo perfil, conferindo os dados.

Cada tentativa recebe a data atual. O aviso de revisão conserva sete dias desde a primeira
marcação e o dia seguinte à quarta, sem resposta informada. A extensão não encerra chamados.

## Publicar para a equipe

Depois de testar no ambiente real, envie `AssystNet-3.5.0-chrome.zip` ao painel da Chrome Web Store.
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

O resultado é `releases/AssystNet-3.5.0-chrome.zip`. Veja `CONSTRUIR.md` para todos os comandos,
requisitos e verificações de reprodução. O arquivo `AssystNet-3.5.0-fontes.zip` contém o código
compartilhado e os adaptadores dos dois navegadores.
