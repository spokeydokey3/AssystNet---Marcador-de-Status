# Reprodução dos pacotes — 3.8.1

As fontes legíveis são mantidas diretamente. O pacote Firefox contém dez arquivos na raiz:
manifest.json, data.js, background.js, queue.js, content.js, popup.html, popup.css, popup.js, detail.js e autoRefresh.js.
`build.py` copia esses bytes sem transformação e fixa os metadados ZIP. Não há transpilação,
concatenação, minificação, bibliotecas externas ou acesso à rede durante a construção.

## Requisitos e instalação

- Windows 10/11, Linux ou macOS, com permissão para escrever na pasta extraída.
- Python 3.12 ou posterior. Testado em Linux com Python 3.12.14.
- Instale pelo site oficial https://www.python.org/downloads/ ou pelo gerenciador do sistema.
  Windows: habilite o Python Launcher; um instalador da série 3.12 permite usar `py -3.12`.
  Debian/Ubuntu com Python 3.12 disponível: `sudo apt-get update` e `sudo apt-get install python3`.
  Confira a versão antes de construir. Não é necessário Node, npm, Firefox ou SDK para o ZIP.

## Passos completos para reproduzir o Firefox

1. Extraia `AssystNet-3.8.1-fontes.zip`.
2. Abra um terminal na pasta que contém `manifest.json` e `build.py`.
3. Execute:

```sh
python3 --version
python3 build.py --browser firefox
```

No Windows com Python 3.12:

```powershell
py -3.12 --version
py -3.12 build.py --browser firefox
```

4. O resultado é `releases/AssystNet-3.8.1-submissao.zip`.
5. O SHA-256 é impresso pelo script e registrado em `REPRODUCAO.txt`. Para comparar com o ZIP enviado:

```sh
python3 build.py --browser firefox --verify /caminho/AssystNet-3.8.1-submissao.zip
```

No Windows, use `py -3.12` no lugar de `python3` e informe o caminho local entre aspas.
A comparação é byte a byte. Datas, ordem dos arquivos e permissões ZIP são fixas.

O comando `python3 build.py --sources` empacota as fontes, testes e documentação. O projeto
também conserva `--browser chrome`, que gera manifesto Chrome e inclui seus adaptadores no
popup e nos content scripts; os JavaScripts são copiados sem alteração. Esse modo não adiciona
permissões Chrome ao Firefox. Para construir esta atualização Chrome, execute:

```sh
python3 build.py --browser chrome
```

O resultado é `releases/AssystNet-3.8.1-chrome.zip`. Para reproduzir e comparar os bytes:

```sh
python3 build.py --browser chrome --verify /caminho/AssystNet-3.8.1-chrome.zip
```

Esta entrega inclui `AssystNet-3.8.1-fontes.zip`, com os fontes compartilhados. Ele pode
ser reproduzido por `python3 build.py --sources --output releases/AssystNet-3.8.1-fontes.zip`.
O pacote Chrome usa os mesmos serializadores e formato JSON v3 do Firefox 3.6.0.

## Validação opcional

Os 72 testes de dados/background usam somente Node.js 24 (testado em 24.19.0), instalável em
https://nodejs.org/. Execute:

```sh
node --test tests/*.test.cjs
```

Os testes DOM e Chromium são adicionais, com APIs WebExtension simuladas. Instale as ferramentas
em uma pasta externa ao projeto, sem incluir node_modules no pacote:

```sh
npm install --prefix /tmp/assyst-tools --no-audit --no-fund jsdom@26.1.0 @sinonjs/fake-timers@13.0.5 playwright@1.64.1 web-ext@10.8.0
ASSYST_JSDOM_MODULE=/tmp/assyst-tools/node_modules/jsdom ASSYST_FAKE_TIMERS_MODULE=/tmp/assyst-tools/node_modules/@sinonjs/fake-timers node --test tests/dom.cjs tests/refresh-dom.cjs
ASSYST_PLAYWRIGHT_MODULE=/tmp/assyst-tools/node_modules/playwright ASSYST_CHROMIUM_PATH=/usr/bin/chromium node tests/chrome-browser.cjs
ASSYST_PLAYWRIGHT_MODULE=/tmp/assyst-tools/node_modules/playwright ASSYST_CHROMIUM_PATH=/usr/bin/chromium node tests/refresh-browser.cjs
```

Os caminhos e a sintaxe das variáveis acima são exemplos Linux/macOS. O Chromium deve estar
instalado para o último comando; ele não é necessário para construir o pacote. Veja VALIDACAO.md
para os resultados e limites. Para lint, extraia o ZIP Firefox em uma pasta e execute
`web-ext lint --source-dir /caminho/da/pasta` com web-ext 10.8.0.

## Arquivos para distribuição

- `AssystNet-3.8.1-submissao.zip`: nova versão da extensão.
- `AssystNet-3.8.1-fontes.zip`: campo **Enviar código-fonte** da mesma submissão 3.8.1; fontes compartilhados das duas edições.
- `AssystNet-3.8.1-chrome.zip`: pacote Chrome para teste e envio como atualização no cadastro existente da Chrome Web Store.

O ZIP de execução não inclui testes, bibliotecas, ferramentas, dados reais de chamados,
credenciais ou versões anteriores. O ZIP de fontes inclui o necessário para construir e conferir.
Referência: https://extensionworkshop.com/documentation/publish/source-code-submission/
