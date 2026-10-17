# Publicar e compartilhar com a equipe

Para aparecer na loja pública, selecione **Neste site (On this site)** ao enviar a versão no AMO. Para compartilhar somente o XPI assinado, existe a alternativa **Por conta própria (On your own)**. Ambos os canais precisam cumprir as políticas da Mozilla e podem passar por revisão manual.

## 1. Proteger os dados existentes

Fechar e reabrir um Firefox com a extensão **instalada permanentemente** mantém os dados de
`browser.storage.local` no mesmo perfil. Desinstalar a extensão limpa esse armazenamento.
Outro computador ou outro perfil não recebe os dados automaticamente.

Antes da primeira instalação permanente, salve um JSON da versão atual e confira o arquivo.
Se a versão antiga é temporária, mantenha o Firefox aberto até ter esse backup.
Não use a passagem de temporária para permanente como garantia de transferência automática.
Após instalar o XPI, importe o JSON e confira a contagem e algumas marcações.

Se o exportador antigo falhar, obtenha um backup local na **console da extensão antiga**:

1. Abra `about:debugging#/runtime/this-firefox`, localize a extensão e clique em **Depurar**.
2. Na console de um contexto da própria extensão (por exemplo, o popup aberto), execute:

```js
copy(JSON.stringify(await browser.storage.local.get([
  'assyst_tags', 'assyst_custom_tags', 'assyst_ticket_tags', 'assyst_contacts'
]), null, 2))
```

3. Cole no Bloco de Notas, salve como `assyst-backup-antes-da-atualizacao.json`, tipo
   **Todos os arquivos**, codificação UTF-8. Confira se o JSON contém suas marcações.
4. Guarde o arquivo antes de remover uma instalação ou encerrar o Firefox temporário.

A versão 3.5.0 conserva o ID `assyst-status-tagger@tjce.local`, as chaves e os IDs das tags.
Os dados 3.0 são normalizados sem apagar as marcações; nomes longos antigos são preservados.
Na migração para o esquema de contatos, as tags atuais são preservadas. A cópia inicial de migração é mantida quando já existe; caso contrário, os dados anteriores são salvos antes da mudança. O backup JSON inclui todas as datas de contato. Históricos com datas repetidas ou consecutivas exigem a versão 3.5.0 ou posterior para importação.
Quando disponível, **Salvar cópia anterior à migração** exporta essa cópia. Ela é inicial,
não acompanha mudanças futuras e não substitui o backup semanal atual.

## 2. Montar o ZIP de submissão

O pacote deve conter somente estes nove arquivos na **raiz**:

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

Não envie o HTML que gera o pacote, testes, backups de chamados, `.git`, releases anteriores,
nem pastas de ferramentas. Não envie dados reais da equipe para a Mozilla.
Não há compilação, minificação, código remoto nem dependências a instalar.

No Windows, abra PowerShell na pasta desses arquivos e execute:

```powershell
Compress-Archive -Path manifest.json,data.js,background.js,queue.js,content.js,popup.html,popup.css,popup.js,detail.js -DestinationPath AssystNet-3.5.0-submissao.zip -Force
```

A versão destina-se ao Firefox desktop 140 ou posterior. O mínimo Android 142 no manifesto
declara corretamente o suporte à chave de consentimento, mas o fluxo móvel não foi validado.
Selecione somente **Firefox desktop** na submissão para a equipe.

## 3. Pedir assinatura à Mozilla

1. Acesse https://addons.mozilla.org/developers/ e entre com sua conta Mozilla.
2. Abra o cadastro atual da extensão e escolha **Enviar nova versão**. Em **Onde hospedar a versão**, clique em **Alterar** e escolha **Neste site / On this site** para publicação pública. Preencha os dados da página, descrevendo que é necessário acesso autorizado ao AssystNet do TJCE.
   Se a versão anterior já foi assinada, abra a **mesma extensão** na conta do proprietário
   e envie uma **nova versão**, em vez de criar outro cadastro ou mudar o ID.
3. Envie o ZIP. Corrija qualquer erro apontado pelo portal.
4. Se perguntado sobre um pacote de fontes adicional, este projeto não utiliza transformação
   de código: os arquivos dentro do ZIP já são os fontes legíveis. Informe isso; forneça
   material adicional se o revisor solicitar. Use `NOTAS-AMO.txt` como texto para o revisor.
