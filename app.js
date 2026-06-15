const STORAGE_KEY = 'crescer_juntos_v2';
const state = loadState();
let currentEditingId = state.activeChildId || null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const childSelect = $('#childSelect');
const childForm = $('#childForm');
const medForm = $('#medForm');
const examForm = $('#examForm');
const memoryForm = $('#memoryForm');
const eventForm = $('#eventForm');
const toastEl = $('#toast');

init();

function init() {
  registerServiceWorker();
  bindTabs();
  bindForms();
  bindShareActions();
  if (!state.children.length) {
    const first = createEmptyChild();
    state.children.push(first);
    state.activeChildId = first.id;
    currentEditingId = first.id;
    saveState(false);
  }
  renderAll();
  scheduleNotifications();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
  }
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || { children: [], activeChildId: null };
  } catch {
    return { children: [], activeChildId: null };
  }
}

function saveState(show = true) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (show) toast('Dados salvos.');
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function createEmptyChild() {
  return {
    id: uid(), nome: '', sobrenome: '', nascimento: '', sexo: '', tipoSanguineo: '',
    problemas: '', alergias: '', mae: '', telefoneMae: '', pai: '', telefonePai: '',
    emergenciaNome: '', emergenciaTelefone: '', pediatraNome: '', pediatraTelefone: '',
    pediatraEmail: '', clinicaPediatra: '', observacoes: '',
    medications: [], exams: [], memories: [], events: []
  };
}

function getActiveChild() {
  return state.children.find(c => c.id === state.activeChildId) || state.children[0];
}

function bindTabs() {
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b => b.classList.remove('active'));
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`#${btn.dataset.tab}`).classList.add('active');
    });
  });
}

function bindForms() {
  $('#newChildBtn').addEventListener('click', () => {
    const child = createEmptyChild();
    state.children.push(child);
    state.activeChildId = child.id;
    currentEditingId = child.id;
    saveState(false);
    renderAll();
    toast('Nova criança criada. Preencha o cadastro e clique em Salvar criança cadastrada.');
  });

  childSelect.addEventListener('change', () => {
    state.activeChildId = childSelect.value;
    currentEditingId = state.activeChildId;
    saveState(false);
    renderAll();
  });

  childForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const child = getActiveChild();
    const data = Object.fromEntries(new FormData(childForm).entries());
    Object.assign(child, data);
    state.activeChildId = child.id;
    currentEditingId = child.id;
    saveState();
    renderChildSelect();
    toast('Criança cadastrada salva com sucesso.');
  });

  $('#deleteChildBtn').addEventListener('click', () => {
    const child = getActiveChild();
    if (!child) return;
    const name = fullName(child) || 'esta criança';
    if (!confirm(`Excluir ${name} e todos os dados vinculados?`)) return;
    state.children = state.children.filter(c => c.id !== child.id);
    if (!state.children.length) state.children.push(createEmptyChild());
    state.activeChildId = state.children[0].id;
    saveState();
    renderAll();
  });

  medForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const child = requireChild();
    if (!child) return;
    child.medications.push({ id: uid(), ...Object.fromEntries(new FormData(medForm).entries()) });
    medForm.reset();
    saveState();
    renderMedications();
  });

  examForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const child = requireChild();
    if (!child) return;
    const fd = new FormData(examForm);
    const file = fd.get('arquivo');
    child.exams.push({
      id: uid(), data: fd.get('data') || '', nome: fd.get('nome') || '', descricao: fd.get('descricao') || '',
      arquivo: file && file.name ? fileInfo(file) : null
    });
    examForm.reset();
    saveState();
    renderExams();
  });

  memoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const child = requireChild();
    if (!child) return;
    const fd = new FormData(memoryForm);
    const file = fd.get('arquivo');
    const fileData = file && file.name ? await fileInfoWithPreview(file) : null;
    child.memories.push({ id: uid(), data: fd.get('data') || '', titulo: fd.get('titulo') || '', descricao: fd.get('descricao') || '', arquivo: fileData });
    memoryForm.reset();
    saveState();
    renderMemories();
  });

  eventForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const child = requireChild();
    if (!child) return;
    const ev = { id: uid(), ...Object.fromEntries(new FormData(eventForm).entries()) };
    child.events.push(ev);
    child.events.sort((a, b) => `${a.data || ''} ${a.hora || ''}`.localeCompare(`${b.data || ''} ${b.hora || ''}`));
    eventForm.reset();
    saveState();
    renderEvents();
    scheduleNotifications();
  });

  $('#notifyBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) return toast('Este navegador não oferece notificações.');
    const permission = await Notification.requestPermission();
    toast(permission === 'granted' ? 'Notificações ativadas.' : 'Permissão de notificação não ativada.');
  });
}

