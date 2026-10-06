const DNP_ACTIVITY_STATUS = {
  try: { id: 'try', label: 'Quero experimentar' },
  doing: { id: 'doing', label: 'Já fazemos' },
  question: { id: 'question', label: 'Tenho uma dúvida' }
};

const dnpUi = {
  stageId: '',
  openMilestoneId: '',
  entries: {},
  bound: false
};

const DNP_ENTRY_TYPES = {
  concern: {
    key: 'concerns',
    field: 'description',
    label: 'Tenho uma preocupação',
    pdfTitle: 'Preocupações do responsável',
    placeholder: 'Escreva sua preocupação',
    savedMessage: 'Preocupação salva neste aparelho. Converse com o médico sem esperar a próxima etapa.',
    extra: () => ({ files: [] }),
    meta: item => [item.topic && `Tema: ${item.topic}`, item.context && `Contexto: ${item.context}`]
  },
  loss: {
    key: 'skillLosses',
    field: 'note',
    label: 'Percebi perda de uma habilidade',
    pdfTitle: 'Perdas de habilidades relatadas',
    placeholder: 'Descreva a habilidade que a criança deixou de fazer',
    savedMessage: 'Possível perda registrada neste aparelho. Esse histórico é preservado.',
    extra: () => ({ files: [] }),
    meta: item => item.skill ? [`Habilidade: ${item.skill}`, `Fazia por volta de ${formatDate(item.whenCouldDo) || 'data não informada'}`, `Mudança percebida em ${formatDate(item.whenNoticed) || 'data não informada'}`] : []
  },
  achievement: {
    key: 'extraAchievements',
    field: 'note',
    label: 'Registrar conquista avulsa',
    pdfTitle: 'Conquistas e avanços',
    placeholder: 'Descreva a conquista ou o avanço',
    savedMessage: 'Conquista registrada neste aparelho.',
    extra: () => ({ date: dnpToday() }),
    meta: item => {
      const milestone = item.milestoneId && DNP_CATALOG.milestones.find(entry => entry.id === item.milestoneId);
      return [item.title && `Título: ${item.title}`, milestone && `Marco: ${milestone.text}`, item.date && `Data da conquista: ${formatDate(item.date)}`];
    }
  }
};

function dnpEntryUi(childId, type) {
  dnpUi.entries[childId] ||= {};
  dnpUi.entries[childId][type] ||= { open: false, draft: '', editingId: '', editDraft: '' };
  return dnpUi.entries[childId][type];
}

function dnpEntryHasUnsaved(child, type) {
  const ui = dnpEntryUi(child.id, type);
  const config = DNP_ENTRY_TYPES[type];
  const editing = ui.editingId && child.dnp[config.key].find(item => item.id === ui.editingId);
  return ui.draft !== '' || Boolean(editing && ui.editDraft !== String(editing[config.field] || ''));
}

function dnpCommitEntries(child, key, mutate) {
  const snapshot = child.dnp[key].map(item => ({ ...item }));
  mutate(child.dnp[key]);
  if (dnpSave()) return true;
  child.dnp[key] = snapshot;
  return false;
}

function dnpSaveEntry(type, editingId = '') {
  const child = dnpChild();
  const config = DNP_ENTRY_TYPES[type];
  const ui = dnpEntryUi(child.id, type);
  const text = String(editingId ? ui.editDraft : ui.draft).trim();
  if (!text) {
    showToast('Escreva o texto antes de salvar.');
    return false;
  }
  const saved = dnpCommitEntries(child, config.key, list => {
    if (editingId) {
      const item = list.find(entry => entry.id === editingId);
      if (item && String(item[config.field] || '') !== text) Object.assign(item, { [config.field]: text, updatedAt: dnpNow() });
      return;
    }
    list.push({ id: uid(), childId: child.id, stageId: dnpUi.stageId, [config.field]: text, createdAt: dnpNow(), ...config.extra() });
  });
  if (!saved) return false;
  if (editingId) Object.assign(ui, { editingId: '', editDraft: '' });
  else ui.draft = '';
  if (!dnpEntryHasUnsaved(child, type)) Object.assign(ui, { open: false, editingId: '', editDraft: '' });
  showToast(config.savedMessage);
  return true;
}

async function dnpDeleteEntry(type, id) {
  const child = dnpChild();
  const config = DNP_ENTRY_TYPES[type];
  const item = child.dnp[config.key].find(entry => entry.id === id);
  if (!item || !await confirmUserChoice('Deseja realmente excluir este registro?')) return false;
  const deleted = dnpCommitEntries(child, config.key, list => {
    const index = list.findIndex(entry => entry.id === id);
    if (index >= 0) list.splice(index, 1);
  });
  if (!deleted) return false;
  const ui = dnpEntryUi(child.id, type);
  if (ui.editingId === id) Object.assign(ui, { editingId: '', editDraft: '' });
  for (const ref of item.files || []) await deleteLocalFileRef(ref);
  showToast('Registro excluído.');
  return true;
}

function emptyDnpState() {
  return {
    catalogVersion: DNP_CATALOG.version,
    healthOnce: { premature: '', gestationalWeeks: '', specialNeeds: '', updatedAt: '' },
    answers: {},
    answerHistory: [],
    recurring: {},
    recurringHistory: [],
    concerns: [],
    skillLosses: [],
    activities: {},
    activityHistory: [],
    extraAchievements: []
  };
}

