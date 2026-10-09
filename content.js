(function () {
  'use strict';

  // Tags Iniciais (Criadas na primeira vez que a extensão rodar)
  const DEFAULT_INITIAL_TAGS = [
    { id: 'REDMINE', label: 'Redmine', bg: '#DC2626', color: '#FFFFFF' },
    { id: 'ATENDIMENTO', label: 'Em Atendimento', bg: '#2563EB', color: '#FFFFFF' },
    { id: 'AGUARDANDO', label: 'Aguardando Resposta', bg: '#D97706', color: '#FFFFFF' },
    { id: 'ERRO_GERAL', label: 'Erro Geral', bg: '#7C3AED', color: '#FFFFFF' }
  ];

  // Verifica contraste de cor para a criação inline
  function getTextColor(hexColor) {
    let cleanHex = hexColor.replace('#', '');
    if (cleanHex.length === 3) cleanHex = cleanHex.split('').map(c => c + c).join('');
    if (cleanHex.length !== 6) return '#FFFFFF';
    const r = parseInt(cleanHex.substr(0, 2), 16), g = parseInt(cleanHex.substr(2, 2), 16), b = parseInt(cleanHex.substr(4, 2), 16);
    return ((r * 299 + g * 587 + b * 114) / 1000) > 140 ? '#111827' : '#FFFFFF';
  }

  // Puxa e unifica todas as tags. Migra versões antigas automaticamente.
  async function getTags() {
    const data = await browser.storage.local.get(['assyst_tags', 'assyst_custom_tags']);
    let tags = data.assyst_tags;
    
    // Inicia pela primeira vez ou migra da v2.0
    if (!tags || tags.length === 0) {
      tags = [...DEFAULT_INITIAL_TAGS];
      if (data.assyst_custom_tags && data.assyst_custom_tags.length > 0) {
        data.assyst_custom_tags.forEach(old => {
          if (!tags.find(t => t.id === old.key)) tags.push({ id: old.key, label: old.label, bg: old.bg, color: old.color });
        });
      }
      await browser.storage.local.set({ assyst_tags: tags });
    }
    
    // Converte Array para Dicionário/Objeto para facilitar a busca
    const options = { NONE: { id: 'NONE', label: '+ Tag', bg: '#E5E7EB', color: '#374151' } };
    tags.forEach(t => options[t.id] = t);
    return { optionsHash: JSON.stringify(tags), optionsDict: options, rawArray: tags };
  }

  async function getTicketData() {
    const data = await browser.storage.local.get('assyst_ticket_tags');
    return data.assyst_ticket_tags || {};
  }

  function applyStyleToSelect(select, statusId, optionsDict) {
    const config = optionsDict[statusId] || optionsDict.NONE;
    select.style.backgroundColor = config.bg;
    select.style.color = config.color;
    select.value = statusId;
    select.dataset.statusId = statusId;
  }

  // --- MODAL DE CRIAÇÃO NA TELA ---
  function showCreateTagModal(ticketId, selectElement) {
    // Reverte o visual do select enquanto o modal está aberto
    selectElement.value = selectElement.dataset.statusId || 'NONE';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.5); z-index: 9999999; display: flex; align-items: center; justify-content: center; font-family: sans-serif;';
    
    const box = document.createElement('div');
    box.style.cssText = 'background: white; padding: 20px; border-radius: 8px; width: 280px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);';
    
    box.innerHTML = `
      <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #111827;">Criar Tag e Atribuir</h3>
      <label style="font-size: 12px; font-weight: bold; color: #374151;">Nome da Tag:</label>
      <input type="text" id="inlineTagName" placeholder="Ex: Analisando..." style="width: 100%; padding: 8px; margin: 5px 0 15px 0; border: 1px solid #D1D5DB; border-radius: 6px; box-sizing: border-box; outline: none;">
      <label style="font-size: 12px; font-weight: bold; color: #374151;">Cor da Tag:</label>
      <input type="color" id="inlineTagColor" value="#0EA5E9" style="width: 100%; height: 35px; padding: 0; border: 1px solid #D1D5DB; border-radius: 6px; margin: 5px 0 20px 0; cursor: pointer;">
      <div style="display: flex; gap: 10px;">
        <button id="inlineBtnSave" style="flex: 1; background: #2563EB; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer;">Salvar</button>
        <button id="inlineBtnCancel" style="flex: 1; background: #E5E7EB; color: #374151; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer;">Cancelar</button>
      </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const nameInput = box.querySelector('#inlineTagName');
    nameInput.focus();

    box.querySelector('#inlineBtnCancel').onclick = () => overlay.remove();

    box.querySelector('#inlineBtnSave').onclick = async () => {
      const name = nameInput.value.trim();
      if (!name) return alert("Digite o nome da tag.");
      
      const bg = box.querySelector('#inlineTagColor').value;
      const color = getTextColor(bg);
      const newId = 'TAG_' + Date.now();

      // Salva a nova tag globalmente
      const tagData = await getTags();
      const newTagsArray = tagData.rawArray;
      newTagsArray.push({ id: newId, label: name, bg, color });
      await browser.storage.local.set({ assyst_tags: newTagsArray });

      // Atribui ao chamado atual
      const ticketData = await getTicketData();
      ticketData[ticketId] = newId;
      await browser.storage.local.set({ assyst_ticket_tags: ticketData });

      overlay.remove();
    };
  }

  // Cria e Injeta o Dropdown
  function createSelectElement(ticketId, currentStatusId, tagsData) {
    const select = document.createElement('select');
    select.className = 'assyst-tag-select';
    select.dataset.ticketId = ticketId;
    select.dataset.optionsHash = tagsData.optionsHash; 
    
    select.style.cssText = 'border: 1px solid rgba(0,0,0,0.15); border-radius: 10px; padding: 1px 4px; font-size: 10px; font-weight: bold; cursor: pointer; margin-left: 6px; outline: none; max-width: 130px;';

    Object.keys(tagsData.optionsDict).forEach(key => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.innerText = tagsData.optionsDict[key].label;
      opt.style.backgroundColor = '#FFFFFF';
      opt.style.color = '#111827';
      select.appendChild(opt);
    });

    const createOpt = document.createElement('option');
    createOpt.value = 'CREATE_NEW';
    createOpt.innerText = '➕ Criar e Escolher Cor...';
    createOpt.style.backgroundColor = '#F3F4F6';
    createOpt.style.color = '#111827';
    createOpt.style.fontStyle = 'italic';
    select.appendChild(createOpt);

    applyStyleToSelect(select, currentStatusId, tagsData.optionsDict);

    const stopProp = (e) => e.stopPropagation();
    select.addEventListener('mousedown', stopProp);
    select.addEventListener('click', stopProp);

    select.addEventListener('change', async (e) => {
      e.stopPropagation();
      const selectedId = e.target.value;

      if (selectedId === 'CREATE_NEW') {
        showCreateTagModal(ticketId, select);
        return;
      }

      applyStyleToSelect(select, selectedId, tagsData.optionsDict);
      const currentData = await getTicketData();
      if (selectedId === 'NONE') delete currentData[ticketId];
      else currentData[ticketId] = selectedId;
      await browser.storage.local.set({ assyst_ticket_tags: currentData });
    });

    return select;
  }

  // Renderiza Tags na Tabela
  async function refreshTags() {
    const savedData = await getTicketData();
    const tagsData = await getTags();
    const cells = document.querySelectorAll('td.field-eventRef');

    cells.forEach(cell => {
      const clone = cell.cloneNode(true);
      clone.querySelectorAll('.axios-offscreen-content, .assyst-tag-select').forEach(el => el.remove());
      const ticketId = clone.textContent.trim();
      if (!ticketId) return;

      let select = cell.querySelector('.assyst-tag-select');
      const currentStatusId = savedData[ticketId] || 'NONE';

      if (select) {
        if (select.dataset.optionsHash !== tagsData.optionsHash) {
          select.remove();
          select = null;
        } else {
          if (select.dataset.statusId !== currentStatusId) {
            applyStyleToSelect(select, currentStatusId, tagsData.optionsDict);
          }
          return;
        }
      }

      if (!select) {
        const newSelect = createSelectElement(ticketId, currentStatusId, tagsData);
        cell.appendChild(newSelect);
      }
    });
  }

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') refreshTags();
  });

  refreshTags();
  const observer = new MutationObserver(() => refreshTags());
  observer.observe(document.body, { childList: true, subtree: true });
})();