function bindShareActions() {
  $('#pdfBtn').addEventListener('click', () => {
    const child = requireChild();
    if (!child) return;
    createChildPdf(child);
  });

  $('#qrBtn').addEventListener('click', () => {
    const child = requireChild();
    if (!child) return;
    const payload = createSharePayload(child, true);
    const encoded = base64EncodeUnicode(JSON.stringify(payload));
    const url = `${new URL('report.html', window.location.href).href}#d=${encodeURIComponent(encoded)}`;
    const qrApi = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
    $('#qrImage').src = qrApi;
    $('#qrLink').value = url;
    $('#qrResult').hidden = false;
    toast('QR Code criado.');
  });

  $('#copyLinkBtn').addEventListener('click', async () => {
    const link = $('#qrLink').value;
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado.');
    } catch {
      $('#qrLink').select();
      document.execCommand('copy');
      toast('Link copiado.');
    }
  });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `backup-crescer-juntos-${todayISO()}.json`);
  });

  $('#importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported.children || !Array.isArray(imported.children)) throw new Error('Formato inválido');
      state.children = imported.children;
      state.activeChildId = imported.activeChildId || state.children[0]?.id || null;
      saveState();
      renderAll();
      toast('Backup importado.');
    } catch {
      toast('Não foi possível importar este arquivo.');
    } finally {
      e.target.value = '';
    }
  });
}

function requireChild() {
  const child = getActiveChild();
  if (!child) toast('Cadastre uma criança primeiro.');
  return child;
}

function renderAll() {
  renderChildSelect();
  fillChildForm();
  renderMedications();
  renderExams();
  renderMemories();
  renderEvents();
  $('#qrResult').hidden = true;
}

function renderChildSelect() {
  childSelect.innerHTML = '';
  state.children.forEach((child, index) => {
    const option = document.createElement('option');
    option.value = child.id;
    option.textContent = fullName(child) || `Criança ${index + 1}`;
    childSelect.appendChild(option);
  });
  childSelect.value = state.activeChildId || state.children[0]?.id || '';
}

function fillChildForm() {
  const child = getActiveChild();
  if (!child) return childForm.reset();
  const keys = ['nome','sobrenome','nascimento','sexo','tipoSanguineo','problemas','alergias','mae','telefoneMae','pai','telefonePai','emergenciaNome','emergenciaTelefone','pediatraNome','pediatraTelefone','pediatraEmail','clinicaPediatra','observacoes'];
  keys.forEach(k => { if (childForm.elements[k]) childForm.elements[k].value = child[k] || ''; });
}

function renderMedications() {
  const child = getActiveChild();
  const list = $('#medList');
  list.innerHTML = '';
  if (!child?.medications?.length) return list.innerHTML = '<p class="muted">Nenhuma medicação cadastrada.</p>';
  child.medications.forEach(med => list.appendChild(itemCard({
    title: med.nome,
    subtitle: [med.dose, med.frequencia, med.horario].filter(Boolean).join(' • '),
    body: [periodLine(med.inicio, med.termino), med.observacoes].filter(Boolean).join('\n'),
    onDelete: () => removeItem('medications', med.id)
  })));
}

function renderExams() {
  const child = getActiveChild();
  const list = $('#examList');
  list.innerHTML = '';
  if (!child?.exams?.length) return list.innerHTML = '<p class="muted">Nenhum exame cadastrado.</p>';
  child.exams.forEach(exam => list.appendChild(itemCard({
    title: exam.nome,
    subtitle: formatDate(exam.data),
    body: [exam.descricao, exam.arquivo ? `Arquivo: ${exam.arquivo.name} (${formatBytes(exam.arquivo.size)})` : ''].filter(Boolean).join('\n'),
    onDelete: () => removeItem('exams', exam.id)
  })));
}