function normalizeDnpState(child) {
  if (!child.dnp || typeof child.dnp !== 'object') child.dnp = emptyDnpState();
  const dnp = child.dnp;
  dnp.catalogVersion = dnp.catalogVersion || DNP_CATALOG.version;
  dnp.healthOnce = {
    premature: '',
    gestationalWeeks: '',
    specialNeeds: '',
    updatedAt: '',
    ...(dnp.healthOnce || {})
  };
  dnp.answers = dnp.answers && typeof dnp.answers === 'object' ? dnp.answers : {};
  dnp.answerHistory = Array.isArray(dnp.answerHistory) ? dnp.answerHistory : [];
  dnp.recurring = dnp.recurring && typeof dnp.recurring === 'object' ? dnp.recurring : {};
  dnp.recurringHistory = Array.isArray(dnp.recurringHistory) ? dnp.recurringHistory : [];
  dnp.concerns = Array.isArray(dnp.concerns) ? dnp.concerns : [];
  dnp.skillLosses = Array.isArray(dnp.skillLosses) ? dnp.skillLosses : [];
  dnp.activities = dnp.activities && typeof dnp.activities === 'object' ? dnp.activities : {};
  dnp.activityHistory = Array.isArray(dnp.activityHistory) ? dnp.activityHistory : [];
  dnp.extraAchievements = Array.isArray(dnp.extraAchievements) ? dnp.extraAchievements : [];
  dnp.concerns.forEach(item => { item.files = Array.isArray(item.files) ? item.files : []; });
  dnp.skillLosses.forEach(item => { item.files = Array.isArray(item.files) ? item.files : []; });
  return dnp;
}

function dnpChild() {
  const child = currentChild();
  normalizeDnpState(child);
  return child;
}

function dnpNow() {
  return new Date().toISOString();
}

function dnpToday() {
  return new Date().toISOString().slice(0, 10);
}

function dnpStageById(stageId) {
  return DNP_CATALOG.stages.find(stage => stage.id === stageId) || null;
}

function dnpMilestonesByStage(stageId) {
  return DNP_CATALOG.milestones.filter(item => item.stageId === stageId);
}

function dnpActivitiesByStage(stageId) {
  return DNP_CATALOG.activities.filter(item => item.stageId === stageId);
}

function dnpAreaLabel(areaId) {
  return (DNP_CATALOG.areas.find(area => area.id === areaId) || {}).label || areaId;
}

function dnpAgeParts(dateString, now = new Date()) {
  if (!dateString) return null;
  const birth = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += prevMonth;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  if (years < 0) return null;
  return { years, months, days, totalMonths: years * 12 + months };
}

function dnpReferenceStage(dateString) {
  const age = dnpAgeParts(dateString);
  if (!age) return { stage: null, reason: 'missing-birth' };
  let stage = null;
  for (const item of DNP_CATALOG.stages) {
    if (age.totalMonths >= item.months) stage = item;
  }
  return { stage, age, reason: stage ? 'chronological' : 'before-first' };
}

function dnpStageKind(stage, reference) {
  if (!reference.age) return 'browse';
  if (reference.age.totalMonths < stage.months) return 'future';
  if (reference.stage && stage.id === reference.stage.id) return 'reference';
  return 'past';
}

function dnpAnswersEqual(a = {}, b = {}) {
  return ['status', 'note', 'achievedWhen', 'achievedDate'].every(key => String(a[key] || '') === String(b[key] || ''));
}

function dnpCountStage(child, stageId) {
  const totals = { total: 0, answered: 0, does: 0, starting: 0, not_yet: 0, unknown: 0, empty: 0 };
  dnpMilestonesByStage(stageId).forEach(item => {
    totals.total += 1;
    const status = child.dnp.answers[item.id]?.status || '';
    if (!status) {
      totals.empty += 1;
      return;
    }
    totals.answered += 1;
    if (totals[status] != null) totals[status] += 1;
  });
  return totals;
}

function dnpIsAlertStatus(status) {
  return status === 'not_yet';
}

function dnpCollectFileRefs(child) {
  const refs = [];
  const dnp = child?.dnp;
  if (!dnp) return refs;
  for (const item of dnp.concerns || []) refs.push(...(item.files || []));
  for (const item of dnp.skillLosses || []) refs.push(...(item.files || []));
  return refs.filter(Boolean);
}

async function hydrateDnpFiles(child) {
  if (!child?.dnp) return;
  normalizeDnpState(child);
  for (const item of child.dnp.concerns) {
    const files = [];
    for (const asset of item.files || []) files.push(await hydrateLocalFileRef(asset, { kind: 'dnp', childId: child.id, parentId: item.id }));
    item.files = files.filter(Boolean);
  }
  for (const item of child.dnp.skillLosses) {
    const files = [];
    for (const asset of item.files || []) files.push(await hydrateLocalFileRef(asset, { kind: 'dnp', childId: child.id, parentId: item.id }));
    item.files = files.filter(Boolean);
  }
}

async function deleteDnpFiles(child) {
  for (const ref of dnpCollectFileRefs(child)) await deleteLocalFileRef(ref);
}

function dnpSave() {
  return saveState();
}

function dnpSetAnswer(milestoneId, patch) {
  const child = dnpChild();
  const previous = child.dnp.answers[milestoneId] ? { ...child.dnp.answers[milestoneId] } : null;
  const next = {
    childId: child.id,
    milestoneId,
    status: '',
    note: '',
    achievedWhen: '',
    achievedDate: '',
    recordedAt: dnpNow(),
    ...(previous || {}),
    ...patch,
    childId: child.id,
    updatedAt: dnpNow()
  };
  if (next.status !== 'does') {
    next.achievedWhen = '';
    next.achievedDate = '';
  } else if (next.achievedWhen === 'today' && (patch.achievedWhen === 'today' || !next.achievedDate)) {
    next.achievedDate = dnpToday();
  } else if (next.achievedWhen === 'unknown') {
    next.achievedDate = '';
  }
  if (!previous) next.recordedAt = dnpNow();
  if (previous && !dnpAnswersEqual(previous, next)) {
    child.dnp.answerHistory.push({
      id: uid(),
      childId: child.id,
      milestoneId,
      status: previous.status,
      note: previous.note,
      achievedWhen: previous.achievedWhen,
      achievedDate: previous.achievedDate,
      recordedAt: previous.recordedAt,
      replacedAt: dnpNow()
    });
    next.recordedAt = dnpNow();
  }
  child.dnp.answers[milestoneId] = next;
  dnpSave();
  renderDnp({ keepScroll: true });
}

