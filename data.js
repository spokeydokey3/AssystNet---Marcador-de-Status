'use strict';

// Shared by the popup, content script and background. No network or sync storage.
globalThis.AssystData = (() => {
  const DEFAULT_TAGS = [
    { id: 'REDMINE', label: 'Redmine', bg: '#DC2626', color: '#FFFFFF' },
    { id: 'ATENDIMENTO', label: 'Em Atendimento', bg: '#2563EB', color: '#FFFFFF' },
    { id: 'AGUARDANDO', label: 'Aguardando Resposta', bg: '#D97706', color: '#FFFFFF' },
    { id: 'ERRO_GERAL', label: 'Erro Geral', bg: '#7C3AED', color: '#FFFFFF' }
  ];
  const KEYS = ['assyst_tags', 'assyst_custom_tags', 'assyst_ticket_tags', 'assyst_contacts', 'assyst_revision',
    'assyst_schema_version', 'assyst_has_upgrade_backup'];
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function hex(value) {
    if (typeof value !== 'string') throw new Error('A cor deve ser um código HEX.');
    let result = value.trim().toUpperCase();
    if (!result.startsWith('#')) result = '#' + result;
    if (/^#[0-9A-F]{3}$/.test(result)) result = '#' + [...result.slice(1)].map(c => c + c).join('');
    if (!/^#[0-9A-F]{6}$/.test(result)) throw new Error('Use uma cor HEX válida, como #2563EB.');
    return result;
  }

  function textColor(value) {
    const rgb = hex(value).slice(1).match(/../g).map(component => parseInt(component, 16) / 255);
    const linear = rgb.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    // Choose the larger WCAG contrast ratio against white or dark text.
    const dark = 0.009189;
    return (luminance + 0.05) / (dark + 0.05) >= 1.05 / (luminance + 0.05) ? '#111827' : '#FFFFFF';
  }

  function identifier(value, description) {
    if (typeof value !== 'string' || !value.trim() || value.length > 200 || /[\u0000-\u001F\u007F]/.test(value)) {
      throw new Error(`${description} inválido.`);
    }
    return value.trim();
  }

  function tag(value, legacy = false, preserveExisting = false) {
    if (!record(value)) throw new Error('Uma das tags do backup é inválida.');
    const id = identifier(legacy ? value.key : value.id, 'Identificador da tag');
    if (['NONE', 'CREATE_NEW', '__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Identificador de tag reservado.');
    if (typeof value.label !== 'string' || !value.label.trim() || (!preserveExisting && value.label.trim().length > 80)) {
      throw new Error('O nome de cada tag deve conter de 1 a 80 caracteres.');
    }
    const bg = hex(value.bg);
    return { id, label: value.label.trim(), bg, color: textColor(bg) };
  }

  function normalize(data) {
    if (!record(data)) throw new Error('O backup deve conter um objeto JSON.');
    let tags;
    if (own(data, 'assyst_tags')) {
      if (!Array.isArray(data.assyst_tags)) throw new Error('A lista de tags é inválida.');
      // The old inline modal had no length limit. Keep those existing names intact.
      tags = data.assyst_tags.map(value => tag(value, false, true));
    } else {
      tags = DEFAULT_TAGS.map(value => tag(value));
      if (own(data, 'assyst_custom_tags')) {
        if (!Array.isArray(data.assyst_custom_tags)) throw new Error('A lista de tags antigas é inválida.');
        for (const old of data.assyst_custom_tags) {
          const migrated = tag(old, true, true);
          const index = tags.findIndex(item => item.id === migrated.id);
          if (index < 0) tags.push(migrated);
          else tags[index] = migrated;
        }
      }
    }
    if (new Set(tags.map(item => item.id)).size !== tags.length) throw new Error('O backup contém identificadores de tags duplicados.');
    const source = own(data, 'assyst_ticket_tags') ? data.assyst_ticket_tags : {};
    if (!record(source)) throw new Error('A lista de chamados é inválida.');
    const tickets = Object.create(null);
    const ids = new Set(tags.map(item => item.id));
    for (const [ticket, status] of Object.entries(source)) {
      const key = identifier(ticket, 'Número do chamado');
      if (key !== ticket) throw new Error('Número de chamado com espaços nas extremidades.');
      if (status === 'NONE' || status === null || status === '') continue;
      const id = identifier(status, 'Status do chamado');
      // Preserve assignments from older backups, including tags whose definition was lost.
      if (!ids.has(id)) {
        const recovered = tag({ id, label: id.slice(0, 80), bg: '#64748B' });
        tags.push(recovered);
        ids.add(id);
      }
      tickets[key] = id;
    }
    const contacts = Object.create(null);
    const contactSource = own(data, 'assyst_contacts') ? data.assyst_contacts : {};
    if (!record(contactSource)) throw new Error('A lista de contatos é inválida.');
    for (const [ticket, value] of Object.entries(contactSource)) {
      if (identifier(ticket, 'Número do chamado') !== ticket) throw new Error('Número de chamado com espaços nas extremidades.');
      contacts[ticket] = contact(value);
    }
    return { assyst_tags: tags, assyst_ticket_tags: tickets, assyst_contacts: contacts,
      assyst_revision: Number.isSafeInteger(data.assyst_revision) && data.assyst_revision >= 0 ? data.assyst_revision : 0 };
  }

  function parseBackup(value) {
    const data = typeof value === 'string' ? JSON.parse(value.replace(/^\uFEFF/, '')) : value;
    if (!record(data) || !['assyst_tags', 'assyst_custom_tags', 'assyst_ticket_tags', 'assyst_contacts'].some(key => own(data, key))) {
      throw new Error('Este arquivo não é um backup de tags do AssystNet.');
    }
    if (own(data, 'formatVersion') && ![1, 2].includes(data.formatVersion)) throw new Error('Versão de backup não suportada.');
    return normalize(data);
  }

  function merge(current, imported) {
    const tags = new Map(current.assyst_tags.map(item => [item.id, item]));
    for (const item of imported.assyst_tags) tags.set(item.id, item);
    return normalize({ assyst_tags: [...tags.values()],
      assyst_ticket_tags: { ...current.assyst_ticket_tags, ...imported.assyst_ticket_tags },
      assyst_contacts: { ...current.assyst_contacts, ...imported.assyst_contacts } });
  }

  function backup(state) {
    return JSON.stringify({ formatVersion: 2, exportedAt: new Date().toISOString(),
      assyst_tags: state.assyst_tags, assyst_ticket_tags: state.assyst_ticket_tags,
      assyst_contacts: state.assyst_contacts }, null, 2);
  }

  // Calendar dates in the computer's local timezone. UTC is only used for date arithmetic,
  // so daylight-saving changes never shorten or lengthen the required calendar interval.
  function today(now = new Date()) {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function day(value) {
    if (typeof value !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) throw new Error('Data de contato inválida.');
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Data de contato inválida.');
    return date.getTime() / 86400000;
  }

  function addDays(value, count) { return new Date((day(value) + count) * 86400000).toISOString().slice(0, 10); }
  function displayDate(value) { day(value); return value.split('-').reverse().join('/'); }

  function contact(value = { attempts: [], respondedOn: null }) {
    if (!record(value) || !Array.isArray(value.attempts) || value.attempts.length > 4) throw new Error('Histórico de contato inválido.');
    const attempts = value.attempts.map((value, index, source) => {
      day(value);
      if (index && value < source[index - 1]) throw new Error('As datas das tentativas devem estar em ordem cronológica.');
      return value;
    });
    const respondedOn = value.respondedOn ?? null;
    if (respondedOn !== null) {
      day(respondedOn);
      if (!attempts.length || respondedOn < attempts.at(-1)) throw new Error('A resposta deve ocorrer após as tentativas registradas.');
    }
    return { attempts, respondedOn };
  }

  function contactInfo(value, date = today()) {
    const result = contact(value); day(date);
    const count = result.attempts.length;
    // Each checkbox records an attempt, even when several were made on the same day.
    // Keep chronological order if the computer clock is behind an existing record.
    const next = count && count < 4 ? result.attempts.at(-1) : null;
    const readyOn = count === 4 ? [addDays(result.attempts[0], 7), addDays(result.attempts[3], 1)].sort().at(-1) : null;
    const canAdd = !result.respondedOn && count < 4 && (!next || date >= next);
    const ready = !result.respondedOn && !!readyOn && date >= readyOn;
    const status = result.respondedOn ? 'Usuário respondeu' : ready ? 'Revisar encerramento por falta de comunicação' : readyOn
      ? `Aguardar até ${displayDate(readyOn)} para revisar encerramento` : count
        ? canAdd ? 'Próxima tentativa disponível' : `Confira a data do computador: último contato em ${displayDate(next)}` : 'Nenhuma tentativa registrada';
    return { ...result, count, next, readyOn, canAdd, ready, status };
  }

  function changeContact(value, operation, date = today()) {
    const result = contact(value); day(date);
    if (operation === 'add') {
      if (!contactInfo(result, date).canAdd) throw new Error(contactInfo(result, date).status);
      result.attempts.push(date);
    } else if (operation === 'undo') {
      if (!result.attempts.length || result.respondedOn) throw new Error('Desmarque a resposta antes de desfazer uma tentativa.');
      result.attempts.pop();
    } else if (operation === 'respond') {
      if (!result.attempts.length || result.respondedOn) throw new Error('Não há acompanhamento pendente para registrar uma resposta.');
      result.respondedOn = date;
    } else if (operation === 'resume') result.respondedOn = null;
    else if (operation === 'clear') return { attempts: [], respondedOn: null };
    else throw new Error('Ação de contato inválida.');
    return contact(result);
  }

  function csv(state, tickets = Object.keys(state.assyst_ticket_tags)) {
    if (!Array.isArray(tickets)) throw new Error('A lista da fila é inválida.');
    const labels = new Map(state.assyst_tags.map(item => [item.id, item.label]));
    const quote = value => {
      let text = String(value);
      // Prevent formula execution when opening user-controlled labels in spreadsheets.
      if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const entries = [...new Set(tickets.map(ticket => identifier(ticket, 'Número do chamado')))]
      .map(ticket => {
        const info = contactInfo(state.assyst_contacts?.[ticket]);
        return [ticket, labels.get(state.assyst_ticket_tags[ticket]) || 'Sem tag', `${info.count}/4`,
          ...Array.from({ length: 4 }, (_, index) => info.attempts[index] ? displayDate(info.attempts[index]) : ''),
          info.respondedOn ? displayDate(info.respondedOn) : '', info.status];
      });
    entries.sort(([a, tagA], [b, tagB]) => tagA.localeCompare(tagB, 'pt-BR', { numeric: true }) ||
      a.localeCompare(b, 'pt-BR', { numeric: true }));
    const rows = [['Chamado', 'Tag', 'Tentativas', 'Contato 1', 'Contato 2', 'Contato 3', 'Contato 4', 'Resposta informada em', 'Acompanhamento'], ...entries];
    return '\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n') + '\r\n';
  }

  return { KEYS, normalize, parseBackup, merge, backup, csv, tag, hex, textColor, identifier,
    today, day, addDays, displayDate, contact, contactInfo, changeContact };
})();