function renderMemories() {
  const child = getActiveChild();
  const list = $('#memoryList');
  list.innerHTML = '';
  if (!child?.memories?.length) return list.innerHTML = '<p class="muted">Nenhuma memória cadastrada.</p>';
  child.memories.slice().sort((a,b)=>(b.data||'').localeCompare(a.data||'')).forEach(mem => {
    const card = document.createElement('article');
    card.className = 'memory-card';
    const preview = mem.arquivo?.preview && mem.arquivo?.type?.startsWith('image/')
      ? `<img src="${mem.arquivo.preview}" alt="${escapeHtml(mem.titulo)}" />`
      : `<span>${mem.arquivo?.name ? escapeHtml(mem.arquivo.name) : 'Memória'}</span>`;
    card.innerHTML = `<div class="media">${preview}</div><div class="body"><small>${formatDate(mem.data)}</small><h4>${escapeHtml(mem.titulo)}</h4><p>${escapeHtml(mem.descricao || '')}</p><button class="danger" type="button">Excluir</button></div>`;
    card.querySelector('button').addEventListener('click', () => removeItem('memories', mem.id));
    list.appendChild(card);
  });
}

function renderEvents() {
  const child = getActiveChild();
  const list = $('#eventList');
  list.innerHTML = '';
  if (!child?.events?.length) return list.innerHTML = '<p class="muted">Nenhum evento cadastrado.</p>';
  child.events.forEach(ev => list.appendChild(itemCard({
    title: ev.titulo,
    subtitle: [ev.tipo, formatDate(ev.data), ev.hora].filter(Boolean).join(' • '),
    body: [ev.local ? `Local: ${ev.local}` : '', ev.descricao].filter(Boolean).join('\n'),
    extraButtons: [{ label: 'Baixar .ICS', action: () => downloadICS(ev, child) }],
    onDelete: () => removeItem('events', ev.id)
  })));
}

function itemCard({ title, subtitle, body, extraButtons = [], onDelete }) {
  const el = document.createElement('article');
  el.className = 'item';
  el.innerHTML = `<div class="item-head"><div><h4>${escapeHtml(title || 'Sem título')}</h4>${subtitle ? `<small>${escapeHtml(subtitle)}</small>` : ''}</div></div>${body ? `<p>${escapeHtml(body)}</p>` : ''}<div class="item-actions"></div>`;
  const actions = el.querySelector('.item-actions');
  extraButtons.forEach(btn => {
    const b = document.createElement('button');
    b.className = 'secondary'; b.type = 'button'; b.textContent = btn.label;
    b.addEventListener('click', btn.action);
    actions.appendChild(b);
  });
  const del = document.createElement('button');
  del.className = 'danger'; del.type = 'button'; del.textContent = 'Excluir';
  del.addEventListener('click', onDelete);
  actions.appendChild(del);
  return el;
}

function removeItem(collection, id) {
  const child = getActiveChild();
  if (!child) return;
  child[collection] = child[collection].filter(item => item.id !== id);
  saveState();
  renderAll();
}

function fileInfo(file) {
  return { name: file.name, size: file.size, type: file.type || 'arquivo' };
}

function fileInfoWithPreview(file) {
  return new Promise(resolve => {
    const info = fileInfo(file);
    if (!file.type.startsWith('image/') || file.size > 2_500_000) return resolve(info);
    const reader = new FileReader();
    reader.onload = () => resolve({ ...info, preview: reader.result });
    reader.onerror = () => resolve(info);
    reader.readAsDataURL(file);
  });
}

function fullName(child) {
  return [child?.nome, child?.sobrenome].filter(Boolean).join(' ').trim();
}

