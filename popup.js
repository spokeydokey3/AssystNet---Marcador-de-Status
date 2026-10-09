document.addEventListener('DOMContentLoaded', async () => {
  const tagListContainer = document.getElementById('tagList');
  const formTitle = document.getElementById('formTitle');
  const tagIdInput = document.getElementById('tagId');
  const tagNameInput = document.getElementById('tagName');
  const colorSwatchesContainer = document.getElementById('colorSwatches');
  const hexInput = document.getElementById('hexInput');
  const btnSaveTag = document.getElementById('btnSaveTag');
  const btnCancelEdit = document.getElementById('btnCancelEdit');

  const PRESET_COLORS = ['#DC2626', '#2563EB', '#D97706', '#7C3AED', '#F43F5E', '#EC4899', '#D946EF', '#06B6D4', '#0EA5E9', '#10B981', '#84CC16', '#14B8A6', '#F97316', '#A855F7', '#64748B', '#0284C7', '#059669', '#000000'];
  let selectedColor = PRESET_COLORS[0];

  function getTextColor(hexColor) {
    let cleanHex = hexColor.replace('#', '');
    if (cleanHex.length === 3) cleanHex = cleanHex.split('').map(c => c + c).join('');
    if (cleanHex.length !== 6) return '#FFFFFF';
    const r = parseInt(cleanHex.substr(0, 2), 16), g = parseInt(cleanHex.substr(2, 2), 16), b = parseInt(cleanHex.substr(4, 2), 16);
    return ((r * 299 + g * 587 + b * 114) / 1000) > 140 ? '#111827' : '#FFFFFF';
  }

  function renderSwatches() {
    colorSwatchesContainer.innerHTML = '';
    PRESET_COLORS.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'swatch' + (color.toUpperCase() === selectedColor.toUpperCase() ? ' selected' : '');
      swatch.style.backgroundColor = color;
      swatch.addEventListener('click', () => { selectedColor = color.toUpperCase(); renderSwatches(); hexInput.value = selectedColor; });
      colorSwatchesContainer.appendChild(swatch);
    });
  }

  hexInput.addEventListener('input', () => {
    let val = hexInput.value.trim();
    if (!val.startsWith('#')) val = '#' + val;
    if (/^#([0-9A-F]{3}){1,2}$/i.test(val)) { selectedColor = val.toUpperCase(); renderSwatches(); }
  });

  async function getTags() {
    const data = await browser.storage.local.get('assyst_tags');
    return data.assyst_tags || [];
  }

  async function saveTags(tags) {
    await browser.storage.local.set({ assyst_tags: tags });
  }

  async function loadAndRenderTags() {
    const tags = await getTags();
    tagListContainer.innerHTML = '';

    tags.forEach(tag => {
      const item = document.createElement('div'); item.className = 'tag-item';
      
      const badge = document.createElement('span'); 
      badge.className = 'tag-badge'; 
      badge.innerText = tag.label; 
      badge.style.backgroundColor = tag.bg; 
      badge.style.color = tag.color;

      const actions = document.createElement('div'); actions.className = 'tag-actions';
      
      const btnEdit = document.createElement('button'); btnEdit.className = 'btn-icon'; btnEdit.innerText = '✏️'; btnEdit.title = "Editar";
      btnEdit.addEventListener('click', () => {
        formTitle.innerText = '✏️ Editar Tag';
        tagIdInput.value = tag.id;
        tagNameInput.value = tag.label;
        selectedColor = tag.bg;
        hexInput.value = tag.bg;
        btnSaveTag.innerText = 'Salvar Alterações';
        btnCancelEdit.style.display = 'block';
        renderSwatches();
      });

      const btnDelete = document.createElement('button'); btnDelete.className = 'btn-icon'; btnDelete.innerText = '🗑️'; btnDelete.title = "Excluir";
      btnDelete.addEventListener('click', async () => {
        if(confirm(`Excluir a tag "${tag.label}"? Ela será removida de todos os chamados.`)) {
          const updated = tags.filter(t => t.id !== tag.id);
          await saveTags(updated);
          loadAndRenderTags();
        }
      });

      actions.appendChild(btnEdit); actions.appendChild(btnDelete);
      item.appendChild(badge); item.appendChild(actions);
      tagListContainer.appendChild(item);
    });
  }

  function resetForm() {
    formTitle.innerText = '➕ Criar Nova Tag';
    tagIdInput.value = '';
    tagNameInput.value = '';
    selectedColor = PRESET_COLORS[0];
    hexInput.value = '';
    btnSaveTag.innerText = 'Adicionar';
    btnCancelEdit.style.display = 'none';
    renderSwatches();
  }

  btnCancelEdit.addEventListener('click', resetForm);

  btnSaveTag.addEventListener('click', async () => {
    const label = tagNameInput.value.trim();
    if (!label) return;
    const bg = selectedColor;
    const color = getTextColor(bg);
    const tags = await getTags();
    const editingId = tagIdInput.value;

    if (editingId) {
      const idx = tags.findIndex(t => t.id === editingId);
      if (idx > -1) { tags[idx].label = label; tags[idx].bg = bg; tags[idx].color = color; }
    } else {
      tags.push({ id: 'TAG_' + Date.now(), label, bg, color });
    }

    await saveTags(tags);
    resetForm();
    loadAndRenderTags();
  });

  // Backup e Restauração
  document.getElementById('btnExport').addEventListener('click', async () => {
    const data = await browser.storage.local.get(['assyst_ticket_tags', 'assyst_tags']);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `assyst_tags_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  });

  const fileInput = document.getElementById('fileInput');
  document.getElementById('btnImport').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (!e.target.files.length) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        const current = await browser.storage.local.get(['assyst_ticket_tags', 'assyst_tags']);
        await browser.storage.local.set({
          assyst_ticket_tags: { ...(current.assyst_ticket_tags || {}), ...(imported.assyst_ticket_tags || {}) },
          assyst_tags: imported.assyst_tags || current.assyst_tags || []
        });
        alert('Backup restaurado com sucesso! Recarregue o AssystNet.');
        loadAndRenderTags();
      } catch (err) { alert('Erro ao importar. Arquivo inválido.'); }
    };
    reader.readAsText(e.target.files[0]);
  });

  renderSwatches(); loadAndRenderTags();
});