const DNP_RECURRING_FIELDS = ['together', 'likes', 'concernHas', 'concernTopic', 'concernDescription', 'concernContext', 'lostSkill', 'specialHealthNote'];

function dnpSetRecurring(stageId, patch) {
  const child = dnpChild();
  const previous = child.dnp.recurring[stageId] || {};
  const changed = DNP_RECURRING_FIELDS.some(key => key in patch && String(patch[key] || '') !== String(previous[key] || ''));
  if (!changed) return false;
  if (child.dnp.recurring[stageId]) {
    child.dnp.recurringHistory.push({
      id: uid(),
      ...previous,
      childId: child.id,
      stageId,
      replacedAt: dnpNow()
    });
  }
  child.dnp.recurring[stageId] = {
    childId: child.id,
    stageId,
    together: '',
    likes: '',
    concernHas: '',
    concernTopic: '',
    concernDescription: '',
    concernContext: '',
    lostSkill: '',
    specialHealthNote: '',
    ...previous,
    ...patch,
    childId: child.id,
    stageId,
    recordedAt: dnpNow(),
    updatedAt: dnpNow()
  };
  dnpSave();
  return true;
}

function dnpSetActivity(activityId, status) {
  const child = dnpChild();
  const previous = child.dnp.activities[activityId];
  if (previous && previous.status && previous.status !== status) {
    child.dnp.activityHistory.push({
      id: uid(),
      activityId,
      status: previous.status,
      note: previous.note || '',
      recordedAt: previous.recordedAt,
      replacedAt: dnpNow()
    });
  }
  child.dnp.activities[activityId] = {
    childId: child.id,
    activityId,
    status,
    note: previous?.note || '',
    recordedAt: dnpNow(),
    updatedAt: dnpNow()
  };
  dnpSave();
  renderDnp({ keepScroll: true });
}

