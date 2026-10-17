'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const transferPage = new URLSearchParams(location.search).has('transfer');
  const source = new URLSearchParams(location.search).get('source');
  const sourceTabId = source !== null && /^\d+$/.test(source) ? Number(source) : undefined;
  const COLORS = ['#DC2626', '#2563EB', '#D97706', '#7C3AED', '#F43F5E', '#EC4899', '#D946EF', '#06B6D4', '#0EA5E9', '#10B981', '#84CC16', '#14B8A6', '#F97316', '#A855F7', '#64748B', '#0284C7', '#059669', '#111827'];
  let state = null;
  let selectedColor = '#2563EB';
  let pendingImport = null;
  let busy = false;
  let ticketLimit = 80;

  function feedback(text, error = false) {
    $('feedback').textContent = text;
    $('feedback').classList.toggle('error', error);
  }

  async function request(action, payload = {}) {
    const result = await browser.runtime.sendMessage({ type: 'assyst-tagger', action, ...payload });
    if (!result || !result.ok) throw new Error(result?.error || 'Não foi possível acessar a extensão.');
    if (result.state && (!state || result.state.assyst_revision >= state.assyst_revision)) {
      state = result.state;
      renderTags();
    }
    return result;
  }

  async function run(operation) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try { await operation(); }
    catch (error) { feedback(error.message, true); }
    finally {
      busy = false;
      document.querySelectorAll('button').forEach(button => { button.disabled = false; });
    }
  }

  function renderTags() {
    if (!state) return;
    $('tagCount').textContent = `${state.assyst_tags.length} tags`;
    $('ticketCount').textContent = `${Object.keys(state.assyst_ticket_tags).length} chamados marcados`;
    $('btnUpgradeBackup').hidden = !state.assyst_has_upgrade_backup;
    renderTickets();
    const usage = new Map();
    for (const id of Object.values(state.assyst_ticket_tags)) usage.set(id, (usage.get(id) || 0) + 1);
    const search = $('tagSearch').value.toLocaleLowerCase('pt-BR').trim();
    const tags = state.assyst_tags.filter(tag => tag.label.toLocaleLowerCase('pt-BR').includes(search));
    $('tagList').replaceChildren();
    for (const tag of tags) {
      const item = document.createElement('div'); item.className = 'tag-item';
      const badge = document.createElement('span'); badge.className = 'tag-badge';
      badge.textContent = tag.label; badge.style.backgroundColor = tag.bg; badge.style.color = tag.color;
      const count = document.createElement('span'); count.className = 'tag-usage';
      count.textContent = String(usage.get(tag.id) || 0); count.title = 'Chamados marcados';
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'btn-icon'; edit.textContent = 'Editar';
      edit.setAttribute('aria-label', `Editar ${tag.label}`);
      edit.addEventListener('click', () => {
        $('tagId').value = tag.id; $('tagName').value = tag.label;
        $('formTitle').textContent = 'Editar tag'; $('btnSaveTag').textContent = 'Salvar alterações';
        $('tagEditor').open = true;
        $('btnCancelEdit').hidden = false; setColor(tag.bg); $('tagName').focus();
      });
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-icon danger'; remove.textContent = 'Excluir';
      remove.setAttribute('aria-label', `Excluir ${tag.label}`);
      remove.addEventListener('click', () => run(async () => {
        if (!confirm(`Excluir “${tag.label}” e remover a marcação de ${usage.get(tag.id) || 0} chamado(s)? Salve um backup se quiser recuperar depois.`)) return;
        await request('deleteTag', { id: tag.id });
        if ($('tagId').value === tag.id) resetForm();
        feedback('Tag excluída e marcações removidas.');
      }));
      edit.disabled = busy; remove.disabled = busy;
      item.append(badge, count, edit, remove); $('tagList').append(item);
    }
    if (!tags.length) {
      const empty = document.createElement('p'); empty.className = 'empty';
      empty.textContent = search ? 'Nenhuma tag encontrada.' : 'Crie sua primeira tag abaixo.';
      $('tagList').append(empty);
    }
  }

  function renderTickets() {
    if (!state || !$('ticketManager').open) return;
    const labels = new Map(state.assyst_tags.map(tag => [tag.id, tag.label]));
    const search = $('ticketSearch').value.trim().toLocaleLowerCase('pt-BR');
    const entries = [...new Set([...Object.keys(state.assyst_ticket_tags),
      ...Object.keys(state.assyst_contacts).filter(ticket => state.assyst_contacts[ticket].attempts.length)])]
      .map(ticket => [ticket, state.assyst_ticket_tags[ticket]])
      .filter(([ticket, id]) => (ticket + ' ' + (labels.get(id) || id || 'Sem tag')).toLocaleLowerCase('pt-BR').includes(search))
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    $('ticketList').replaceChildren();
    for (const [ticket, id] of entries.slice(0, ticketLimit)) {
      const item = document.createElement('div'); item.className = 'tag-item';
      const label = document.createElement('span'); label.className = 'tag-badge';
      const contact = AssystData.contactInfo(state.assyst_contacts[ticket]);
      label.textContent = `${ticket} · ${labels.get(id) || id || 'Sem tag'}${contact.count ? ` · Contato ${contact.count}/4` : ''}`;
      if (contact.count) label.title = contact.attempts.map((date, index) => `${index + 1}ª: ${AssystData.displayDate(date)}`).join(' · ') + '. ' + contact.status;
      item.append(label);
      if (contact.count) {
        const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'btn-icon danger';
        clear.textContent = 'Limpar contatos'; clear.disabled = busy;
        clear.setAttribute('aria-label', `Limpar contatos do chamado ${ticket}`);
        clear.addEventListener('click', () => run(async () => {
          if (!confirm(`Apagar as datas de contato do chamado ${ticket}? A tag será preservada. Salve um backup para recuperar o histórico.`)) return;
          await request('contact', { ticket, operation: 'clear', expected: state.assyst_contacts[ticket] });
          feedback(`Contatos do chamado ${ticket} removidos.`);
        }));
        item.append(clear);
      }
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'btn-icon danger';
      remove.textContent = 'Remover tag'; remove.disabled = busy; remove.hidden = !id;
      remove.setAttribute('aria-label', `Remover marcação do chamado ${ticket}`);
      remove.addEventListener('click', () => run(async () => {
        if (!confirm(`Remover a marcação do chamado ${ticket}? A tag continuará disponível para os outros chamados.`)) return;
        await request('assign', { ticket, id: 'NONE' });
        feedback(`Marcação do chamado ${ticket} removida.`);
      }));
      item.append(remove); $('ticketList').append(item);
    }
    $('btnMoreTickets').hidden = entries.length <= ticketLimit;
    $('ticketListCount').textContent = entries.length ? `${Math.min(ticketLimit, entries.length)} de ${entries.length} marcações.` : 'Nenhuma marcação encontrada.';
  }
  $('ticketManager').addEventListener('toggle', renderTickets);
  $('ticketSearch').addEventListener('input', () => { ticketLimit = 80; renderTickets(); });
  $('btnMoreTickets').addEventListener('click', () => { ticketLimit += 80; renderTickets(); });

  function preview() {
    $('tagPreview').textContent = $('tagName').value.trim() || 'Prévia';
    $('tagPreview').style.backgroundColor = selectedColor;
    $('tagPreview').style.color = AssystData.textColor(selectedColor);
  }

  function setColor(color) {
    selectedColor = AssystData.hex(color);
    $('hexInput').value = selectedColor; $('colorPicker').value = selectedColor;
    $('hexInput').setCustomValidity(''); $('hexInput').removeAttribute('aria-invalid');
    for (const swatch of $('colorSwatches').children) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === selectedColor));
    preview();
  }

  for (const color of COLORS) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'swatch';
    button.dataset.color = color; button.style.backgroundColor = color; button.title = color;
    button.setAttribute('aria-label', `Usar cor ${color}`);
    button.addEventListener('click', () => setColor(color)); $('colorSwatches').append(button);
  }
  $('colorPicker').addEventListener('input', event => setColor(event.target.value));
  $('hexInput').addEventListener('input', () => {
    try {
      selectedColor = AssystData.hex($('hexInput').value);
      $('colorPicker').value = selectedColor; $('hexInput').setCustomValidity('');
      $('hexInput').removeAttribute('aria-invalid');
      for (const swatch of $('colorSwatches').children) swatch.setAttribute('aria-pressed', String(swatch.dataset.color === selectedColor));
      preview();
    } catch (error) { $('hexInput').setCustomValidity(error.message); $('hexInput').setAttribute('aria-invalid', 'true'); }
  });
  $('hexInput').addEventListener('blur', () => { if ($('hexInput').validity.valid) setColor(selectedColor); });
  $('tagName').addEventListener('input', preview);
  $('tagSearch').addEventListener('input', renderTags);

  function resetForm() {
    $('tagId').value = ''; $('tagName').value = ''; $('formTitle').textContent = 'Criar tag';
    $('btnSaveTag').textContent = 'Adicionar tag'; $('btnCancelEdit').hidden = true; setColor('#2563EB');
    $('tagEditor').open = false;
  }
  $('btnCancelEdit').addEventListener('click', resetForm);
  $('tagForm').addEventListener('submit', event => {
    event.preventDefault();
    run(async () => {
      await request('saveTag', { tag: { id: $('tagId').value || undefined,
        label: $('tagName').value.trim(), bg: AssystData.hex($('hexInput').value) } });
      resetForm(); feedback('Tag salva. A tabela é atualizada automaticamente.');
    });
  });

  $('btnExport').addEventListener('click', () => run(async () => {
    await request('export', { format: 'json' }); feedback('Backup enviado aos downloads do navegador. Confira se o arquivo foi salvo antes de trocar de computador.');
  }));
  $('btnCSV').addEventListener('click', () => run(async () => {
    feedback('Conferindo a fila atual. Aguarde; a tabela pode rolar automaticamente.');
    const result = await request('export', { format: 'csv', ...(sourceTabId !== undefined ? { sourceTabId } : {}) });
    feedback(`Planilha enviada aos downloads: ${result.count} chamado(s) aberto(s) da fila atual, ordenados por tag e número.`);
  }));
  $('btnUpgradeBackup').addEventListener('click', () => run(async () => {
    await request('exportUpgradeBackup');
    feedback('Cópia dos dados anteriores à primeira migração enviada aos downloads. Para as marcações atuais, use Salvar backup JSON.');
  }));
  async function openTransferWindow() {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    const origin = Number.isInteger(tab?.id) ? `&source=${tab.id}` : '';
    await browser.windows.create({ url: browser.runtime.getURL(`popup.html?transfer=1${origin}#backupSection`),
      type: 'popup', width: 620, height: 720 });
  }
  $('btnTransferTab').addEventListener('click', () => run(openTransferWindow));
  $('btnImport').addEventListener('click', () => {
    // A separate window stays open while the native file picker is in use.
    if (!transferPage) { run(openTransferWindow); return; }
    $('fileInput').click();
  });

  function explainImport() {
    $('importExplanation').textContent = $('importMode').value === 'replace'
      ? 'Todos os dados deste computador serão apagados e substituídos pelo backup. Exporte um backup local antes de continuar.'
      : 'Mantém os dados locais. Para o mesmo chamado ou identificador de tag, prevalece o que está no arquivo importado, incluindo o histórico de contatos. Backups antigos não alteram os contatos locais ao mesclar.';
  }
  $('importMode').addEventListener('change', explainImport);
  $('fileInput').addEventListener('change', () => run(async () => {
    const file = $('fileInput').files[0]; $('fileInput').value = '';
    if (!file) return;
    pendingImport = null; $('importPreview').hidden = true;
    if (file.size > 32 * 1024 * 1024) throw new Error('O arquivo excede 32 MB. Escolha um backup JSON menor.');
    pendingImport = AssystData.parseBackup(await file.text());
    const count = Object.keys(pendingImport.assyst_ticket_tags).length;
    const overlap = Object.keys(pendingImport.assyst_ticket_tags).filter(ticket => Object.prototype.hasOwnProperty.call(state.assyst_ticket_tags, ticket)).length;
    const contacts = Object.values(pendingImport.assyst_contacts).filter(value => value.attempts.length).length;
    $('importSummary').textContent = `${file.name}: ${pendingImport.assyst_tags.length} tags, ${count} chamados marcados e ${contacts} histórico(s) de contato. ${overlap} chamado(s) já existem neste computador.`;
    $('importMode').value = 'merge'; explainImport(); $('importPreview').hidden = false;
    $('importPreview').scrollIntoView({ block: 'nearest' });
    feedback('Arquivo validado. Confira os dados antes de confirmar.');
  }));
  $('btnCancelImport').addEventListener('click', () => { pendingImport = null; $('importPreview').hidden = true; feedback('Importação cancelada.'); });
  $('btnConfirmImport').addEventListener('click', () => run(async () => {
    if (!pendingImport) return;
    const mode = $('importMode').value;
    if (mode === 'replace' && !confirm('Substituir todas as tags e marcações deste computador? Esta ação não pode ser desfeita sem um backup.')) return;
    await request('import', { backup: pendingImport, mode });
    pendingImport = null; $('importPreview').hidden = true; resetForm();
    feedback('Backup importado. As abas abertas do AssystNet são atualizadas automaticamente.');
  }));

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ['assyst_tags', 'assyst_ticket_tags', 'assyst_contacts'].some(key => key in changes)) {
      request('get').catch(error => feedback(error.message, true));
    }
  });
  if (transferPage) {
    document.body.classList.add('transfer-page'); $('btnTransferTab').hidden = true;
    document.querySelector('h1').textContent = 'Transferir minhas marcações';
  }
  setColor(selectedColor);
  await run(() => request('get'));
});
