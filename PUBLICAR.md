# Testar e publicar o Firefox 3.8.3

1. Na extensão instalada, salve e confira um backup JSON antes da atualização.
2. Para teste temporário, extraia `AssystNet-3.8.3-submissao.zip`, abra
   `about:debugging#/runtime/this-firefox`, escolha **Carregar extensão temporária** e selecione
   manifest.json. Instalações temporárias não são uma distribuição permanente.
3. Recarregue as abas pelo navegador (F5/Ctrl+R) depois de atualizar; o botão nativo do AssystNet
   não carrega os scripts novos. Teste um chamado aberto pela Página
   Inicial, pela fila e por link direto, incluindo referências com R/S.
4. Marque/desmarque caixas intermediárias sem confirmação e confira as duas visualizações.
5. Abra a Página Inicial ou a fila completa, atualizada e sem filtros. A limpeza automática estará ativada por padrão.
   Confira o total mostrado no popup. Antes de distribuir amplamente, teste filtros e carregamento
   no AssystNet real; se necessário, pause a limpeza no popup.
6. Teste **Conferir e limpar agora**, **Desfazer a última limpeza e pausar** e o download da cópia
   anterior. Filas vazias requerem confirmação manual para apagar todos os registros.
7. Após conferir a fila, abra um chamado e baixe CSV sem retornar à lista. Confira a data da
   lista salva, os chamados sem tag e a exclusão dos resolvidos. Teste ambos os hosts.
   Em perfil novo, confira que não existem tags predefinidas. Teste um JSON de ida e volta. O formato v3 requer 3.6.0+ no destino;
   backups antigos continuam aceitos. A limpeza não apaga as definições das tags.
8. No cadastro existente da Mozilla, envie `AssystNet-3.8.3-submissao.zip` como nova versão e
   `AssystNet-3.8.3-fontes.zip` no campo dos fontes. Ambos devem pertencer à versão 3.8.3.
9. Use NOTAS-AMO.txt para as notas ao revisor e CONSTRUIR.md para a reprodução. Selecione desktop;
   o fluxo Android não foi validado. A assinatura e a aprovação são realizadas pela Mozilla.

Para atualizar uma instalação permanente, instale a nova versão com o mesmo ID
`assyst-status-tagger@tjce.local`, sem desinstalar a anterior. Fechar o Firefox preserva
storage.local no mesmo perfil. Remover extensão/perfil pode apagar esses dados.
Ao trocar de computador, exporte o JSON atualizado e importe no perfil de destino.
Na passagem de temporária para permanente, use o JSON para garantir a transferência.

## Testar a atualização automática

Siga AUTO_REFRESH.md. Ela começa desativada: habilite com um minuto e observe dois ciclos
em cada tela, preservação nativa de filtros e seleção, sessão expirada e rede lenta. A extensão
não recarrega a página; os botões são os fornecidos pelo próprio AssystNet. O comportamento
real de Ajax/Dojo e seus sinais de carregamento precisam ser conferidos pelo operador.

Notas de atualização sugeridas:

```text
Versão 3.8.3
- Popup organizado por prioridade: tags, backup, relatório, limpeza e atualização do AssystNet.
- Acionamento do controle nativo valueNode do botão Dijit, quando identificado sem ambiguidade.
- Um único clique por tentativa, com as proteções de edição, seleção e carregamento mantidas.
- Estado da atualização com contagem de tentativas automáticas e conclusões observadas na página.
- Tags, contatos, configurações e backup JSON v3 preservados.
Depois de instalar, recarregue a aba pelo navegador uma vez (F5/Ctrl+R).
```