5. Conclua o envio. Quando disponível, baixe o **XPI retornado pela Mozilla**. Após a publicação listada, compartilhe também o link da loja.

O processo pode levar tempo ou exigir revisão manual. A validação local não garante aprovação.
Se o revisor precisar acessar o AssystNet, providencie um ambiente autorizado de teste e dados
fictícios, pelos canais seguros do portal. Nunca forneça sua senha real ou chamados reais.

## 4. Instalar e compartilhar

Para publicação listada, a equipe instala pelo link da loja e recebe as atualizações publicadas por lá. Para distribuição de arquivo, distribua o **XPI assinado**, não o ZIP de submissão. Em cada computador:

1. Abra `about:addons` no Firefox.
2. No menu da engrenagem, escolha **Instalar extensão de um arquivo**.
3. Selecione o XPI e confirme as permissões.
4. Importe o JSON quando for trocar de computador ou substituir uma instalação temporária.
5. Marque um chamado, confira o backup, feche todo o Firefox e reabra o mesmo perfil.
   Confira se a extensão continua instalada e a marcação permanece.

Não desative a verificação de assinaturas e não use `about:debugging` como instalação da equipe.
Se o Firefox for gerenciado pela TI e bloquear instalações, a TI precisará autorizar o XPI.

## Atualizações futuras

- Mantenha o mesmo ID e publique a próxima versão no mesmo cadastro da Mozilla.
- Aumente `version`, assine o novo pacote e compartilhe o novo XPI.
- Cada operador instala o novo XPI **sobre a versão instalada**, no mesmo perfil.
- **Não desinstale primeiro**: desinstalação limpa `storage.local`.
- A permissão `downloads` é nova em relação à 3.0; aceite-a quando o Firefox solicitar.
- A 3.1.2 acrescenta o domínio HTTPS `cati.tjce.jus.br`; aceite o novo acesso se solicitado.
  Os endereços mostram a mesma base; a seleção da tag usa a mesma referência do chamado
  nos dois sites e não precisa de outra migração.
- Salve um JSON antes da atualização. Atualização normal mantém os dados; o backup cobre
  a migração inicial de temporária, mudança de perfil ou problemas operacionais.
- Esta distribuição não listada não tem servidor de atualizações configurado: novas versões
  são instaladas manualmente. Publicação listada no AMO permitiria atualizações automáticas,
  mas exige uma página pública. Não foi inventado um `update_url` sem hospedagem real.

## Verificações realizadas e limite da análise

Foram testados com APIs simuladas: dados antigos 3.0/2.0, nomes longos, referências alfanuméricas,
exportação/restauração, gravações simultâneas, a cópia anterior à migração e reabertura de
contextos usando o estado salvo. O pacote deve passar por `web-ext lint` e conferência de arquivos.
Um XPI assinado ainda não foi produzido nem instalado: a assinatura depende da sua conta
Mozilla e o teste real de reinício deve ser concluído com o XPI retornado pelo portal.

## Fontes oficiais consultadas

- https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/
- https://extensionworkshop.com/documentation/publish/submitting-an-add-on/
- https://extensionworkshop.com/documentation/publish/add-on-policies/
- https://extensionworkshop.com/documentation/publish/add-on-policies-faq/
- https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
- https://extensionworkshop.com/documentation/manage/updating-your-extension/
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/incognito

A consulta foi feita pelos fontes oficiais MDN (`mdn/content`) e Mozilla
(`mozilla/extension-workshop`) no GitHub, pois o proxy bloqueou os sites de documentação.

## Pacote de fontes da versão 3.5.0

Envie `AssystNet-3.5.0-submissao.zip` como a extensão e `AssystNet-3.5.0-fontes.zip` no campo de código-fonte da mesma submissão. O pacote de fontes contém os nove arquivos legíveis e `build.py`. Siga `CONSTRUIR.md` para reproduzir o ZIP byte a byte. Não envie este pacote de fontes em uma submissão da versão 3.4.0, pois o código foi atualizado.

Para instalar e publicar a edição Chrome, siga CHROME.md.