function dnpTimeline(child) {
  const items = [];
  Object.values(child.dnp.answers).forEach(answer => {
    const milestone = DNP_CATALOG.milestones.find(item => item.id === answer.milestoneId);
    if (!milestone || !answer.status) return;
    items.push({
      at: answer.recordedAt || answer.updatedAt,
      type: 'answer',
      title: milestone.text,
      detail: `${DNP_CATALOG.statuses[answer.status]?.label || answer.status}${answer.note ? ` — ${answer.note}` : ''}`,
      alert: dnpIsAlertStatus(answer.status)
    });
  });
  child.dnp.answerHistory.forEach(entry => {
    const milestone = DNP_CATALOG.milestones.find(item => item.id === entry.milestoneId);
    items.push({
      at: entry.recordedAt || entry.replacedAt,
      type: 'history',
      title: milestone ? `Registro anterior: ${milestone.text}` : 'Registro anterior de um marco',
      detail: `${DNP_CATALOG.statuses[entry.status]?.label || entry.status}${entry.note ? ` — ${entry.note}` : ''}`,
      alert: false
    });
  });
  child.dnp.concerns.forEach(item => {
    items.push({
      at: item.createdAt,
      type: 'concern',
      title: item.topic || 'Preocupação da família',
      detail: [item.description, item.context].filter(Boolean).join(' — '),
      alert: true
    });
  });
  child.dnp.skillLosses.forEach(item => {
    items.push({
      at: item.createdAt,
      type: 'loss',
      title: `Possível perda: ${item.skill || 'habilidade'}`,
      detail: [...(item.skill ? [`Fazia por volta de ${formatDate(item.whenCouldDo) || 'data não informada'}`, `Mudança percebida em ${formatDate(item.whenNoticed) || 'data não informada'}`] : []), item.note].filter(Boolean).join(' — '),
      alert: true
    });
  });
  Object.entries(child.dnp.recurring).forEach(([stageId, entry]) => {
    const stage = dnpStageById(stageId);
    const bits = [entry.together && `Fazem juntos: ${entry.together}`, entry.likes && `Gosta de: ${entry.likes}`, entry.concernHas === 'yes' && (entry.concernDescription || 'Há uma preocupação nesta etapa'), entry.lostSkill].filter(Boolean);
    if (!bits.length) return;
    items.push({
      at: entry.updatedAt || entry.recordedAt,
      type: 'recurring',
      title: `Perguntas da etapa de ${stage?.label || stageId}`,
      detail: bits.join(' | '),
      alert: entry.concernHas === 'yes' || Boolean(entry.lostSkill)
    });
  });
  child.dnp.recurringHistory.forEach(entry => {
    const stage = dnpStageById(entry.stageId);
    const bits = [entry.together && `Fazem juntos: ${entry.together}`, entry.likes && `Gosta de: ${entry.likes}`, entry.concernHas === 'yes' && (entry.concernDescription || 'Há uma preocupação nesta etapa'), entry.lostSkill].filter(Boolean);
    if (!bits.length) return;
    items.push({
      at: entry.updatedAt || entry.recordedAt || entry.replacedAt,
      type: 'history',
      title: `Registro anterior: perguntas da etapa de ${stage?.label || entry.stageId}`,
      detail: bits.join(' | '),
      alert: false
    });
  });
  child.dnp.extraAchievements.forEach(item => {
    items.push({
      at: item.createdAt,
      type: 'achievement',
      title: item.title || 'Conquista entre etapas',
      detail: item.note || '',
      alert: false
    });
  });
  return items.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

function dnpSelectedStage(child) {
  const reference = dnpReferenceStage(child.nascimento);
  if (dnpUi.stageId && dnpStageById(dnpUi.stageId)) return dnpStageById(dnpUi.stageId);
  return reference.stage || DNP_CATALOG.stages[0];
}

function dnpStatusHint(child, stage) {
  const counts = dnpCountStage(child, stage.id);
  const parts = [];
  if (counts.does) parts.push(`${counts.does} já faz`);
  if (counts.starting) parts.push(`${counts.starting} começando`);
  if (counts.not_yet) parts.push(`${counts.not_yet} ainda não faz`);
  if (counts.unknown) parts.push(`${counts.unknown} sem oportunidade de observar`);
  if (!parts.length) return 'Nenhuma resposta nesta etapa ainda.';
  return parts.join(' · ');
}

function renderDnp(opts = {}) {
  const root = $('dnpApp');
  if (!root) return;
  const child = dnpChild();
  const scroll = opts.keepScroll ? window.scrollY : null;
  const reference = dnpReferenceStage(child.nascimento);
  const stage = dnpSelectedStage(child);
  dnpUi.stageId = stage.id;
  const kind = dnpStageKind(stage, reference);
  const counts = dnpCountStage(child, stage.id);
  const name = child.nome ? `${child.nome} ${child.sobrenome || ''}`.trim() : 'Criança sem nome';
  const ageText = child.nascimento ? calculateAgeText(child.nascimento) : 'Cadastre a data de nascimento para calcular a idade.';
  const hasAlerts = child.dnp.concerns.length || child.dnp.skillLosses.length || counts.not_yet > 0;
  const specialRecord = String(child.registroEspecial || '').trim();

  root.innerHTML = `
    <article class="card dnp-child-card">
      <div class="dnp-child-top">
        <div>
          <p class="muted">Acompanhamento da criança ativa</p>
          <h3>${escapeHtml(name)}</h3>
          <p class="age-line">${escapeHtml(ageText)}</p>
          <p class="muted">Nascimento: ${escapeHtml(formatDate(child.nascimento) || 'ainda não informado')}</p>
        </div>
        <div class="dnp-status-stack">
          <span class="badge dnp-save-badge">Salvo neste aparelho</span>
          <span class="badge">Não compartilhado</span>
          <span class="badge">Não revisado pelo médico</span>
        </div>
      </div>
      <p class="dnp-disclaimer">Este espaço ajuda a família a acompanhar o desenvolvimento e a conversar com o profissional de saúde. Os marcos não substituem uma triagem padronizada e validada. O aplicativo não gera nota, percentual de normalidade, atraso ou diagnóstico.</p>
    </article>

    <div class="dnp-quick-actions">
      ${Object.keys(DNP_ENTRY_TYPES).map(type => renderDnpEntrySection(child, type)).join('')}
    </div>

    ${hasAlerts ? `
      <article class="card dnp-alert-card">
        <h3>Converse com o médico sem esperar a próxima etapa</h3>
        <p>Uma preocupação da família, uma possível perda de habilidade ou um marco ainda não observado são motivos para falar com o pediatra. Isso não é um diagnóstico automático.</p>
      </article>
    ` : ''}

    <article class="card">
      <h3>Registro de prematuridade ou necessidade especial</h3>
      <p class="dnp-special-record">${specialRecord ? escapeHtml(specialRecord) : 'Não há registro'}</p>
      ${child.problemas ? `<p><strong>Problemas de saúde no cadastro:</strong> ${escapeHtml(child.problemas)}</p>` : ''}
      <div class="actions">
        <button type="button" class="secondary" data-dnp-action="go-cadastro">Abrir cadastro da criança</button>
      </div>
    </article>

    <article class="card">
      <h3>Etapa de referência</h3>
      ${reference.reason === 'missing-birth' ? '<p>Informe a data de nascimento no cadastro para o aplicativo indicar a etapa da idade cronológica.</p>' : ''}
      ${reference.reason === 'before-first' ? '<p>Pela idade cronológica, a primeira etapa da cartilha (2 meses) ainda é futura. Você pode olhar as etapas, mas os itens não viram pendência.</p>' : ''}
      ${reference.stage ? `<p>Pela idade cronológica, a etapa de referência é <strong>${escapeHtml(reference.stage.label)}</strong>. Entre duas idades da cartilha, usamos a etapa anterior já alcançada. A próxima aparece como futura e não vira lista de pendências.</p>` : ''}
      <p class="muted">Não há cálculo de idade corrigida neste aplicativo. Se a criança nasceu prematura, converse com o médico sobre qual idade usar na consulta. A família não escolhe qual idade orienta a etapa de referência.</p>
      <div class="dnp-stage-grid" role="list">
        ${DNP_CATALOG.stages.map(item => {
          const itemKind = dnpStageKind(item, reference);
          const selected = item.id === stage.id;
          return `<button type="button" class="dnp-stage-chip ${selected ? 'selected' : ''} kind-${itemKind}" data-dnp-action="select-stage" data-stage-id="${item.id}">
            <strong>${escapeHtml(item.label)}</strong>
            <small>${itemKind === 'reference' ? 'Referência agora' : itemKind === 'future' ? 'Etapa futura' : itemKind === 'past' ? 'Etapa anterior' : 'Disponível'}</small>
          </button>`;
        }).join('')}
      </div>
    </article>

    <article class="card dnp-stage-card">
      <div class="dnp-stage-head">
        <div>
          <h3>Marcos aos ${escapeHtml(stage.label)}</h3>
          <p>${kind === 'future' ? 'Esta etapa ainda é futura para a idade cronológica. Você pode ler os itens, mas eles não ficam como pendência.' : 'Responda o que a família já observou. Não é obrigatório preencher etapas anteriores.'}</p>
          <p class="muted">${escapeHtml(dnpStatusHint(child, stage))} “Não sei / não tive oportunidade” não conta como “ainda não faz”.</p>
        </div>
      </div>
      ${DNP_CATALOG.areas.map(area => renderDnpArea(child, stage, area, kind)).join('')}
    </article>

    <article class="card">
      <h3>Perguntas para conversar com o médico</h3>
      <p class="muted">Ficam gravadas nesta etapa e na linha do tempo da criança ativa.</p>
      ${renderDnpRecurringForm(child, stage)}
    </article>

    <article class="card">
      <h3>Ajude seu ${stage.childWord === 'bebê' ? 'bebê' : 'filho'} a aprender e crescer</h3>
      <p class="muted">Brincadeiras, rotina, alimentação, sono, telas, segurança e comportamento desta etapa. Marcar uma atividade não marca um marco como alcançado.</p>
      <div class="dnp-activity-grid">
        ${dnpActivitiesByStage(stage.id).map(activity => renderDnpActivityCard(child, activity)).join('')}
      </div>
    </article>

    <article class="card">
      <h3>Linha do tempo desta criança</h3>
      <p class="muted">Novas respostas não apagam o que já foi registrado. Preocupações e possíveis perdas permanecem mesmo se o checklist mudar depois.</p>
      <div class="list dnp-timeline">${renderDnpTimeline(child)}</div>
    </article>
  `;

  if (scroll != null) window.scrollTo({ top: scroll, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function dnpLegacyHealthText(child) {
  const health = child.dnp?.healthOnce || {};
  const premature = health.premature === 'yes' ? 'Nasceu prematuro' : health.premature === 'no' ? 'Não nasceu prematuro' : health.premature === 'unknown' ? 'Prematuridade ainda não confirmada pela família' : '';
  return [premature, health.gestationalWeeks && `Idade gestacional aproximada: ${health.gestationalWeeks} semanas`, health.specialNeeds].filter(Boolean).join('\n');
}

function renderDnpArea(child, stage, area, kind) {
  const items = dnpMilestonesByStage(stage.id).filter(item => item.areaId === area.id);
  if (!items.length) return '';
  return `
    <section class="dnp-area">
      <h4>${escapeHtml(area.label)}</h4>
      ${items.map(item => renderDnpMilestone(child, item, kind)).join('')}
    </section>
  `;
}

function renderDnpMilestone(child, item, kind) {
  const answer = child.dnp.answers[item.id] || {};
  const open = dnpUi.openMilestoneId === item.id || Boolean(answer.status);
  return `
    <article class="dnp-milestone ${answer.status === 'not_yet' ? 'is-alert' : ''}" data-milestone-id="${item.id}">
      <p class="dnp-milestone-text">${escapeHtml(item.text)}</p>
      ${item.example ? `<p class="muted dnp-example">${escapeHtml(item.example)}</p>` : ''}
      ${kind === 'future' ? '<p class="muted">Etapa futura: leitura livre, sem pendência automática.</p>' : ''}
      <div class="dnp-status-options">
        ${Object.values(DNP_CATALOG.statuses).map(status => `
          <label class="dnp-radio ${answer.status === status.id ? 'selected' : ''}">
            <input type="radio" name="dnp-${item.id}" value="${status.id}" ${answer.status === status.id ? 'checked' : ''} data-dnp-action="set-status" data-milestone-id="${item.id}" />
            <span>${escapeHtml(status.label)}</span>
          </label>
        `).join('')}
      </div>
      ${answer.status === 'does' ? `
        <div class="dnp-achieved">
          <p>Quando a família percebeu essa habilidade?</p>
          <label class="dnp-radio ${answer.achievedWhen === 'today' ? 'selected' : ''}"><input type="radio" name="dnp-when-${item.id}" value="today" ${answer.achievedWhen === 'today' ? 'checked' : ''} data-dnp-action="set-achieved-when" data-milestone-id="${item.id}" /><span>Hoje</span></label>
          <label class="dnp-radio ${answer.achievedWhen === 'approx' ? 'selected' : ''}"><input type="radio" name="dnp-when-${item.id}" value="approx" ${answer.achievedWhen === 'approx' ? 'checked' : ''} data-dnp-action="set-achieved-when" data-milestone-id="${item.id}" /><span>Data aproximada</span></label>
          <label class="dnp-radio ${answer.achievedWhen === 'unknown' ? 'selected' : ''}"><input type="radio" name="dnp-when-${item.id}" value="unknown" ${answer.achievedWhen === 'unknown' ? 'checked' : ''} data-dnp-action="set-achieved-when" data-milestone-id="${item.id}" /><span>Não lembra</span></label>
          ${answer.achievedWhen === 'approx' ? `<label>Data aproximada da conquista<input type="date" value="${escapeHtml(answer.achievedDate || '')}" data-dnp-action="set-achieved-date" data-milestone-id="${item.id}" /></label>` : ''}
        </div>
      ` : ''}
      ${open ? `
        <label class="wide">Observação opcional
          <textarea rows="2" data-dnp-action="set-note" data-milestone-id="${item.id}" placeholder="Como foi, em que situação, o que chamou atenção">${escapeHtml(answer.note || '')}</textarea>
        </label>
      ` : ''}
      ${answer.recordedAt ? `<p class="muted">Preenchido neste aparelho em ${escapeHtml(formatDnpDateTime(answer.recordedAt))}${answer.achievedDate ? `. Conquista aproximada: ${escapeHtml(formatDate(answer.achievedDate))}` : ''}.</p>` : ''}
    </article>
  `;
}

function renderDnpRecurringForm(child, stage) {
  const entry = child.dnp.recurring[stage.id] || {};
  const specialRecord = String(child.registroEspecial || '').trim();
  return `
    <form class="grid-form" data-dnp-form="recurring" data-stage-id="${stage.id}">
      <label class="wide">O que a família e a criança costumam fazer juntas?
        <textarea name="together" rows="2">${escapeHtml(entry.together || '')}</textarea>
      </label>
      <label class="wide">Do que a criança gosta?
        <textarea name="likes" rows="2">${escapeHtml(entry.likes || '')}</textarea>
      </label>
      <label>Existe algo que preocupa a família?
        <select name="concernHas">
          <option value="" ${!entry.concernHas ? 'selected' : ''}></option>
          <option value="no" ${entry.concernHas === 'no' ? 'selected' : ''}>Não</option>
          <option value="yes" ${entry.concernHas === 'yes' ? 'selected' : ''}>Sim</option>
          <option value="doubt" ${entry.concernHas === 'doubt' ? 'selected' : ''}>Há dúvida</option>
        </select>
      </label>
      <label>Tema da preocupação<input name="concernTopic" value="${escapeHtml(entry.concernTopic || '')}" /></label>
      <label class="wide">Descrição da preocupação<textarea name="concernDescription" rows="2">${escapeHtml(entry.concernDescription || '')}</textarea></label>
      <label class="wide">Contexto<textarea name="concernContext" rows="2" placeholder="Onde, quando, com quem">${escapeHtml(entry.concernContext || '')}</textarea></label>
      <label class="wide">A criança deixou de fazer algo que fazia?
        <textarea name="lostSkill" rows="2">${escapeHtml(entry.lostSkill || '')}</textarea>
      </label>
      <div class="wide dnp-health-reuse">
        <p><strong>Há necessidade especial de saúde ou prematuridade?</strong></p>
        <p class="muted">${specialRecord || child.problemas ? `${escapeHtml([child.problemas, specialRecord].filter(Boolean).join(' '))} Se quiser complementar só esta etapa, use o campo abaixo.` : 'Essa informação ainda não está no cadastro da criança.'}</p>
        <textarea name="specialHealthNote" rows="2" placeholder="Complemento só desta conversa, se necessário">${escapeHtml(entry.specialHealthNote || '')}</textarea>
      </div>
      <div class="actions wide">
        <button type="submit" class="primary">Salvar perguntas desta etapa</button>
      </div>
    </form>
  `;
}

function renderDnpActivityCard(child, activity) {
  const current = child.dnp.activities[activity.id] || {};
  return `
    <article class="dnp-activity-card">
      <h4>${escapeHtml(activity.title)}</h4>
      <p>${escapeHtml(activity.text)}</p>
      ${activity.flags.length ? '<p class="muted">Orientação da cartilha, pendente de revisão médica antes de ser tratada como regra definitiva no app.</p>' : ''}
      <div class="dnp-activity-actions">
        ${Object.values(DNP_ACTIVITY_STATUS).map(status => `
          <button type="button" class="${current.status === status.id ? 'primary' : 'secondary'}" data-dnp-action="set-activity" data-activity-id="${activity.id}" data-status="${status.id}">${escapeHtml(status.label)}</button>
        `).join('')}
      </div>
    </article>
  `;
}

function renderDnpTimeline(child) {
  const items = dnpTimeline(child);
  if (!items.length) return '<p class="muted">Ainda não há registros nesta área para a criança ativa.</p>';
  return items.slice(0, 40).map(item => `
    <div class="item ${item.alert ? 'dnp-timeline-alert' : ''}">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.detail || '')}</p>
      <small>${escapeHtml(formatDnpDateTime(item.at))} · ${item.type === 'concern' ? 'Preocupação' : item.type === 'loss' ? 'Possível perda' : item.type === 'history' ? 'Histórico preservado' : 'Registro local'}</small>
    </div>
  `).join('');
}

function dnpEntryDateText(item) {
  return [item.createdAt && `Registrado em ${formatDnpDateTime(item.createdAt)}`, item.updatedAt && `editado em ${formatDnpDateTime(item.updatedAt)}`].filter(Boolean).join('; ');
}

function renderDnpEntrySection(child, type) {
  const config = DNP_ENTRY_TYPES[type];
  const ui = dnpEntryUi(child.id, type);
  const items = child.dnp[config.key];
  const panelId = `dnp-entry-panel-${type}`;
  return `
    <section class="dnp-entry-section ${ui.open ? 'is-open' : ''}">
      <button type="button" class="secondary dnp-entry-toggle" data-dnp-action="toggle-entry" data-entry-type="${type}" aria-expanded="${ui.open}" aria-controls="${panelId}">
        <span>${escapeHtml(config.label)}${items.length ? ` <small class="dnp-entry-count">(${items.length})</small>` : ''}</span>
        <span class="dnp-entry-arrow" aria-hidden="true">${ui.open ? '▲' : '▼'}</span>
      </button>
      ${ui.open ? `
        <div class="card dnp-entry-panel" id="${panelId}" role="region" aria-label="${escapeHtml(config.label)}">
          ${items.length ? `<div class="list">${items.slice().reverse().map(item => renderDnpEntryItem(type, item, ui)).join('')}</div>` : ''}
          <label class="dnp-entry-new">${escapeHtml(config.label)}
            <textarea rows="4" data-dnp-entry-draft="${type}" placeholder="${escapeHtml(config.placeholder)}">${escapeHtml(ui.draft)}</textarea>
          </label>
          <div class="actions">
            <button type="button" class="primary" data-dnp-action="save-entry" data-entry-type="${type}">Salvar</button>
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

function renderDnpEntryItem(type, item, ui) {
  const config = DNP_ENTRY_TYPES[type];
  const text = String(item[config.field] || '');
  const editing = ui.editingId === item.id;
  const stage = item.stageId && dnpStageById(item.stageId);
  const when = [dnpEntryDateText(item), stage && `Etapa ${stage.label}`].filter(Boolean).join(' · ');
  const ids = `data-entry-type="${type}" data-entry-id="${escapeHtml(item.id)}"`;
  return `
    <article class="item dnp-entry-item">
      <small>${escapeHtml(when)}</small>
      ${config.meta(item).filter(Boolean).map(line => `<p>${escapeHtml(line)}</p>`).join('')}
      ${item.files?.length ? `<p>${item.files.length} anexo(s) preservado(s)</p>` : ''}
      ${editing ? `
        <label>Editar registro
          <textarea rows="4" data-dnp-entry-edit="${type}">${escapeHtml(ui.editDraft)}</textarea>
        </label>
        <div class="actions">
          <button type="button" class="primary" data-dnp-action="save-entry" ${ids}>Salvar</button>
          <button type="button" class="secondary" data-dnp-action="cancel-edit-entry" ${ids}>Cancelar</button>
          <button type="button" class="danger" data-dnp-action="delete-entry" ${ids}>Excluir</button>
        </div>
      ` : `
        ${text ? `<p class="dnp-entry-text">${escapeHtml(text)}</p>` : ''}
        <div class="actions">
          <button type="button" class="secondary" data-dnp-action="edit-entry" ${ids}>Editar</button>
          <button type="button" class="danger" data-dnp-action="delete-entry" ${ids}>Excluir</button>
        </div>
      `}
    </article>
  `;
}

function formatDnpDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDate(value);
  return date.toLocaleString('pt-BR');
}

function initDnp() {
  const root = $('dnpApp');
  if (!root || dnpUi.bound) return;
  dnpUi.bound = true;

  root.addEventListener('click', async event => {
    const button = event.target.closest('[data-dnp-action]');
    if (!button) return;
    const action = button.dataset.dnpAction;
    if (action === 'select-stage') {
      dnpUi.stageId = button.dataset.stageId;
      renderDnp();
    }
    if (action === 'go-cadastro') switchTab('cadastro');
    if (action === 'set-activity') dnpSetActivity(button.dataset.activityId, button.dataset.status);

    const type = button.dataset.entryType;
    if (!DNP_ENTRY_TYPES[type]) return;
    const child = dnpChild();
    const config = DNP_ENTRY_TYPES[type];
    const ui = dnpEntryUi(child.id, type);
    const id = button.dataset.entryId || '';
    const editing = ui.editingId && child.dnp[config.key].find(item => item.id === ui.editingId);
    const editChanged = Boolean(editing && ui.editDraft !== String(editing[config.field] || ''));
    const focusToggle = () => root.querySelector(`[data-dnp-action="toggle-entry"][data-entry-type="${type}"]`)?.focus({ preventScroll: true });
    if (action === 'toggle-entry') {
      if (ui.open && dnpEntryHasUnsaved(child, type) && !await confirmUserChoice('Há texto não salvo nesta seção. Deseja fechar e descartar?')) return;
      Object.assign(ui, ui.open ? { open: false, draft: '', editingId: '', editDraft: '' } : { open: true });
      renderDnp({ keepScroll: true });
      focusToggle();
    }
    if (action === 'save-entry' && dnpSaveEntry(type, id)) {
      renderDnp({ keepScroll: true });
      focusToggle();
    }
    if (action === 'edit-entry') {
      if (editChanged && ui.editingId !== id && !await confirmUserChoice('Há uma edição não salva em outro registro. Deseja descartá-la?')) return;
      const item = child.dnp[config.key].find(entry => entry.id === id);
      if (!item) return;
      Object.assign(ui, { editingId: id, editDraft: String(item[config.field] || '') });
      renderDnp({ keepScroll: true });
      root.querySelector(`[data-dnp-entry-edit="${type}"]`)?.focus({ preventScroll: true });
    }
    if (action === 'cancel-edit-entry') {
      if (editChanged && !await confirmUserChoice('Deseja descartar as alterações deste registro?')) return;
      Object.assign(ui, { editingId: '', editDraft: '' });
      renderDnp({ keepScroll: true });
    }
    if (action === 'delete-entry' && await dnpDeleteEntry(type, id)) renderDnp({ keepScroll: true });
  });

  root.addEventListener('input', event => {
    const field = event.target;
    if (field.dataset.dnpEntryDraft) dnpEntryUi(dnpChild().id, field.dataset.dnpEntryDraft).draft = field.value;
    if (field.dataset.dnpEntryEdit) dnpEntryUi(dnpChild().id, field.dataset.dnpEntryEdit).editDraft = field.value;
  });

  window.addEventListener('beforeunload', event => {
    const pending = state.children.some(child => Object.keys(dnpUi.entries[child.id] || {}).some(type => dnpEntryHasUnsaved(child, type)));
    if (pending) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  root.addEventListener('change', event => {
    const field = event.target;
    const action = field.dataset.dnpAction;
    if (action === 'set-status') dnpSetAnswer(field.dataset.milestoneId, { status: field.value });
    if (action === 'set-achieved-when') dnpSetAnswer(field.dataset.milestoneId, { achievedWhen: field.value, status: 'does' });
    if (action === 'set-achieved-date') dnpSetAnswer(field.dataset.milestoneId, { achievedWhen: 'approx', achievedDate: field.value, status: 'does' });
  });

  root.addEventListener('focusout', event => {
    const field = event.target;
    if (field.dataset.dnpAction === 'set-note') {
      dnpSetAnswer(field.dataset.milestoneId, { note: field.value, status: dnpChild().dnp.answers[field.dataset.milestoneId]?.status || '' });
    }
  });

  root.addEventListener('submit', async event => {
    const form = event.target.closest('[data-dnp-form]');
    if (!form) return;
    event.preventDefault();
    const child = dnpChild();
    const data = Object.fromEntries(new FormData(form).entries());
    if (form.dataset.dnpForm === 'recurring') {
      dnpSetRecurring(form.dataset.stageId, data);
      if (data.concernHas === 'yes' || data.concernHas === 'doubt') {
        const stageId = form.dataset.stageId;
        const latest = child.dnp.concerns.filter(item => item.fromRecurring && item.stageId === stageId).pop();
        const payload = {
          childId: child.id,
          stageId,
          topic: data.concernTopic || 'Preocupação da etapa',
          description: data.concernDescription || '',
          context: data.concernContext || `Etapa ${dnpStageById(stageId)?.label || ''}`,
          fromRecurring: true
        };
        const unchanged = latest && ['topic', 'description', 'context'].every(key => latest[key] === payload[key]);
        if (!unchanged) {
          child.dnp.concerns.push({ id: uid(), createdAt: dnpNow(), files: [], ...payload });
          dnpSave();
        }
      }
      showToast('Perguntas desta etapa salvas neste aparelho.');
      renderDnp({ keepScroll: true });
    }
  });
}

function dnpEntryForChild(item, child) {
  return !item?.childId || item.childId === child.id;
}

function dnpEntryPdfText(item, config) {
  const stage = item.stageId && dnpStageById(item.stageId);
  return [
    dnpEntryDateText(item),
    stage && `Etapa: ${stage.label}`,
    ...config.meta(item),
    item[config.field]
  ].filter(part => String(part || '').trim()).join('\n');
}

function addDnpMultiline(doc, text, y) {
  doc.setTextColor(23, 33, 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  String(text).split(/\r\n|\r|\n/).forEach(paragraph => {
    const wrapped = paragraph ? doc.splitTextToSize(paragraph, 170) : [''];
    const lines = Array.isArray(wrapped) ? wrapped : [String(wrapped)];
    lines.forEach(line => {
      y = ensurePage(doc, y, 6);
      if (line) doc.text(line, 20, y);
      y += 5;
    });
  });
  return y + 2;
}

function addDnpToChildPdf(doc, child, y) {
  normalizeDnpState(child);
  y = addSection(doc, 'DESENVOLVIMENTO NEUROPSICOMOTOR', y, [22, 110, 229]);
  y = addParagraph(doc, 'Acompanhamento familiar para conversa com o profissional. Não substitui triagem padronizada e não é diagnóstico. Registro salvo neste aparelho.', y);
  y = addLine(doc, 'Idade cronológica', calculateAgeText(child.nascimento), y);
  const reference = dnpReferenceStage(child.nascimento);
  y = addLine(doc, 'Etapa de referência', reference.stage ? reference.stage.label : 'Ainda sem etapa cronológica', y);
  const specialRecord = String(child.registroEspecial || '').trim();
  if (specialRecord) {
    y = addParagraph(doc, `Prematuridade ou necessidade especial (cadastro): ${specialRecord}`, y);
  }
  Object.values(DNP_ENTRY_TYPES).forEach(config => {
    const blocks = child.dnp[config.key]
      .filter(item => dnpEntryForChild(item, child))
      .map(item => dnpEntryPdfText(item, config))
      .filter(Boolean);
    if (!blocks.length) return;
    y = addSection(doc, config.pdfTitle, y, [98, 114, 138]);
    blocks.forEach(block => {
      y = addDnpMultiline(doc, block, y);
    });
  });
  DNP_CATALOG.stages.forEach(stage => {
    const counts = dnpCountStage(child, stage.id);
    const recurring = child.dnp.recurring[stage.id];
    const answered = dnpMilestonesByStage(stage.id).filter(item => child.dnp.answers[item.id]?.status);
    if (!counts.answered && !recurring) return;
    y = addSection(doc, `Etapa ${stage.label}`, y, [98, 114, 138]);
    y = addParagraph(doc, `Respostas: ${counts.does} já faz; ${counts.starting} começando; ${counts.not_yet} ainda não faz; ${counts.unknown} sem oportunidade de observar. Sem percentual ou classificação.`, y);
    answered.forEach(item => {
      const answer = child.dnp.answers[item.id];
      y = addParagraph(doc, `• ${item.text} — ${DNP_CATALOG.statuses[answer.status]?.label || answer.status}${answer.note ? `. ${answer.note}` : ''}`, y);
    });
    if (recurring) {
      y = addParagraph(doc, `Fazem juntos: ${recurring.together || '-'}. Gosta de: ${recurring.likes || '-'}. Preocupação: ${recurring.concernHas || '-'}. Deixou de fazer: ${recurring.lostSkill || '-'}.`, y);
    }
  });
  return y;
}

if (typeof window !== 'undefined') {
  window.DNP = {
    normalize: normalizeDnpState,
    render: renderDnp,
    init: initDnp,
    hydrateFiles: hydrateDnpFiles,
    deleteFiles: deleteDnpFiles,
    collectFiles: dnpCollectFileRefs,
    addToPdf: addDnpToChildPdf,
    countStage: dnpCountStage,
    referenceStage: dnpReferenceStage
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { dnpCountStage, dnpReferenceStage, dnpIsAlertStatus, dnpAnswersEqual, normalizeDnpState, emptyDnpState };
}
