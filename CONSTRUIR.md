# Reprodução do pacote enviado à Mozilla — versão 3.5.0

Este pacote contém as fontes legíveis e mantidas diretamente: JavaScript, HTML e CSS.
`build.py` produz ZIPs com metadados fixos. Firefox contém nove arquivos de execução. Chrome
contém os nove arquivos compartilhados e cinco adaptadores; o script cria seu manifesto
específico e inclui o adaptador antes dos scripts do popup. Os arquivos JavaScript são copiados
sem transformação.
Não transpila, concatena, minimiza ou ofusca JavaScript. Não há bibliotecas externas,
instalação de npm, dependências de produção, acesso à rede ou credenciais durante a construção.

## Selecionar o navegador

```sh
python3 build.py --browser chrome
python3 build.py --browser firefox
python3 build.py --sources
```

Os resultados são `releases/AssystNet-3.5.0-chrome.zip`,
`releases/AssystNet-3.5.0-submissao.zip` (Firefox) e
`releases/AssystNet-3.5.0-fontes.zip` (fontes compartilhadas).
Os passos detalhados abaixo usam o Firefox, que é o padrão. Para reproduzir o Chrome,
acrescente `--browser chrome` aos comandos, inclusive ao usar `--verify`.

```sh
python3 build.py --browser chrome --verify /caminho/AssystNet-3.5.0-chrome.zip
```

## Sistema operacional e programas

- Windows 10/11, Linux ou macOS, com permissão para escrever na pasta extraída.
- Python **3.12 ou posterior**. Construção e reprodução verificadas em Linux com Python **3.12.14**.
- Nenhum outro programa é necessário para construir o ZIP. Node e Firefox não são requisitos de construção.

Instalação do Python:

- Windows/macOS: use o instalador oficial em https://www.python.org/downloads/. No Windows,
  uma instalação Python 3.12 com o Python Launcher permite executar `py -3.12`.
  O instalador 3.12.10 também atende ao requisito da série 3.12.
- Debian/Ubuntu com Python 3.12 disponível: `sudo apt-get update` e `sudo apt-get install python3`.
  Confira a versão; em outros sistemas use o pacote Python 3.12+ do sistema ou o instalador oficial.

## Passos completos

1. Extraia `AssystNet-3.5.0-fontes.zip` preservando todos os arquivos.
2. Abra um terminal na pasta que contém `manifest.json` e `build.py`.
3. Confira o Python e execute o único passo técnico de construção:

Linux/macOS:

```sh
python3 --version
python3 build.py
```

Windows PowerShell:

```powershell
py -3.12 --version
py -3.12 build.py
```

Se instalou uma versão mais recente no Windows, use o seletor correspondente,
por exemplo `py -3.13`, ou `python` quando configurado pelo instalador.

4. O resultado é `releases/AssystNet-3.5.0-submissao.zip`. O script imprime seu SHA-256.
5. Para conferir uma cópia do ZIP enviado, compare os bytes, usando o caminho desse arquivo:

```sh
python3 build.py --verify /caminho/AssystNet-3.5.0-submissao.zip
```

No Windows use `py -3.12 build.py --verify "C:\caminho\AssystNet-3.5.0-submissao.zip"`.
O SHA-256 de referência está em `REPRODUCAO.txt`. O ZIP usa ordem de arquivos,
datas, permissões e método de armazenamento fixos. Os bytes das fontes não são alterados.

## Validação opcional

Os testes nativos requerem Node.js 24 (testado com 24.19.0), instalável em https://nodejs.org/.
Não instalam pacotes nem participam da construção:

```sh
node --test tests/*.test.cjs
```

Validação desta entrega: 46 testes automatizados de dados, background e adaptadores Chrome com APIs simuladas.
O script opcional `tests/chrome-browser.cjs` usa Playwright 1.64.1 e Chromium 151 para
exercitar a interface e URLs Blob, com APIs de extensão simuladas. Essas ferramentas
não são incluídas nos pacotes e não são necessárias à construção.
A instalação nativa da extensão no navegador deste ambiente foi bloqueada por política
administrativa; precisa ser validada no Chrome da equipe e no AssystNet real.
O pacote Firefox foi validado por web-ext 10.8.0 sem erros, avisos ou notificações.

## Teste opcional da interface

Instale Playwright 1.64.1 em uma pasta de ferramentas fora do projeto e execute
`tests/chrome-browser.cjs`, apontando `ASSYST_PLAYWRIGHT_MODULE` para esse módulo e
`ASSYST_CHROMIUM_PATH` para um Chromium instalado. Exemplo Linux:

```sh
npm install --prefix /tmp/assyst-tools --no-audit --no-fund playwright@1.64.1
ASSYST_PLAYWRIGHT_MODULE=/tmp/assyst-tools/node_modules/playwright ASSYST_CHROMIUM_PATH=/usr/bin/chromium node tests/chrome-browser.cjs
```

## Arquivos para o portal

- `AssystNet-3.5.0-chrome.zip`: instalação de teste ou envio à Chrome Web Store; veja CHROME.md.
- `AssystNet-3.5.0-submissao.zip`: pacote exclusivo do Firefox para a Mozilla.
- `AssystNet-3.5.0-fontes.zip`: envie no campo **Enviar código-fonte** dessa mesma versão.

O ZIP de fontes inclui instruções, testes e script. O ZIP Firefox contém nove arquivos na raiz; o Chrome contém
quatorze arquivos, incluindo a subpasta `chrome/`. Não contém backups pessoais, dados de chamados, credenciais,
arquivos do Git, ferramentas de desenvolvimento ou versões anteriores.

Referência oficial: https://extensionworkshop.com/documentation/publish/source-code-submission/
