# Validação — 3.5.0

- `node --test tests/*.test.cjs`: 46 testes passaram, sem falhas ou testes ignorados.
- `tests/chrome-browser.cjs`: quatro verificações passaram no Chromium 151.0.7922.173,
  usando Playwright 1.64.1, telas sintéticas e APIs de extensão simuladas.
- O pacote Firefox passou no `web-ext` 10.8.0: zero erros, avisos e notificações.
- Os pacotes Chrome/Firefox foram reconstruídos a partir do ZIP de fontes e comparados byte a byte.

Cobertura: tags e contatos compartilhados entre fila e detalhes; quatro contatos no mesmo dia;
mudanças de chamado e controles antigos; referências com prefixos; captura somente dos abertos
na fila conferida; importação/exportação e dados anteriores; falhas de armazenamento; reinício
simulado; downloads concorrentes, cancelados ou concluídos rapidamente; recuperação do
gerenciador de downloads após reinício simulado do worker; URLs Blob com caracteres Unicode.

## Limite da validação

A tentativa de instalar a extensão no navegador gerenciado deste ambiente foi bloqueada:
`Loading of unpacked extensions is disabled by the administrator.`
Isso impediu verificar as APIs nativas de extensão e a instalação persistente nesse navegador.
As verificações Chromium da interface e de Blob não equivalem a esse teste nativo.

Antes de distribuir à equipe, valide a instalação real no Chrome, a persistência após fechar
e reabrir o mesmo perfil, os downloads JSON/CSV e a interface institucional do AssystNet.
Siga CHROME.md. Não foi feita publicação na Chrome Web Store nem instalação em computadores
da equipe. Nenhuma política administrativa do navegador foi alterada durante os testes.