function formatDate(value) {
  if (!value) return '';
  const [y,m,d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function periodLine(start, end) {
  if (!start && !end) return '';
  return `Período: ${formatDate(start) || 'não informado'} até ${formatDate(end) || 'não informado'}`;
}

function formatBytes(bytes = 0) {
  if (!bytes) return '0 B';
  const units = ['B','KB','MB','GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

function todayISO() {
  return new Date().toISOString().slice(0,10);
}

function createSharePayload(child, compact = false) {
  const clean = (value, max = 260) => (value || '').toString().trim().slice(0, max);
  const limit = compact ? 8 : 999;
  return {
    app: 'cReScer juntos', generatedAt: new Date().toISOString(),
    cadastro: {
      nome: clean(fullName(child), 120), nascimento: child.nascimento || '', sexo: clean(child.sexo, 40), tipoSanguineo: clean(child.tipoSanguineo, 20),
      problemas: clean(child.problemas, compact ? 360 : 4000), alergias: clean(child.alergias, compact ? 360 : 4000),
      mae: clean(child.mae, 100), telefoneMae: clean(child.telefoneMae, 50), pai: clean(child.pai, 100), telefonePai: clean(child.telefonePai, 50),
      emergenciaNome: clean(child.emergenciaNome, 100), emergenciaTelefone: clean(child.emergenciaTelefone, 50),
      pediatraNome: clean(child.pediatraNome, 100), pediatraTelefone: clean(child.pediatraTelefone, 50), pediatraEmail: clean(child.pediatraEmail, 100), clinicaPediatra: clean(child.clinicaPediatra, 120),
      observacoes: clean(child.observacoes, compact ? 260 : 3000)
    },
    medications: (child.medications || []).slice(0, limit).map(m => ({ nome: clean(m.nome, 90), dose: clean(m.dose, 70), frequencia: clean(m.frequencia, 80), horario: clean(m.horario, 80), inicio: m.inicio || '', termino: m.termino || '', observacoes: clean(m.observacoes, compact ? 140 : 1000) })),
    exams: (child.exams || []).slice(0, limit).map(e => ({ data: e.data || '', nome: clean(e.nome, 100), descricao: clean(e.descricao, compact ? 160 : 1200), arquivo: clean(e.arquivo?.name || '', 100) })),
    events: (child.events || []).slice(0, limit).map(ev => ({ titulo: clean(ev.titulo, 100), tipo: clean(ev.tipo, 50), data: ev.data || '', hora: ev.hora || '', local: clean(ev.local, 120), descricao: clean(ev.descricao, compact ? 160 : 1200) }))
  };
}

function reportLinesFromPayload(payload) {
  const c = payload.cadastro || {};
  const lines = [];
  lines.push('cReScer juntos - Resumo da criança');
  lines.push(`Gerado em: ${new Date(payload.generatedAt || Date.now()).toLocaleString('pt-BR')}`);
  lines.push('');
  lines.push('CADASTRO');
  add(lines, 'Nome', c.nome); add(lines, 'Data de nascimento', formatDate(c.nascimento)); add(lines, 'Sexo', c.sexo); add(lines, 'Tipo sanguíneo', c.tipoSanguineo);
  add(lines, 'Problemas de saúde', c.problemas); add(lines, 'Alergias', c.alergias);
  add(lines, 'Mãe', joinNamePhone(c.mae, c.telefoneMae)); add(lines, 'Pai', joinNamePhone(c.pai, c.telefonePai));
  add(lines, 'Emergência', joinNamePhone(c.emergenciaNome, c.emergenciaTelefone));
  add(lines, 'Pediatra', [c.pediatraNome, c.pediatraTelefone, c.pediatraEmail, c.clinicaPediatra].filter(Boolean).join(' • '));
  add(lines, 'Observações', c.observacoes);
  lines.push(''); lines.push('SAÚDE - MEDICAÇÕES');
  if (!payload.medications?.length) lines.push('Nenhuma medicação cadastrada.');
  payload.medications?.forEach((m, i) => {
    lines.push(`${i + 1}. ${m.nome || 'Medicamento sem nome'}`);
    add(lines, 'Dose', m.dose, '   '); add(lines, 'Frequência', m.frequencia, '   '); add(lines, 'Horário', m.horario, '   '); add(lines, 'Período', `${formatDate(m.inicio) || 'não informado'} até ${formatDate(m.termino) || 'não informado'}`, '   '); add(lines, 'Observações', m.observacoes, '   ');
  });
  lines.push(''); lines.push('SAÚDE - EXAMES');
  if (!payload.exams?.length) lines.push('Nenhum exame cadastrado.');
  payload.exams?.forEach((e, i) => {
    lines.push(`${i + 1}. ${e.nome || 'Exame sem nome'} - ${formatDate(e.data) || 'sem data'}`);
    add(lines, 'Descrição', e.descricao, '   '); add(lines, 'Arquivo', e.arquivo, '   ');
  });
  lines.push(''); lines.push('CALENDÁRIO');
  if (!payload.events?.length) lines.push('Nenhum evento cadastrado.');
  payload.events?.forEach((ev, i) => {
    lines.push(`${i + 1}. ${ev.titulo || 'Evento sem título'} - ${formatDate(ev.data)} ${ev.hora || ''}`.trim());
    add(lines, 'Tipo', ev.tipo, '   '); add(lines, 'Local', ev.local, '   '); add(lines, 'Descrição', ev.descricao, '   ');
  });
  return lines;
}

function add(lines, label, value, prefix = '') {
  if (value) lines.push(`${prefix}${label}: ${value}`);
}

function joinNamePhone(name, phone) {
  return [name, phone].filter(Boolean).join(' • ');
}

function createChildPdf(child) {
  const payload = createSharePayload(child, false);
  const lines = reportLinesFromPayload(payload);
  const filename = safeFileName(`crescer-juntos-${fullName(child) || 'crianca'}.pdf`);
  if (window.jspdf?.jsPDF) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 44;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 48;
    doc.setFont('helvetica', 'normal');
    lines.forEach((line, idx) => {
      const isHeading = ['CADASTRO','SAÚDE - MEDICAÇÕES','SAÚDE - EXAMES','CALENDÁRIO'].includes(line) || idx === 0;
      doc.setFont('helvetica', isHeading ? 'bold' : 'normal');
      doc.setFontSize(idx === 0 ? 16 : (isHeading ? 12 : 10));
      const split = doc.splitTextToSize(line || ' ', width);
      split.forEach(part => {
        if (y > pageHeight - 48) { doc.addPage(); y = 48; }
        doc.text(part, margin, y);
        y += idx === 0 ? 20 : 14;
      });
      if (isHeading) y += 5;
    });
    doc.save(filename);
    toast('PDF criado.');
  } else {
    openPrintableReport(payload);
  }
}

function openPrintableReport(payload) {
  const lines = reportLinesFromPayload(payload);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Resumo</title><style>body{font-family:Arial,sans-serif;margin:32px;line-height:1.4}h1{font-size:22px}pre{white-space:pre-wrap;font-family:Arial,sans-serif;font-size:12px}</style></head><body><pre>${escapeHtml(lines.join('\n'))}</pre><script>window.print();<\/script></body></html>`;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  toast('Use a opção Salvar como PDF na janela de impressão.');
}

function safeFileName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').toLowerCase();
}

function base64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function downloadICS(ev, child) {
  const title = `${ev.titulo || 'Evento'} - ${fullName(child) || 'cReScer juntos'}`;
  const start = formatICSDate(ev.data, ev.hora || '09:00');
  const end = formatICSDate(ev.data, addOneHour(ev.hora || '09:00'));
  const ics = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//cReScer juntos//PT-BR','BEGIN:VEVENT',
    `UID:${ev.id}@crescer-juntos`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
    `DTSTART:${start}`, `DTEND:${end}`,
    `SUMMARY:${escapeICS(title)}`,
    `LOCATION:${escapeICS(ev.local || '')}`,
    `DESCRIPTION:${escapeICS([ev.tipo, ev.descricao].filter(Boolean).join(' - '))}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n');
  downloadBlob(new Blob([ics], { type: 'text/calendar' }), safeFileName(`${ev.titulo || 'evento'}.ics`));
}

function formatICSDate(date, time) {
  const [y,m,d] = (date || todayISO()).split('-');
  const [hh,mm] = (time || '09:00').split(':');
  return `${y}${m}${d}T${hh}${mm}00`;
}
function addOneHour(time) {
  const [h,m] = time.split(':').map(Number);
  return `${String((h + 1) % 24).padStart(2,'0')}:${String(m || 0).padStart(2,'0')}`;
}
function escapeICS(str = '') { return String(str).replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n'); }

function scheduleNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const child = getActiveChild();
  child?.events?.forEach(ev => {
    if (!ev.data || !ev.hora || ev._scheduled) return;
    const ms = new Date(`${ev.data}T${ev.hora}`).getTime() - Date.now();
    if (ms > 0 && ms < 2147483647) {
      ev._scheduled = true;
      setTimeout(() => new Notification('cReScer juntos', { body: `${ev.titulo} - ${fullName(child)}` }), ms);
    }
  });
}
