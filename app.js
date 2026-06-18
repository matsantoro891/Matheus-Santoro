const STORAGE_KEY = 'crescer-juntos-v3';
const EXAM_DB_NAME = 'crescer-juntos-exam-files';
const EXAM_DB_VERSION = 1;
const EXAM_STORE_NAME = 'attachments';
const DEFAULT_CATEGORIES = ['Peso', 'Altura', 'Desenvolvimento motor', 'Categoria personalizada'];
const THEME_STAGES = ['bebe', 'primeira-infancia', 'infancia', 'pre-adolescencia', 'adolescencia'];
const THEME_GENDERS = ['masculino', 'feminino'];
const THEME_STAGE_LABELS = {
  bebe: 'Bebê',
  'primeira-infancia': 'Primeira infância',
  infancia: 'Infância',
  'pre-adolescencia': 'Pré-adolescência',
  adolescencia: 'Adolescência'
};
const THEME_GENDER_LABELS = { masculino: 'Masculino', feminino: 'Feminino' };
const THEME_IMAGES = {
  masculino: {
    bebe: 'themes/masculino/bebe.png',
    primeiraInfancia: 'themes/masculino/primeira-infancia.png',
    infancia: 'themes/masculino/infancia.png',
    preAdolescencia: 'themes/masculino/pre-adolescencia.png',
    adolescencia: 'themes/masculino/adolescencia.png'
  },
  feminino: {
    bebe: 'themes/feminino/bebe.png',
    primeiraInfancia: 'themes/feminino/primeira-infancia.png',
    infancia: 'themes/feminino/infancia.png',
    preAdolescencia: 'themes/feminino/pre-adolescencia.png',
    adolescencia: 'themes/feminino/adolescencia.png'
  }
};
const GROWTH_PERCENTILES = [
  { label: 'P3', z: -1.880793608 },
  { label: 'P15', z: -1.036433389 },
  { label: 'P50', z: 0 },
  { label: 'P85', z: 1.036433389 },
  { label: 'P97', z: 1.880793608 }
];

let state = loadState();
let memoryView = 'grid';
let activeAlbumFilter = 'all';
let toastTimer = null;
let themeLoadToken = 0;
const runtimeObjectUrls = new Set();

function uid() {
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function emptyChild() {
  return {
    id: uid(),
    nome: '', sobrenome: '', nascimento: '', sexo: '', tipoSanguineo: '',
    problemas: '', alergias: '', mae: '', telefoneMae: '', pai: '', telefonePai: '',
    emergenciaNome: '', emergenciaTelefone: '', pediatraNome: '', pediatraTelefone: '', pediatraEmail: '', clinicaPediatra: '',
    observacoes: '', miniBio: '', profilePhoto: '',
    themeMode: 'auto', themeGender: 'masculino', themeStage: 'bebe',
    medications: [], exams: [], medicalFiles: [], memories: [], albums: [], events: [], milestones: []
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (error) {
    console.warn(error);
  }
  const child = emptyChild();
  return { activeChildId: child.id, children: [child], settings: {} };
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepareStateForLocalStorage(state)));
  } catch (error) {
    showToast('Não foi possível salvar. O navegador pode estar sem espaço para os dados.');
    console.error(error);
  }
}

function prepareStateForLocalStorage(value) {
  if (Array.isArray(value)) return value.map(prepareStateForLocalStorage);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, childValue] of Object.entries(value)) {
    if ((key === 'dataUrl' || key === 'thumbnail') && typeof childValue === 'string' && childValue.startsWith('blob:')) continue;
    if (key === 'blob' || key === 'thumbnailBlob') continue;
    result[key] = prepareStateForLocalStorage(childValue);
  }
  return result;
}

function currentChild() {
  let child = state.children.find(c => c.id === state.activeChildId);
  if (!child) {
    child = state.children[0] || emptyChild();
    if (!state.children.length) state.children.push(child);
    state.activeChildId = child.id;
  }
  normalizeChild(child);
  return child;
}

function normalizeChild(child) {
  child.medications ||= [];
  child.exams ||= [];
  child.medicalFiles ||= [];
  child.memories ||= [];
  child.albums ||= [];
  child.events ||= [];
  child.milestones ||= [];
  child.profilePhoto ||= '';
  child.miniBio ||= '';
  if (!['auto', 'manual', 'default'].includes(child.themeMode)) child.themeMode = 'auto';
  if (!THEME_GENDERS.includes(child.themeGender)) child.themeGender = 'masculino';
  if (!THEME_STAGES.includes(child.themeStage)) child.themeStage = 'bebe';
  child.memories.forEach(memory => {
    if (!Array.isArray(memory.files)) memory.files = memory.file ? [memory.file] : [];
    memory.files = memory.files.filter(Boolean).slice(0, 5).map((asset, index) => ({
      ...asset,
      id: asset.id || uid(),
      name: asset.name || `anexo-${index + 1}`,
      type: asset.type || 'application/octet-stream',
      size: Number(asset.size || 0),
      dataUrl: asset.dataUrl || asset.data || '',
      thumbnail: asset.thumbnail || '',
      createdAt: asset.createdAt || new Date().toISOString()
    }));
  });
}

function $(id) { return document.getElementById(id); }
function qsa(selector, root = document) { return [...root.querySelectorAll(selector)]; }

function calculateAgeText(dateString) {
  if (!dateString) return 'Cadastre a criança para calcular a idade.';
  const birth = new Date(dateString + 'T12:00:00');
  if (Number.isNaN(birth.getTime())) return 'Idade não disponível.';
  const now = new Date();
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
  const parts = [];
  if (years > 0) parts.push(`${years} ano${years > 1 ? 's' : ''}`);
  if (months > 0) parts.push(`${months} ${months === 1 ? 'mês' : 'meses'}`);
  if (days >= 0 && (years === 0 || parts.length < 2)) parts.push(`${days} dia${days === 1 ? '' : 's'}`);
  return parts.slice(0, 3).join(', ');
}

function ageYearsFromBirth(dateString) {
  if (!dateString) return null;
  const birth = new Date(dateString + 'T12:00:00');
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years -= 1;
  return years;
}

function themeStageByAge(dateString) {
  const years = ageYearsFromBirth(dateString);
  if (years == null || years < 0) return null;
  if (years <= 2) return 'bebe';
  if (years <= 5) return 'primeira-infancia';
  if (years <= 9) return 'infancia';
  if (years <= 12) return 'pre-adolescencia';
  if (years <= 17) return 'adolescencia';
  return 'adolescencia';
}

function themeGenderFromChild(child) {
  const sex = String(child.sexo || '').trim().toLowerCase();
  if (['m', 'male', 'masculino'].includes(sex) || sex.includes('mascul')) return 'masculino';
  if (['f', 'female', 'feminino'].includes(sex) || sex.includes('femin')) return 'feminino';
  return null;
}

function themeStageImageKey(stage) {
  return {
    bebe: 'bebe',
    'primeira-infancia': 'primeiraInfancia',
    infancia: 'infancia',
    'pre-adolescencia': 'preAdolescencia',
    adolescencia: 'adolescencia'
  }[stage] || '';
}

function themeImagePath(gender, stage) {
  if (!THEME_GENDERS.includes(gender) || !THEME_STAGES.includes(stage)) return '';
  return THEME_IMAGES[gender]?.[themeStageImageKey(stage)] || '';
}

function effectiveTheme() {
  const child = currentChild();
  const mode = child.themeMode || 'auto';
  if (mode === 'default') return { mode, image: '', stage: '', gender: '', reason: 'Tema padrão atual selecionado.' };
  if (mode === 'manual') {
    return {
      mode,
      stage: child.themeStage,
      gender: child.themeGender,
      image: themeImagePath(child.themeGender, child.themeStage),
      reason: `Tema manual: ${THEME_STAGE_LABELS[child.themeStage]} / ${THEME_GENDER_LABELS[child.themeGender]}.`
    };
  }
  const stage = themeStageByAge(child.nascimento);
  const gender = themeGenderFromChild(child);
  if (!stage) return { mode, image: '', stage: '', gender: '', reason: 'A recomendação automática depende da data de nascimento.' };
  if (!gender) return { mode, image: '', stage, gender: '', reason: 'A recomendação automática depende do sexo cadastrado. Você pode escolher manualmente.' };
  return {
    mode,
    stage,
    gender,
    image: themeImagePath(gender, stage),
    reason: `Tema automático: ${THEME_STAGE_LABELS[stage]} / ${THEME_GENDER_LABELS[gender]}.`
  };
}

function applyTheme() {
  const child = currentChild();
  const theme = effectiveTheme();
  const token = ++themeLoadToken;
  document.body.dataset.theme = 'padrao';
  document.body.dataset.themeMode = 'padrao';
  delete document.body.dataset.themeGender;
  delete document.body.dataset.themeStage;
  const heroArt = $('themeHeroArt');
  if (heroArt) {
    heroArt.classList.add('hidden');
    heroArt.removeAttribute('src');
    if (theme.image) {
      const image = new Image();
      image.onload = () => {
        if (token !== themeLoadToken) return;
        heroArt.src = theme.image;
        heroArt.classList.remove('hidden');
        document.body.dataset.themeMode = 'decorativo';
        document.body.dataset.themeGender = theme.gender;
        document.body.dataset.themeStage = theme.stage;
      };
      image.onerror = () => {
        if (token !== themeLoadToken) return;
        console.warn(`Tema não carregado: ${theme.image}`);
      };
      image.src = theme.image;
    }
  }
  const hint = $('themeHint');
  if (hint) hint.textContent = theme.reason;
  ['themeModeSelect', 'themeModeSelectMenu'].forEach(id => { if ($(id)) $(id).value = child.themeMode || 'auto'; });
  ['themeStageSelect', 'themeStageSelectMenu'].forEach(id => { if ($(id)) $(id).value = child.themeStage || 'bebe'; });
  ['themeGenderSelect', 'themeGenderSelectMenu'].forEach(id => { if ($(id)) $(id).value = child.themeGender || 'masculino'; });
  ['manualThemeControls', 'manualThemeControlsMenu'].forEach(id => { if ($(id)) $(id).classList.toggle('hidden', child.themeMode !== 'manual'); });
  updateManualThemePreview();
}

function setThemeMode(value) {
  const child = currentChild();
  child.themeMode = ['auto', 'manual', 'default'].includes(value) ? value : 'auto';
  saveState();
  applyTheme();
}

function updateManualThemePreview(source = 'main') {
  const suffix = source === 'menu' ? 'Menu' : '';
  const stage = $(`themeStageSelect${suffix}`)?.value || currentChild().themeStage || 'bebe';
  const gender = $(`themeGenderSelect${suffix}`)?.value || currentChild().themeGender || 'masculino';
  const preview = $(`themePreview${suffix}`);
  if (preview) {
    const src = themeImagePath(gender, stage);
    preview.src = src;
    preview.onerror = () => console.warn(`Prévia de tema não carregada: ${src}`);
  }
}

function applyManualThemeSelection(source = 'main') {
  const child = currentChild();
  const suffix = source === 'menu' ? 'Menu' : '';
  const stage = $(`themeStageSelect${suffix}`)?.value || child.themeStage || 'bebe';
  const gender = $(`themeGenderSelect${suffix}`)?.value || child.themeGender || 'masculino';
  if (THEME_STAGES.includes(stage)) child.themeStage = stage;
  if (THEME_GENDERS.includes(gender)) child.themeGender = gender;
  child.themeMode = 'manual';
  saveState();
  applyTheme();
}

function switchTab(tabId, opts = {}) {
  const panel = $(tabId);
  if (!panel) return;
  qsa('.tab-panel').forEach(p => p.classList.remove('active'));
  panel.classList.add('active');
  qsa('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
  qsa('.bottom-nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tabTarget === tabId));
  qsa('.home-nav-card').forEach(btn => btn.classList.toggle('active-card', btn.dataset.tabTarget === tabId));
  if (opts.closeMenu) closeSideMenu();
  if (opts.scroll !== false) {
    requestAnimationFrame(() => {
      const target = tabId === 'inicio' ? panel : panel.querySelector('form, .top-actions, .card:not(.hidden), .section-head') || panel;
      const top = Math.max(0, target.getBoundingClientRect().top + window.pageYOffset - 12);
      window.scrollTo({ top, behavior: 'smooth' });
    });
  }
}

function openSideMenu() {
  $('sideMenu')?.classList.remove('hidden');
  $('sideMenuBackdrop')?.classList.remove('hidden');
}
function closeSideMenu() {
  $('sideMenu')?.classList.add('hidden');
  $('sideMenuBackdrop')?.classList.add('hidden');
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function confirmUserChoice(message = 'Deseja realmente excluir este item?') {
  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-dialog-backdrop';
    const card = document.createElement('div');
    card.className = 'confirm-dialog-card';
    const text = document.createElement('p');
    text.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'actions confirm-dialog-actions';
    const yesButton = document.createElement('button');
    yesButton.type = 'button';
    yesButton.className = 'primary';
    yesButton.textContent = 'Sim';
    const noButton = document.createElement('button');
    noButton.type = 'button';
    noButton.className = 'secondary';
    noButton.textContent = 'Não';
    const cleanup = result => {
      document.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      resolve(result);
    };
    const onKeydown = event => {
      if (event.key === 'Escape') cleanup(false);
    };
    yesButton.addEventListener('click', () => cleanup(true), { once: true });
    noButton.addEventListener('click', () => cleanup(false), { once: true });
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) cleanup(false);
    });
    actions.append(noButton, yesButton);
    card.append(text, actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    document.addEventListener('keydown', onKeydown);
    noButton.focus();
  });
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name || 'arquivo',
      type: file.type || 'application/octet-stream',
      size: Number(file.size || 0),
      dataUrl: reader.result
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, encoded] = String(dataUrl || '').split(',');
  const mime = (header.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const binary = atob(encoded || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function createRuntimeObjectUrl(blob) {
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  runtimeObjectUrls.add(url);
  return url;
}

function revokeRuntimeObjectUrls() {
  runtimeObjectUrls.forEach(url => URL.revokeObjectURL(url));
  runtimeObjectUrls.clear();
}

function fileRefUrl(ref) {
  if (!ref) return '';
  if (typeof ref === 'string') return ref;
  return ref.dataUrl || '';
}

function fileRefThumbnail(ref) {
  return ref && typeof ref === 'object' ? (ref.thumbnail || '') : '';
}

function fileExtension(file = {}) {
  return String(file.name || '').split('.').pop()?.toLowerCase() || '';
}

function isImageFile(file) {
  const type = String(file?.type || '').toLowerCase();
  const ext = fileExtension(file);
  return type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext);
}

function isPdfFile(file) {
  const type = String(file?.type || '').toLowerCase();
  return type === 'application/pdf' || fileExtension(file) === 'pdf';
}

function fileTypeLabel(file) {
  if (isPdfFile(file)) return 'PDF';
  if (isImageFile(file)) return 'Imagem';
  return (fileExtension(file) || file?.type || 'Arquivo').toUpperCase();
}

function openExamDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB não disponível'));
    const request = indexedDB.open(EXAM_DB_NAME, EXAM_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EXAM_STORE_NAME)) db.createObjectStore(EXAM_STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir IndexedDB'));
  });
}

async function putExamAttachmentRecord(record) {
  const db = await openExamDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(EXAM_STORE_NAME, 'readwrite');
    transaction.objectStore(EXAM_STORE_NAME).put(record);
    transaction.oncomplete = () => { db.close(); resolve(record); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Falha ao salvar arquivo')); };
  });
}

async function getExamAttachmentRecord(id) {
  if (!id) return null;
  const db = await openExamDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(EXAM_STORE_NAME, 'readonly');
    const request = transaction.objectStore(EXAM_STORE_NAME).get(id);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error || new Error('Falha ao recuperar arquivo')); };
  });
}

async function deleteExamAttachmentRecord(id) {
  if (!id || !('indexedDB' in window)) return;
  const db = await openExamDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(EXAM_STORE_NAME, 'readwrite');
    transaction.objectStore(EXAM_STORE_NAME).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Falha ao excluir arquivo')); };
  });
}

async function storeLocalFile(file, existingId = '', extra = {}) {
  if (!file) return null;
  const id = existingId || extra.id || uid();
  const blob = file instanceof Blob ? file : new Blob([file], { type: extra.type || 'application/octet-stream' });
  const name = extra.name || file.name || 'arquivo';
  const type = extra.type || file.type || blob.type || 'application/octet-stream';
  let thumbnailBlob = extra.thumbnailBlob || null;
  if (!thumbnailBlob && extra.thumbnailDataUrl && String(extra.thumbnailDataUrl).startsWith('data:')) {
    thumbnailBlob = dataUrlToBlob(extra.thumbnailDataUrl);
  }
  const metadata = {
    ...extra,
    id,
    name,
    type,
    size: Number(extra.size || file.size || blob.size || 0),
    storage: 'indexeddb',
    createdAt: extra.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  delete metadata.dataUrl;
  delete metadata.thumbnail;
  delete metadata.thumbnailDataUrl;
  delete metadata.thumbnailBlob;
  await putExamAttachmentRecord({ ...metadata, blob, thumbnailBlob });
  return {
    ...metadata,
    dataUrl: createRuntimeObjectUrl(blob),
    thumbnail: thumbnailBlob ? createRuntimeObjectUrl(thumbnailBlob) : ''
  };
}

async function hydrateLocalFileRef(ref, context = {}) {
  if (!ref) return ref;
  if (typeof ref === 'string') {
    if (!ref.startsWith('data:')) return ref;
    const blob = dataUrlToBlob(ref);
    const file = new File([blob], context.name || 'arquivo', { type: blob.type || context.type || 'application/octet-stream' });
    return storeLocalFile(file, context.id || '', context);
  }
  if (ref.storage === 'indexeddb' && ref.id) {
    const record = await getExamAttachmentRecord(ref.id).catch(() => null);
    if (!record?.blob) return { ...ref, dataUrl: '', thumbnail: '' };
    return {
      ...ref,
      name: ref.name || record.name || 'arquivo',
      type: ref.type || record.type || record.blob.type || 'application/octet-stream',
      size: Number(ref.size || record.size || record.blob.size || 0),
      dataUrl: createRuntimeObjectUrl(record.blob),
      thumbnail: record.thumbnailBlob ? createRuntimeObjectUrl(record.thumbnailBlob) : ''
    };
  }
  if (ref.dataUrl && String(ref.dataUrl).startsWith('data:')) {
    const blob = dataUrlToBlob(ref.dataUrl);
    const file = new File([blob], ref.name || context.name || 'arquivo', { type: ref.type || blob.type || 'application/octet-stream' });
    return storeLocalFile(file, ref.id || context.id || '', {
      ...context,
      ...ref,
      thumbnailDataUrl: ref.thumbnail || ''
    });
  }
  if (ref.dataUrl && String(ref.dataUrl).startsWith('blob:')) return ref;
  return ref;
}

async function hydrateAllLocalFiles(targetState = state) {
  revokeRuntimeObjectUrls();
  let changed = false;
  for (const child of targetState.children || []) {
    normalizeChild(child);
    if (child.profilePhoto) {
      const before = child.profilePhoto;
      child.profilePhoto = await hydrateLocalFileRef(child.profilePhoto, { kind: 'profile-photo', childId: child.id, name: 'foto-perfil' });
      changed ||= child.profilePhoto !== before;
    }
    for (const exam of child.exams || []) {
      if (exam.file) exam.file = await hydrateLocalFileRef(exam.file, { kind: 'exam', childId: child.id, parentId: exam.id });
    }
    for (const item of child.medicalFiles || []) {
      if (item.file) item.file = await hydrateLocalFileRef(item.file, { kind: 'medical-file', childId: child.id, parentId: item.id });
    }
    for (const memory of child.memories || []) {
      const hydrated = [];
      for (const asset of memory.files || []) hydrated.push(await hydrateLocalFileRef(asset, { kind: 'memory', childId: child.id, parentId: memory.id }));
      memory.files = hydrated.filter(Boolean);
    }
    for (const milestone of child.milestones || []) {
      if (milestone.photo) milestone.photo = await hydrateLocalFileRef(milestone.photo, { kind: 'milestone', childId: child.id, parentId: milestone.id, name: 'foto-evolucao' });
    }
  }
  return changed;
}

async function storeExamAttachment(file, existingId = '', extra = {}) {
  return storeLocalFile(file, existingId, { kind: 'exam', ...extra });
}

async function getExamAttachmentBlob(fileMeta) {
  return getPersistentAssetBlob(fileMeta);
}

async function getPersistentAssetBlob(ref) {
  if (!ref) return null;
  if (ref instanceof Blob || ref instanceof File) return ref;
  if (typeof ref === 'string') {
    if (ref.startsWith('data:')) return dataUrlToBlob(ref);
    if (ref.startsWith('blob:')) {
      try { return await (await fetch(ref)).blob(); } catch { return null; }
    }
    return null;
  }
  if (ref.id) {
    const record = await getExamAttachmentRecord(ref.id).catch(() => null);
    if (record) {
      if (record.blob instanceof Blob) return record.blob;
      if (record.blob instanceof ArrayBuffer) {
        return new Blob([record.blob], { type: record.type || ref.type || 'application/octet-stream' });
      }
      if (record.dataUrl && String(record.dataUrl).startsWith('data:')) return dataUrlToBlob(record.dataUrl);
    }
  }
  if (ref.dataUrl) {
    const url = String(ref.dataUrl);
    if (url.startsWith('data:')) return dataUrlToBlob(url);
    if (url.startsWith('blob:')) {
      try { return await (await fetch(url)).blob(); } catch { return null; }
    }
  }
  if (ref.base64) {
    const mime = ref.type || 'image/jpeg';
    return dataUrlToBlob(`data:${mime};base64,${ref.base64}`);
  }
  return null;
}

async function resolvePersistentAssetDataUrl(ref) {
  const blob = await getPersistentAssetBlob(ref);
  if (blob) return blobToDataUrl(blob);
  if (ref && typeof ref === 'object' && ref.dataUrl && String(ref.dataUrl).startsWith('data:')) return ref.dataUrl;
  if (typeof ref === 'string' && ref.startsWith('data:')) return ref;
  return null;
}

let memoryViewerImageLoadToken = 0;

function preparePersistentImageElement(container, asset, loadToken) {
  container.innerHTML = '';
  const loadingMessage = document.createElement('p');
  loadingMessage.className = 'memory-photo-loading';
  loadingMessage.textContent = 'Carregando imagem...';
  const modalImageContainer = document.createElement('div');
  modalImageContainer.className = 'memory-photo-image-wrap';
  container.appendChild(loadingMessage);
  container.appendChild(modalImageContainer);

  resolvePersistentAssetDataUrl(asset).then(imageDataURL => {
    if (loadToken !== memoryViewerImageLoadToken) return;
    if (!imageDataURL) {
      loadingMessage.textContent = 'Não foi possível carregar esta imagem.';
      return;
    }
    const img = document.createElement('img');
    img.alt = asset.name || 'Foto da memória';
    img.onload = () => {
      if (loadToken !== memoryViewerImageLoadToken) return;
      loadingMessage.remove();
      img.style.display = 'block';
      img.style.opacity = '1';
      img.style.visibility = 'visible';
    };
    img.onerror = () => {
      if (loadToken !== memoryViewerImageLoadToken) return;
      loadingMessage.textContent = 'Não foi possível carregar esta imagem.';
    };
    modalImageContainer.appendChild(img);
    img.src = imageDataURL;
  }).catch(() => {
    if (loadToken !== memoryViewerImageLoadToken) return;
    loadingMessage.textContent = 'Não foi possível carregar esta imagem.';
  });
}

function openPersistentPhotoViewer(container, asset) {
  memoryViewerImageLoadToken += 1;
  const loadToken = memoryViewerImageLoadToken;
  container.className = 'memory-carousel-stage memory-photo-viewer-content';
  preparePersistentImageElement(container, asset, loadToken);
}

async function migrateLegacyExamAttachments(targetState = state) {
  return hydrateAllLocalFiles(targetState);
}

async function deleteLocalFileRef(ref) {
  if (ref && typeof ref === 'object' && ref.id) await deleteExamAttachmentRecord(ref.id).catch(console.warn);
}

async function deleteFilesForItem(collection, item) {
  if (!item) return;
  if (collection === 'medicalFiles') await deleteLocalFileRef(item.file);
  if (collection === 'memories') {
    for (const asset of item.files || []) await deleteLocalFileRef(asset);
  }
  if (collection === 'milestones') await deleteLocalFileRef(item.photo);
}

async function deleteFilesForChild(child) {
  if (!child) return;
  await deleteLocalFileRef(child.profilePhoto);
  for (const exam of child.exams || []) await deleteLocalFileRef(exam.file);
  for (const item of child.medicalFiles || []) await deleteLocalFileRef(item.file);
  for (const memory of child.memories || []) for (const asset of memory.files || []) await deleteLocalFileRef(asset);
  for (const milestone of child.milestones || []) await deleteLocalFileRef(milestone.photo);
}

async function fileToMemoryAsset(file, existingId = '', extra = {}) {
  if (!file) return null;
  let thumbnailBlob = null;
  if ((file.type || '').startsWith('video/')) {
    const temporaryUrl = createRuntimeObjectUrl(file);
    const thumbnailDataUrl = await createVideoThumbnail(temporaryUrl).catch(() => '');
    if (thumbnailDataUrl) thumbnailBlob = dataUrlToBlob(thumbnailDataUrl);
  }
  return storeLocalFile(file, existingId, { kind: 'memory', ...extra, thumbnailBlob });
}

function createVideoThumbnail(dataUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const timer = setTimeout(() => { cleanup(); reject(new Error('Tempo excedido ao gerar capa do vídeo.')); }, 5000);
    const cleanup = () => {
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
    };
    const capture = () => {
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0, width, height);
        const thumbnail = canvas.toDataURL('image/jpeg', 0.86);
        cleanup();
        resolve(thumbnail);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.addEventListener('loadeddata', () => {
      if (video.duration && video.duration > 0.2) {
        video.currentTime = 0.1;
      } else {
        capture();
      }
    }, { once: true });
    video.addEventListener('seeked', capture, { once: true });
    video.addEventListener('error', () => { cleanup(); reject(new Error('Não foi possível gerar capa do vídeo.')); }, { once: true });
    video.src = dataUrl;
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function normalizeImageForPdf(dataUrl) {
  try {
    const img = await loadImageElement(dataUrl);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const context = canvas.getContext('2d');
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (error) {
    console.warn('Não foi possível normalizar a orientação da imagem.', error);
    return dataUrl;
  }
}

function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(console.warn);
  }
}

function initTabs() {
  qsa('.tab-btn').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
  qsa('[data-tab-target]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tabTarget)));
}

function renderChildSelect() {
  const optionHtml = state.children.map(child => {
    normalizeChild(child);
    const label = child.nome ? `${child.nome} ${child.sobrenome || ''}`.trim() : 'Criança sem nome';
    return `<option value="${child.id}" ${child.id === state.activeChildId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
  ['childSelect', 'drawerChildSelect', 'drawerChildSelectMenu'].forEach(id => {
    const select = $(id);
    if (select) select.innerHTML = optionHtml;
  });
}

function setImagePreview(container, fileRef, fallback = 'Foto') {
  const dataUrl = fileRefUrl(fileRef);
  container.classList.toggle('placeholder', !dataUrl);
  container.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="Foto da criança">` : fallback;
}

function fillChildForm() {
  const child = currentChild();
  const form = $('childForm');
  Object.keys(child).forEach(key => {
    if (form.elements[key] && key !== 'profilePhoto') form.elements[key].value = child[key] || '';
  });
  setImagePreview($('profilePreview'), child.profilePhoto, 'Foto');
}

function renderHome() {
  const child = currentChild();
  setImagePreview($('homeProfilePhoto'), child.profilePhoto, 'Foto');
  $('homeChildName').textContent = child.nome ? `${child.nome} ${child.sobrenome || ''}`.trim() : 'Criança sem nome';
  $('homeChildAge').textContent = calculateAgeText(child.nascimento);
  $('homeMiniBio').textContent = child.miniBio || 'Mini bio ainda não preenchida.';
  const badges = [];
  if (child.tipoSanguineo) badges.push(`Tipo sanguíneo: ${child.tipoSanguineo}`);
  if (child.alergias) badges.push('Alergias registradas');
  if (child.problemas) badges.push('Saúde registrada');
  badges.push(`${child.memories.length} memórias`);
  badges.push(`${child.events.length} eventos`);
  badges.push(`${child.milestones.length} registros`);
  $('homeBadges').innerHTML = badges.map(b => `<span class="badge">${escapeHtml(b)}</span>`).join('');
  applyTheme();
}

function renderMedications() {
  const child = currentChild();
  $('medList').innerHTML = child.medications.length ? child.medications.map(m => `
    <div class="item">
      <div class="item-top"><strong>${escapeHtml(m.nome)}</strong><button class="danger" onclick="removeItem('medications','${m.id}')">Excluir</button></div>
      <p><b>Dose:</b> ${escapeHtml(m.dose || '-')} • <b>Frequência:</b> ${escapeHtml(m.frequencia || '-')} • <b>Horário:</b> ${escapeHtml(m.horario || '-')}</p>
      <p><b>Início:</b> ${formatDate(m.inicio)} • <b>Término:</b> ${formatDate(m.termino)}</p>
      ${m.observacoes ? `<p>${escapeHtml(m.observacoes)}</p>` : ''}
    </div>
  `).join('') : '<p class="muted">Nenhuma medicação cadastrada.</p>';
}

async function renderExams() {
  const child = currentChild();
  const list = $('examList');
  if (!list) return;
  if (!child.exams.length) {
    list.innerHTML = '<p class="muted">Nenhum exame cadastrado.</p>';
    return;
  }
  list.innerHTML = child.exams.map(e => {
    const files = examAttachments(e);
    const fileInfo = files.length
      ? `<div class="exam-attachment-list">${files.map(file => renderExamAttachmentCard(e.id, file)).join('')}</div>`
      : '<small>Sem anexo</small>';
    const fileActions = files.length ? `
      <div class="actions inline-actions">
        <button type="button" class="secondary" onclick="viewExamAttachment('${e.id}')">Visualizar</button>
        <button type="button" class="secondary" onclick="downloadExamAttachment('${e.id}')">Baixar</button>
        <button type="button" class="secondary" onclick="replaceExamAttachment('${e.id}')">Substituir anexo</button>
      </div>` : `
      <div class="actions inline-actions">
        <button type="button" class="secondary" onclick="replaceExamAttachment('${e.id}')">Adicionar anexo</button>
      </div>`;
    return `
      <div class="item">
        <div class="item-top">
          <strong>${escapeHtml(e.nome)}</strong>
          <div class="actions inline-actions">
            <button type="button" class="secondary" onclick="editExam('${e.id}')">Editar</button>
            <button type="button" class="danger" onclick="removeExam('${e.id}')">Excluir</button>
          </div>
        </div>
        <small>${formatDate(e.data)}</small>
        ${e.descricao ? `<p>${escapeHtml(e.descricao)}</p>` : ''}
        ${fileInfo}
        ${fileActions}
      </div>`;
  }).join('');
}

function examAttachments(exam) {
  if (Array.isArray(exam?.files)) return exam.files.filter(Boolean);
  return exam?.file ? [exam.file] : [];
}

function examAttachmentById(exam, fileId = '') {
  const files = examAttachments(exam);
  return fileId ? files.find(file => file.id === fileId) || files[0] : files[0];
}

function renderExamAttachmentCard(examId, file) {
  const name = escapeHtml(file.name || 'Arquivo anexado');
  const meta = `${escapeHtml(fileTypeLabel(file))} • ${escapeHtml(formatFileSize(file.size))}`;
  if (isImageFile(file)) {
    return `
      <button type="button" class="exam-attachment-card" onclick="viewExamAttachment('${examId}','${file.id || ''}')">
        <span class="exam-thumb image-thumb"><img src="${fileRefUrl(file)}" alt="${name}" onerror="this.closest('.exam-thumb').classList.add('thumb-error'); this.remove();" /></span>
        <span class="exam-file-info"><strong>${name}</strong><small>${meta}</small></span>
      </button>`;
  }
  const icon = isPdfFile(file) ? 'PDF' : 'DOC';
  return `
    <button type="button" class="exam-attachment-card" onclick="viewExamAttachment('${examId}','${file.id || ''}')">
      <span class="exam-thumb file-thumb">${escapeHtml(icon)}</span>
      <span class="exam-file-info"><strong>${name}</strong><small>${meta}</small></span>
    </button>`;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return 'tamanho não informado';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

window.viewExamAttachment = async function(examId, fileId = '') {
  const exam = currentChild().exams.find(item => item.id === examId);
  const file = examAttachmentById(exam, fileId);
  if (!file) return showToast('Este exame não possui anexo.');
  if (isImageFile(file)) return openExamImageViewer(file);
  const blob = await getExamAttachmentBlob(file);
  if (!blob) return showToast('Não foi possível recuperar o arquivo.');
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener');
  if (!opened) {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

window.downloadExamAttachment = async function(examId, fileId = '') {
  const exam = currentChild().exams.find(item => item.id === examId);
  const file = examAttachmentById(exam, fileId);
  if (!file) return showToast('Este exame não possui anexo.');
  const blob = await getExamAttachmentBlob(file);
  if (!blob) return showToast('Não foi possível recuperar o arquivo.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name || 'arquivo-do-exame';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};

async function openExamImageViewer(file) {
  const modal = $('examAttachmentModal');
  const image = $('examAttachmentViewerImage');
  const message = $('examAttachmentViewerMessage');
  const download = $('downloadExamAttachmentFromViewer');
  if (!modal || !image || !message) return;
  modal.classList.remove('hidden');
  image.classList.add('hidden');
  image.removeAttribute('src');
  image.alt = file.name || 'Imagem do exame';
  message.textContent = 'Carregando anexo...';
  if (download) download.onclick = () => downloadExamAttachmentByFile(file);
  try {
    const dataUrl = await resolvePersistentAssetDataUrl(file);
    if (!dataUrl) throw new Error('Anexo indisponível');
    image.onload = () => {
      message.textContent = '';
      image.classList.remove('hidden');
    };
    image.onerror = () => {
      image.classList.add('hidden');
      message.textContent = 'Não foi possível carregar este anexo.';
    };
    image.src = dataUrl;
  } catch (error) {
    console.warn(error);
    message.textContent = 'Não foi possível carregar este anexo.';
  }
}

async function downloadExamAttachmentByFile(file) {
  const blob = await getExamAttachmentBlob(file);
  if (!blob) return showToast('Não foi possível recuperar o arquivo.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name || 'arquivo-do-exame';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function closeExamAttachmentModal() {
  const image = $('examAttachmentViewerImage');
  if (image) {
    image.removeAttribute('src');
    image.classList.add('hidden');
  }
  $('examAttachmentModal')?.classList.add('hidden');
}

window.editExam = function(examId) {
  const exam = currentChild().exams.find(item => item.id === examId);
  if (!exam) return;
  const name = prompt('Nome do exame:', exam.nome || '');
  if (name === null) return;
  const date = prompt('Data no formato AAAA-MM-DD:', exam.data || '');
  if (date === null) return;
  const description = prompt('Descrição:', exam.descricao || '');
  if (description === null) return;
  exam.nome = name.trim();
  exam.data = date.trim();
  exam.descricao = description.trim();
  saveState();
  renderAll();
  showToast('Exame atualizado.');
};

window.replaceExamAttachment = function(examId) {
  const exam = currentChild().exams.find(item => item.id === examId);
  if (!exam) return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pdf,.jpg,.jpeg,.png,.heic,.doc,.docx,image/*,application/pdf';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const oldFile = exam.file;
    const stored = await storeExamAttachment(file, oldFile?.id || '', { ...(oldFile || {}), childId: currentChild().id, parentId: exam.id });
    exam.file = stored;
    saveState();
    renderAll();
    showToast('Anexo do exame salvo permanentemente.');
  }, { once: true });
  input.click();
};

window.removeExam = async function(examId) {
  const child = currentChild();
  const exam = child.exams.find(item => item.id === examId);
  if (!exam) return;
  if (!await confirmUserChoice('Deseja realmente excluir este exame?')) return;
  if (exam.file?.id && exam.file.storage === 'indexeddb') {
    await deleteExamAttachmentRecord(exam.file.id).catch(console.warn);
  }
  child.exams = child.exams.filter(item => item.id !== examId);
  saveState();
  renderAll();
  showToast('Exame excluído.');
};

function renderMedicalFiles() {
  const child = currentChild();
  const search = ($('medicalFileSearch')?.value || '').trim().toLowerCase();
  const sort = $('medicalFileSort')?.value || 'desc';
  let files = [...child.medicalFiles];
  if (search) {
    files = files.filter(item => `${item.title || ''} ${item.description || ''}`.toLowerCase().includes(search));
  }
  files.sort((a, b) => {
    if (sort === 'title') return (a.title || '').localeCompare(b.title || '');
    return sort === 'asc' ? (a.date || '').localeCompare(b.date || '') : (b.date || '').localeCompare(a.date || '');
  });
  const list = $('medicalFileList');
  if (!list) return;
  list.innerHTML = files.length ? files.map(item => `
    <div class="item">
      <div class="item-top">
        <strong>${escapeHtml(item.title || 'Documento médico')}</strong>
        <div class="actions inline-actions">
          <button class="secondary" onclick="editMedicalFile('${item.id}')">Editar</button>
          <button class="danger" onclick="removeItem('medicalFiles','${item.id}')">Excluir</button>
        </div>
      </div>
      <small>${formatDate(item.date)}</small>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      ${item.file ? `<div class="actions inline-actions"><a class="file-pill" href="${fileRefUrl(item.file)}" target="_blank" rel="noopener">Visualizar</a><a class="file-pill" href="${fileRefUrl(item.file)}" download="${escapeHtml(item.file.name)}">Baixar: ${escapeHtml(item.file.name)}</a></div>` : '<small>Sem arquivo anexado</small>'}
    </div>
  `).join('') : '<p class="muted">Nenhum arquivo médico cadastrado.</p>';
}

window.editMedicalFile = function(id) {
  const item = currentChild().medicalFiles.find(file => file.id === id);
  if (!item) return;
  const title = prompt('Título do documento:', item.title || '');
  if (title === null) return;
  const date = prompt('Data no formato AAAA-MM-DD:', item.date || '');
  if (date === null) return;
  const description = prompt('Descrição / observações:', item.description || '');
  if (description === null) return;
  item.title = title.trim();
  item.date = date.trim();
  item.description = description.trim();
  saveState();
  renderAll();
  showToast('Arquivo médico atualizado.');
};

function populateAlbumSelects() {
  const child = currentChild();
  const options = ['<option value="">Sem álbum</option>'].concat(child.albums.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)).join('');
  $('memoryAlbumSelect').innerHTML = options;
  $('memoryPdfAlbum').innerHTML = child.albums.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('') || '<option value="">Nenhum álbum</option>';
}

function renderAlbums() {
  const child = currentChild();
  const buttons = [`<button class="album-chip ${activeAlbumFilter === 'all' ? 'active' : ''}" onclick="setAlbumFilter('all')">Todas</button>`,
    `<button class="album-chip ${activeAlbumFilter === 'none' ? 'active' : ''}" onclick="setAlbumFilter('none')">Sem álbum</button>`]
    .concat(child.albums.map(a => `<button class="album-chip ${activeAlbumFilter === a.id ? 'active' : ''}" onclick="setAlbumFilter('${a.id}')">${escapeHtml(a.name)}</button>`));
  $('albumsRow').innerHTML = buttons.join('');
}

window.setAlbumFilter = function(albumId) {
  activeAlbumFilter = albumId;
  renderAlbums();
  renderMemories();
};

function isImage(file) { return file && file.type && file.type.startsWith('image/'); }
function isVideo(file) { return file && file.type && file.type.startsWith('video/'); }
function isDocumentAsset(file) { return file && !isImage(file) && !isVideo(file); }
function memoryAssets(memory) { return Array.isArray(memory.files) ? memory.files : (memory.file ? [memory.file] : []); }
function firstAsset(memory) { return memoryAssets(memory)[0] || null; }
function firstImageAsset(memory) { return memoryAssets(memory).find(isImage) || null; }
function getAssetIcon(asset) {
  if (isImage(asset)) return 'Foto';
  if (isVideo(asset)) return 'Vídeo';
  const ext = (asset?.name || '').split('.').pop()?.toUpperCase() || 'Arquivo';
  return ext;
}
function triggerDownload(dataUrl, filename = 'arquivo') {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
async function shareAsset(asset) {
  if (!asset) return;
  try {
    const blob = await (await fetch(asset.dataUrl)).blob();
    const file = new File([blob], asset.name || 'arquivo', { type: asset.type || blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: asset.name || 'Arquivo Crescer Juntos' });
    } else if (navigator.share) {
      await navigator.share({ title: asset.name || 'Arquivo Crescer Juntos', text: 'Arquivo salvo no Crescer Juntos.' });
    } else {
      triggerDownload(asset.dataUrl, asset.name || 'arquivo');
    }
  } catch (error) {
    console.warn(error);
    triggerDownload(asset.dataUrl, asset.name || 'arquivo');
  }
}

function renderMemories() {
  const child = currentChild();
  let memories = [...child.memories].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (activeAlbumFilter === 'none') memories = memories.filter(m => !m.albumId);
  if (activeAlbumFilter !== 'all' && activeAlbumFilter !== 'none') memories = memories.filter(m => m.albumId === activeAlbumFilter);
  const list = $('memoryList');
  list.className = memoryView === 'list' ? 'memory-grid list-view' : 'memory-grid';
  if (!memories.length) {
    list.innerHTML = '<p class="muted">Nenhuma memória cadastrada nesse filtro.</p>';
    return;
  }
  list.innerHTML = memories.map(m => {
    const album = child.albums.find(a => a.id === m.albumId);
    const assets = memoryAssets(m);
    const cover = firstAsset(m);
    let media = `<div class="memory-media" onclick="openMemoryViewer('${m.id}',0)">Sem foto</div>`;
    if (cover) {
      if (isImage(cover)) media = `<div class="memory-media" onclick="openMemoryViewer('${m.id}',0)"><img src="${cover.dataUrl}" alt="${escapeHtml(m.title || 'Memória')}"></div>`;
      else if (isVideo(cover)) {
        const videoCover = cover.thumbnail
          ? `<img class="video-thumb" src="${cover.thumbnail}" alt="Capa do vídeo ${escapeHtml(m.title || 'Memória')}">`
          : `<video src="${cover.dataUrl}" muted playsinline preload="metadata"></video>`;
        media = `<div class="memory-media" onclick="openMemoryViewer('${m.id}',0)">${videoCover}<span class="play-badge">▶ vídeo</span></div>`;
      } else media = `<div class="memory-media" onclick="openMemoryViewer('${m.id}',0)">${escapeHtml(getAssetIcon(cover))}</div>`;
    }
    const multiBadge = assets.length > 1 ? `<span class="multi-badge">▢▢ ${assets.length}</span>` : '';
    return `
      <article class="memory-card">
        <div class="memory-media-wrap">
          ${media}
          ${multiBadge}
          ${m.favorite ? '<span class="favorite-badge">♥</span>' : ''}
        </div>
        <div class="memory-content">
          <span class="date">${formatDate(m.date)}</span>
          <h4>${escapeHtml(m.title || 'Memória sem título')}</h4>
          ${album ? `<small>Álbum: ${escapeHtml(album.name)}</small>` : '<small>Sem álbum</small>'}
          ${m.description ? `<p>${escapeHtml(m.description)}</p>` : ''}
          ${assets.length ? `<small>${assets.length} anexo(s)</small>` : '<small>Sem anexos</small>'}
          <div class="memory-actions">
            <button class="secondary" onclick="openMemoryViewer('${m.id}',0)">Abrir</button>
            <button class="secondary" onclick="toggleFavorite('${m.id}')">${m.favorite ? 'Remover favorito' : 'Favoritar'}</button>
            <button class="primary memory-delete-button" onclick="removeItem('memories','${m.id}')">Excluir</button>
          </div>
        </div>
      </article>`;
  }).join('');
}

let activeMemoryViewerId = '';
let activeMemoryAssetIndex = 0;
let memoryViewerPageScrollY = 0;
let memoryViewerScrollLocked = false;
let memoryCarouselScrollTimer = null;

function fillMemoryEditAlbumSelect(selectedAlbumId = '') {
  const child = currentChild();
  const select = $('memoryEditAlbumSelect');
  if (!select) return;
  select.innerHTML = ['<option value="">Sem álbum</option>'].concat(child.albums.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`)).join('');
  select.value = selectedAlbumId || '';
}

window.openMemoryViewer = function(memoryId, index = 0) {
  const memory = currentChild().memories.find(m => m.id === memoryId);
  if (!memory) return;
  activeMemoryViewerId = memoryId;
  activeMemoryAssetIndex = Math.max(0, Math.min(index, memoryAssets(memory).length - 1));
  fillMemoryEditAlbumSelect(memory.albumId);
  const form = $('memoryEditForm');
  form.elements.memoryId.value = memory.id;
  form.elements.date.value = memory.date || '';
  form.elements.title.value = memory.title || '';
  form.elements.description.value = memory.description || '';
  form.elements.favorite.value = String(!!memory.favorite);
  form.elements.albumId.value = memory.albumId || '';
  lockMemoryViewerBackground();
  $('memoryViewerModal').classList.remove('hidden');
  $('memoryViewerModal').scrollTop = 0;
  renderMemoryViewer();
};

function renderMemoryViewer() {
  const memory = currentChild().memories.find(m => m.id === activeMemoryViewerId);
  if (!memory) return;
  const assets = memoryAssets(memory);
  const asset = assets[activeMemoryAssetIndex];
  const stage = $('memoryCarouselStage');
  if (!asset) {
    stage.className = 'memory-viewer-media';
    stage.innerHTML = '<div class="empty-stage">Sem anexos nesta memória.</div>';
  } else if (isImage(asset)) {
    renderPersistentPhotoCarousel(stage, memory, assets);
  } else if (isVideo(asset)) {
    stage.className = 'memory-viewer-media';
    stage.innerHTML = `<video src="${asset.dataUrl}" controls playsinline poster="${asset.thumbnail || ''}"></video>`;
  } else {
    stage.className = 'memory-viewer-media';
    stage.innerHTML = `<div class="document-stage"><strong>${escapeHtml(getAssetIcon(asset))}</strong><p>${escapeHtml(asset.name || 'Arquivo')}</p><a class="file-pill" href="${asset.dataUrl}" target="_blank" rel="noopener">Visualizar arquivo</a></div>`;
  }
  updateMemoryAssetCounter(memory, assets);
  renderMemoryViewerDetails(memory, assets);
  updateMemoryAssetCounter(memory, assets);
  renderMemoryAttachmentList(memory);
}

function memoryImageEntries(assets) {
  return assets.map((asset, index) => ({ asset, index })).filter(entry => isImage(entry.asset));
}

function renderPersistentPhotoCarousel(stage, memory, assets) {
  const imageEntries = memoryImageEntries(assets);
  const selectedImageIndex = Math.max(0, imageEntries.findIndex(entry => entry.index === activeMemoryAssetIndex));
  memoryViewerImageLoadToken += 1;
  const loadToken = memoryViewerImageLoadToken;
  stage.className = 'memory-viewer-media';
  stage.innerHTML = '<div id="memoryPhotoCarousel" class="memory-photo-carousel" aria-label="Fotos da memória"></div>';
  const carousel = $('memoryPhotoCarousel');
  carousel.addEventListener('scroll', () => {
    clearTimeout(memoryCarouselScrollTimer);
    memoryCarouselScrollTimer = setTimeout(syncMemoryCarouselCounter, 80);
  }, { passive: true });
  imageEntries.forEach(({ asset, index }) => {
    const slide = document.createElement('div');
    slide.className = 'memory-photo-slide';
    slide.dataset.assetIndex = String(index);
    carousel.appendChild(slide);
    preparePersistentImageElement(slide, asset, loadToken);
  });
  requestAnimationFrame(() => {
    scrollMemoryCarouselToImageIndex(selectedImageIndex, false);
    syncMemoryCarouselCounter();
  });
}

function scrollMemoryCarouselToImageIndex(imageIndex, smooth = true) {
  const carousel = $('memoryPhotoCarousel');
  if (!carousel) return;
  const boundedIndex = Math.max(0, Math.min(imageIndex, carousel.children.length - 1));
  const slide = carousel.children[boundedIndex];
  if (!slide) return;
  activeMemoryAssetIndex = Number(slide.dataset.assetIndex || activeMemoryAssetIndex);
  updateMemoryAssetCounter();
  carousel.scrollTo({ left: boundedIndex * carousel.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
}

function syncMemoryCarouselCounter() {
  const carousel = $('memoryPhotoCarousel');
  if (!carousel || !carousel.children.length) return;
  const imageIndex = Math.max(0, Math.min(carousel.children.length - 1, Math.round(carousel.scrollLeft / Math.max(1, carousel.clientWidth))));
  const slide = carousel.children[imageIndex];
  activeMemoryAssetIndex = Number(slide.dataset.assetIndex || activeMemoryAssetIndex);
  updateMemoryAssetCounter();
}

function updateMemoryAssetCounter(memory = currentChild().memories.find(m => m.id === activeMemoryViewerId), assets = memory ? memoryAssets(memory) : []) {
  const counter = $('memoryAssetCounter');
  const detailsCounter = document.querySelector('#memoryViewerDetails .memory-photo-counter');
  if (!counter) return;
  let text = '0 de 0';
  if (!assets.length) {
    counter.textContent = text;
    if (detailsCounter) detailsCounter.textContent = text;
    return;
  }
  if (isImage(assets[activeMemoryAssetIndex])) {
    const imageEntries = memoryImageEntries(assets);
    const imageIndex = imageEntries.findIndex(entry => entry.index === activeMemoryAssetIndex);
    text = `${Math.max(0, imageIndex) + 1} de ${imageEntries.length}`;
    counter.textContent = text;
    if (detailsCounter) detailsCounter.textContent = text;
    return;
  }
  text = `${activeMemoryAssetIndex + 1} de ${assets.length}`;
  counter.textContent = text;
  if (detailsCounter) detailsCounter.textContent = text;
}

function renderMemoryViewerDetails(memory, assets) {
  const album = currentChild().albums.find(a => a.id === memory.albumId);
  const details = $('memoryViewerDetails');
  if (!details) return;
  details.innerHTML = `
    <div class="memory-photo-counter">0 de 0</div>
    <div class="memory-date">${formatDate(memory.date)}</div>
    <h2>${escapeHtml(memory.title || 'Memória sem título')}</h2>
    ${memory.description ? `<div class="memory-description">${escapeHtml(memory.description)}</div>` : '<div class="memory-description muted">Sem descrição.</div>'}
    ${album ? `<div class="memory-album">Álbum: ${escapeHtml(album.name)}</div>` : ''}
    <div class="memory-viewer-meta">${assets.length ? `${assets.length} anexo(s)` : 'Sem anexos'}${memory.favorite ? ' • Favorita' : ''}</div>
  `;
}

function renderMemoryAttachmentList(memory) {
  const assets = memoryAssets(memory);
  $('memoryAttachmentList').innerHTML = assets.length ? `
    <h4>Anexos</h4>
    ${assets.map((asset, index) => `
      <div class="attachment-item">
        <button type="button" class="attachment-thumb" onclick="openMemoryViewer('${memory.id}',${index})">
          ${isImage(asset) ? `<img src="${asset.dataUrl}" alt="${escapeHtml(asset.name)}">` : isVideo(asset) ? `<img src="${asset.thumbnail || ''}" alt="${escapeHtml(asset.name)}"><span>▶</span>` : `<strong>${escapeHtml(getAssetIcon(asset))}</strong>`}
        </button>
        <div>
          <strong>${escapeHtml(asset.name || 'Anexo')}</strong>
          <small>${asset.createdAt ? new Date(asset.createdAt).toLocaleDateString('pt-BR') : ''}</small>
          <div class="actions inline-actions">
            <button type="button" class="secondary" onclick="openMemoryViewer('${memory.id}',${index})">Visualizar</button>
            <button type="button" class="secondary" onclick="downloadMemoryAsset('${memory.id}','${asset.id}')">Baixar</button>
            <button type="button" class="secondary" onclick="shareMemoryAsset('${memory.id}','${asset.id}')">Compartilhar</button>
            <label class="secondary tiny-file-label">Substituir<input type="file" hidden onchange="replaceMemoryAsset(event,'${memory.id}','${asset.id}')" /></label>
            <button type="button" class="primary memory-delete-button" onclick="deleteMemoryAsset('${memory.id}','${asset.id}')">Excluir</button>
          </div>
        </div>
      </div>`).join('')}
  ` : '<p class="muted">Nenhum anexo nesta memória.</p>';
}

function moveMemoryAsset(delta) {
  const memory = currentChild().memories.find(m => m.id === activeMemoryViewerId);
  if (!memory) return;
  const assets = memoryAssets(memory);
  const carousel = $('memoryPhotoCarousel');
  if (carousel && carousel.children.length) {
    const currentImageIndex = Math.max(0, Math.min(carousel.children.length - 1, Math.round(carousel.scrollLeft / Math.max(1, carousel.clientWidth))));
    scrollMemoryCarouselToImageIndex((currentImageIndex + delta + carousel.children.length) % carousel.children.length);
    return;
  }
  const total = assets.length;
  if (!total) return;
  activeMemoryAssetIndex = (activeMemoryAssetIndex + delta + total) % total;
  renderMemoryViewer();
}

function closeMemoryViewer() {
  memoryViewerImageLoadToken += 1;
  $('memoryViewerModal').classList.add('hidden');
  const stage = $('memoryCarouselStage');
  stage.innerHTML = '';
  stage.className = 'memory-viewer-media';
  $('memoryViewerDetails').innerHTML = '';
  unlockMemoryViewerBackground();
  activeMemoryViewerId = '';
  activeMemoryAssetIndex = 0;
}

function lockMemoryViewerBackground() {
  if (memoryViewerScrollLocked) return;
  memoryViewerPageScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  memoryViewerScrollLocked = true;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${memoryViewerPageScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.classList.add('memory-viewer-open');
}

function unlockMemoryViewerBackground() {
  if (!memoryViewerScrollLocked) return;
  memoryViewerScrollLocked = false;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.body.classList.remove('memory-viewer-open');
  window.scrollTo(0, memoryViewerPageScrollY);
}

async function saveMemoryEdits(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const memory = currentChild().memories.find(m => m.id === form.elements.memoryId.value);
  if (!memory) return;
  memory.date = form.elements.date.value;
  memory.title = form.elements.title.value.trim();
  memory.description = form.elements.description.value.trim();
  memory.albumId = form.elements.albumId.value || '';
  memory.favorite = form.elements.favorite.value === 'true';
  const existing = memoryAssets(memory);
  const availableSlots = Math.max(0, 5 - existing.length);
  const newFiles = Array.from(form.elements.newFiles.files || []).slice(0, availableSlots);
  if (newFiles.length) {
    const assets = (await Promise.all(newFiles.map(file => fileToMemoryAsset(file, '', { childId: currentChild().id, parentId: memory.id })))).filter(Boolean);
    memory.files = existing.concat(assets).slice(0, 5);
  } else {
    memory.files = existing;
  }
  form.elements.newFiles.value = '';
  saveState();
  renderAll();
  renderMemoryViewer();
  showToast('Memória atualizada.');
}

window.downloadMemoryAsset = function(memoryId, assetId) {
  const asset = memoryAssets(currentChild().memories.find(m => m.id === memoryId) || {}).find(a => a.id === assetId);
  if (asset) triggerDownload(asset.dataUrl, asset.name || 'arquivo');
};

window.shareMemoryAsset = async function(memoryId, assetId) {
  const asset = memoryAssets(currentChild().memories.find(m => m.id === memoryId) || {}).find(a => a.id === assetId);
  if (asset) await shareAsset(asset);
};

window.replaceMemoryAsset = async function(event, memoryId, assetId) {
  const file = event.target.files[0];
  if (!file) return;
  const memory = currentChild().memories.find(m => m.id === memoryId);
  if (!memory) return;
  const assets = memoryAssets(memory);
  const index = assets.findIndex(a => a.id === assetId);
  if (index === -1) return;
  assets[index] = await fileToMemoryAsset(file, assetId, { childId: currentChild().id, parentId: memoryId });
  memory.files = assets;
  saveState();
  renderAll();
  renderMemoryViewer();
  showToast('Anexo substituído.');
};

window.deleteMemoryAsset = async function(memoryId, assetId) {
  const memory = currentChild().memories.find(m => m.id === memoryId);
  if (!memory) return;
  if (!await confirmUserChoice('Deseja realmente excluir este anexo da memória?')) return;
  await deleteExamAttachmentRecord(assetId).catch(console.warn);
  memory.files = memoryAssets(memory).filter(a => a.id !== assetId);
  activeMemoryAssetIndex = Math.max(0, Math.min(activeMemoryAssetIndex, memory.files.length - 1));
  saveState();
  renderAll();
  renderMemoryViewer();
  showToast('Anexo excluído.');
};

function downloadAllCurrentMemoryAssets() {
  const memory = currentChild().memories.find(m => m.id === activeMemoryViewerId);
  if (!memory) return;
  memoryAssets(memory).forEach((asset, index) => {
    setTimeout(() => triggerDownload(asset.dataUrl, asset.name || `anexo-${index + 1}`), index * 300);
  });
  showToast('Downloads iniciados.');
}

window.openVideo = function(memoryId) {
  const memory = currentChild().memories.find(m => m.id === memoryId);
  const index = memory ? memoryAssets(memory).findIndex(isVideo) : -1;
  if (memory && index >= 0) openMemoryViewer(memoryId, index);
};

window.openPhoto = function(memoryId) {
  const memory = currentChild().memories.find(m => m.id === memoryId);
  const index = memory ? memoryAssets(memory).findIndex(isImage) : -1;
  if (memory && index >= 0) openMemoryViewer(memoryId, index);
};

window.toggleFavorite = function(memoryId) {
  const memory = currentChild().memories.find(m => m.id === memoryId);
  if (memory) {
    memory.favorite = !memory.favorite;
    saveState();
    renderAll();
  }
};

function renderManualMemorySelection() {
  const child = currentChild();
  const imageMemories = child.memories.filter(m => memoryAssets(m).some(isImage));
  $('manualMemorySelection').innerHTML = imageMemories.length ? imageMemories.map(m => {
    const cover = firstImageAsset(m);
    return `<label><input type="checkbox" value="${m.id}" checked /> ${formatDate(m.date)} - ${escapeHtml(m.title || m.description || cover?.name || 'Memória')}</label>`;
  }).join('') : '<p>Nenhuma memória com foto cadastrada.</p>';
}

function getSelectedImageMemoriesForPdf() {
  const child = currentChild();
  let memories = child.memories.filter(m => memoryAssets(m).some(isImage));
  const filter = $('memoryPdfFilter').value;
  if (filter === 'manual') {
    const ids = qsa('#manualMemorySelection input:checked').map(input => input.value);
    memories = memories.filter(m => ids.includes(m.id));
  }
  if (filter === 'period') {
    const start = $('memoryPdfStart').value;
    const end = $('memoryPdfEnd').value;
    memories = memories.filter(m => (!start || (m.date || '') >= start) && (!end || (m.date || '') <= end));
  }
  if (filter === 'album') {
    const albumId = $('memoryPdfAlbum').value;
    memories = memories.filter(m => m.albumId === albumId);
  }
  return memories.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

function renderFavorites() {
  const child = currentChild();
  const upcoming = [...child.events].filter(e => !e.date || e.date >= new Date().toISOString().slice(0,10)).sort((a,b) => (a.date || '').localeCompare(b.date || '')).slice(0,2);
  $('favoriteUpcomingEvents').innerHTML = upcoming.length ? upcoming.map(e => `<div class="item"><strong>${escapeHtml(e.title || 'Evento')}</strong><p>${escapeHtml(e.type || 'Evento')} — ${formatDate(e.date)}</p></div>`).join('') : '<p class="muted">Nenhum próximo evento.</p>';
  const recentMilestones = [...child.milestones].sort((a,b) => (b.date || '').localeCompare(a.date || '')).slice(0,3);
  $('favoriteRecentMilestones').innerHTML = recentMilestones.length ? recentMilestones.map(item => `<div class="item"><strong>${escapeHtml(item.title || item.category)}</strong><p>${formatDate(item.date)}${item.value ? ' — ' + escapeHtml(item.value) : ''}</p></div>`).join('') : '<p class="muted">Nenhum registro recente.</p>';
  const favorites = child.memories.filter(m => m.favorite).sort((a,b) => (b.date || '').localeCompare(a.date || '')).slice(0,6);
  const favWrap = $('favoriteMemories');
  favWrap.className = 'memory-grid list-view';
  favWrap.innerHTML = favorites.length ? favorites.map(m => {
    const asset = firstAsset(m);
    const media = asset ? (isImage(asset) ? `<div class="memory-media"><img src="${asset.dataUrl}" alt="${escapeHtml(m.title || 'Memória')}"></div>` : isVideo(asset) ? `<div class="memory-media"><img src="${asset.thumbnail || ''}" alt="${escapeHtml(m.title || 'Vídeo')}"><span class="play-badge">▶</span></div>` : `<div class="memory-media">${escapeHtml(getAssetIcon(asset))}</div>`) : `<div class="memory-media">Sem mídia</div>`;
    return `<article class="memory-card"><div class="memory-media-wrap">${media}<span class="favorite-badge">♥</span></div><div class="memory-content"><span class="date">${formatDate(m.date)}</span><h4>${escapeHtml(m.title || 'Memória')}</h4>${m.description ? `<p>${escapeHtml(m.description)}</p>` : ''}</div></article>`;
  }).join('') : '<p class="muted">Nenhuma memória favorita cadastrada.</p>';
  const totalFiles = child.memories.reduce((sum, m) => sum + memoryAssets(m).length, 0);
  const stats = [
    ['Memórias', child.memories.length],
    ['Fotos / vídeos', totalFiles],
    ['Dias desde nascimento', child.nascimento ? Math.max(0, Math.floor((Date.now() - new Date(child.nascimento + 'T12:00:00').getTime()) / 86400000)) : '-'],
    ['Eventos', child.events.length]
  ];
  $('favoriteStats').innerHTML = stats.map(([label, value]) => `<div class="stat-card"><strong>${value}</strong><span>${escapeHtml(String(label))}</span></div>`).join('');
}

function renderProfileSettings() {
  applyTheme();
}

function openChildPdfBuilderAndScroll() {
  const builder = $('childPdfBuilder');
  if (!builder) return;
  builder.classList.remove('hidden');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      builder.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    });
  });
}

function renderEvents() {
  const child = currentChild();
  const events = [...child.events].sort((a, b) => `${a.date || ''}${a.time || ''}`.localeCompare(`${b.date || ''}${b.time || ''}`));
  $('eventList').innerHTML = events.length ? events.map(e => `
    <div class="item">
      <div class="item-top"><strong>${escapeHtml(e.title)}</strong><button class="danger" onclick="removeItem('events','${e.id}')">Excluir</button></div>
      <p><b>${escapeHtml(e.type || 'Evento')}</b> • ${formatDate(e.date)} ${e.time ? 'às ' + escapeHtml(e.time) : ''}</p>
      ${e.location ? `<p><b>Local:</b> ${escapeHtml(e.location)}</p>` : ''}
      ${e.description ? `<p>${escapeHtml(e.description)}</p>` : ''}
      <div class="actions"><button class="secondary" onclick="downloadIcs('${e.id}')">Adicionar ao calendário</button></div>
    </div>
  `).join('') : '<p class="muted">Nenhum evento cadastrado.</p>';
}

function childSexKey(child = currentChild()) {
  const sex = String(child.sexo || '').toLowerCase();
  if (sex.includes('femin')) return 'female';
  if (sex.includes('mascul')) return 'male';
  return null;
}

function parseLocaleNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const match = String(value || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : NaN;
}

function formatLocaleNumber(value, decimals = 2) {
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function dateAtMidday(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageDaysAt(child, dateValue) {
  const birth = dateAtMidday(child.nascimento);
  const measured = dateAtMidday(dateValue);
  if (!birth || !measured || measured < birth) return null;
  return Math.max(0, Math.round((measured - birth) / 86400000));
}

function ageMonthsFromDays(days) {
  return days == null ? null : days / 30.4375;
}

function getGrowthLms(metric, sex, ageDays) {
  const source = window.WHO_GROWTH_DATA?.[metric]?.[sex];
  if (!source || ageDays == null || ageDays < 0) return null;
  const under = source.under5;
  const dayIndex = Math.round(ageDays) - under.start;
  if (dayIndex >= 0 && dayIndex < under.values.length) return { lms: under.values[dayIndex], ageUnit: 'day', ageKey: Math.round(ageDays) };
  const month = Math.floor(ageDays / 30.4375);
  const older = source.older;
  const monthIndex = month - older.start;
  if (monthIndex >= 0 && monthIndex < older.values.length) return { lms: older.values[monthIndex], ageUnit: 'month', ageKey: month };
  return null;
}

function lmsValueAtZ(lms, z) {
  if (!lms) return NaN;
  const [L, M, S] = lms;
  if (Math.abs(L) < 1e-9) return M * Math.exp(S * z);
  const base = 1 + L * S * z;
  return base > 0 ? M * Math.pow(base, 1 / L) : NaN;
}

function lmsZScore(value, lms) {
  if (!lms || !Number.isFinite(value) || value <= 0) return NaN;
  const [L, M, S] = lms;
  if (Math.abs(L) < 1e-9) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const erf = sign * (1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

function milestoneMeasurement(item) {
  const numeric = Number.isFinite(Number(item.numericValue)) ? Number(item.numericValue) : parseLocaleNumber(item.value);
  if (!Number.isFinite(numeric)) return NaN;
  if (item.category === 'Altura') {
    if (item.unit === 'cm' || /cm/i.test(String(item.value || '')) || numeric > 3) return numeric;
    return numeric * 100;
  }
  return numeric;
}

function milestonePercentile(item, child = currentChild()) {
  const metric = item.category === 'Peso' ? 'weight' : item.category === 'Altura' ? 'height' : null;
  const sex = childSexKey(child);
  const days = ageDaysAt(child, item.date);
  if (!metric || !sex || days == null) return null;
  const reference = getGrowthLms(metric, sex, days);
  if (!reference) return null;
  const value = milestoneMeasurement(item);
  const z = lmsZScore(value, reference.lms);
  if (!Number.isFinite(z)) return null;
  return { percentile: Math.max(0.1, Math.min(99.9, normalCdf(z) * 100)), z, ageDays: days, ageMonths: ageMonthsFromDays(days) };
}

function percentileLabel(result) {
  if (!result) return '';
  const value = result.percentile;
  if (value < 1) return 'abaixo de P1';
  if (value > 99) return 'acima de P99';
  return `P${Math.round(value)}`;
}

function updateMilestoneFieldBehavior() {
  const form = $('milestoneForm');
  if (!form) return;
  const category = form.elements.category.value;
  const isWeight = category === 'Peso';
  const isHeight = category === 'Altura';
  const isGrowth = isWeight || isHeight;
  $('milestoneCustomCategoryField').classList.toggle('hidden', category !== 'Categoria personalizada');
  $('milestoneTitleField').classList.toggle('hidden', isGrowth);
  const valueInput = $('milestoneValueInput');
  const unit = $('milestoneValueUnit');
  if (isGrowth) {
    valueInput.type = 'number';
    valueInput.step = '0.01';
    valueInput.min = '0';
    valueInput.inputMode = 'decimal';
    valueInput.placeholder = isWeight ? 'Ex.: 12,5' : 'Ex.: 0,82';
    unit.textContent = isWeight ? 'kg' : 'm';
    unit.classList.remove('hidden');
    $('milestoneValueField').firstChild.textContent = isWeight ? 'Peso ' : 'Altura ';
  } else {
    valueInput.type = 'text';
    valueInput.removeAttribute('step');
    valueInput.removeAttribute('min');
    valueInput.placeholder = 'Valor opcional';
    unit.textContent = '';
    unit.classList.add('hidden');
    $('milestoneValueField').firstChild.textContent = 'Valor opcional ';
  }
}

function resetMilestoneForm() {
  const form = $('milestoneForm');
  form.reset();
  form.elements.milestoneId.value = '';
  $('saveMilestoneBtn').textContent = 'Salvar registro';
  $('cancelMilestoneEditBtn').classList.add('hidden');
  updateMilestoneFieldBehavior();
}

function growthChartAgeLimit(metric, child, items) {
  const birth = dateAtMidday(child.nascimento);
  const currentDays = birth ? Math.max(0, Math.round((Date.now() - birth.getTime()) / 86400000)) : 0;
  const itemMonths = items.map(item => ageMonthsFromDays(ageDaysAt(child, item.date))).filter(Number.isFinite);
  const latest = Math.max(ageMonthsFromDays(currentDays) || 0, ...itemMonths, 0);
  const hardMax = metric === 'weight' ? 120 : 228;
  if (latest <= 24) return 24;
  if (latest <= 60) return 60;
  if (latest <= 120) return 120;
  return hardMax;
}

function chartReferencePoint(metric, sex, month, z) {
  const days = Math.round(month * 30.4375);
  const ref = getGrowthLms(metric, sex, days);
  if (!ref) return null;
  const value = lmsValueAtZ(ref.lms, z);
  return Number.isFinite(value) ? (metric === 'height' ? value / 100 : value) : null;
}

function svgPath(points, xScale, yScale) {
  const valid = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!valid.length) return '';
  return valid.map((p, index) => `${index ? 'L' : 'M'} ${xScale(p.x).toFixed(1)} ${yScale(p.y).toFixed(1)}`).join(' ');
}

function growthChartSvgStyle() {
  return `<style>
    .chart-bg{fill:#ffffff;stroke:#e4edf9;stroke-width:1}
    .chart-grid-line{stroke:#dfe8f5;stroke-width:1}
    .chart-grid-line.vertical{stroke-dasharray:3 5}
    .axis-label{fill:#6b7890;font-size:11px;font-family:Inter,Arial,sans-serif}
    .axis-title{fill:#35445e;font-size:12px;font-weight:800;font-family:Inter,Arial,sans-serif}
    .curve-label{fill:#61718d;font-size:10px;font-weight:800;font-family:Inter,Arial,sans-serif}
    .child-growth-point{fill:#ff9e2f;stroke:#ffffff;stroke-width:3;filter:drop-shadow(0 3px 5px rgba(255,158,47,.35))}
    .point-label{fill:#b65f00;font-size:10px;font-weight:900;font-family:Inter,Arial,sans-serif}
  </style>`;
}

function buildGrowthChartView(metric, child = currentChild()) {
  const sex = childSexKey(child);
  if (!child.nascimento || !sex) {
    return {
      html: '<div class="growth-empty">Cadastre a data de nascimento e o sexo da criança para exibir as curvas.</div>',
      statusText: '',
      sourceText: metric === 'weight' ? 'Referência: OMS. Peso por idade disponível até 10 anos.' : 'Referência: OMS. Altura por idade disponível até 19 anos.',
      unavailable: true
    };
  }
  const category = metric === 'weight' ? 'Peso' : 'Altura';
  const items = child.milestones.filter(item => item.category === category).map(item => {
    const days = ageDaysAt(child, item.date);
    return { item, x: ageMonthsFromDays(days), y: metric === 'height' ? milestoneMeasurement(item) / 100 : milestoneMeasurement(item), result: milestonePercentile(item, child) };
  }).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  const maxMonths = growthChartAgeLimit(metric, child, items.map(p => p.item));
  const step = maxMonths <= 24 ? 1 : maxMonths <= 60 ? 2 : maxMonths <= 120 ? 4 : 6;
  const referenceSeries = GROWTH_PERCENTILES.map(percentile => ({
    ...percentile,
    points: Array.from({ length: Math.floor(maxMonths / step) + 1 }, (_, index) => {
      const month = Math.min(maxMonths, index * step);
      return { x: month, y: chartReferencePoint(metric, sex, month, percentile.z) };
    }).filter(point => Number.isFinite(point.y))
  }));
  const allY = referenceSeries.flatMap(series => series.points.map(point => point.y)).concat(items.filter(p => p.x <= maxMonths).map(p => p.y));
  if (!allY.length) {
    return {
      html: '<div class="growth-empty">Referência indisponível para esta idade.</div>',
      statusText: '',
      sourceText: metric === 'weight' ? 'Referência: OMS. Peso por idade disponível até 10 anos.' : 'Referência: OMS. Altura por idade disponível até 19 anos.',
      unavailable: true
    };
  }
  let yMin = Math.min(...allY), yMax = Math.max(...allY);
  const pad = Math.max((yMax - yMin) * 0.09, metric === 'weight' ? 0.5 : 0.03);
  yMin = Math.max(0, yMin - pad); yMax += pad;
  const W = 760, H = 350, left = 58, top = 24, right = 46, bottom = 50;
  const plotW = W - left - right, plotH = H - top - bottom;
  const xScale = value => left + (value / maxMonths) * plotW;
  const yScale = value => top + (1 - (value - yMin) / (yMax - yMin)) * plotH;
  const yTicks = Array.from({ length: 6 }, (_, i) => yMin + (yMax - yMin) * i / 5);
  const xTicks = Array.from({ length: 7 }, (_, i) => maxMonths * i / 6);
  const curveColors = ['#9aa8bd', '#9ec5f8', '#2563b8', '#9ec5f8', '#9aa8bd'];
  const curves = referenceSeries.map((series, index) => `<path d="${svgPath(series.points, xScale, yScale)}" fill="none" stroke="${curveColors[index]}" stroke-width="${series.label === 'P50' ? 2.8 : 1.6}" stroke-dasharray="${series.label === 'P50' ? '' : '5 4'}"/><text x="${W-right+5}" y="${yScale(series.points[series.points.length - 1]?.y || yMin)+4}" class="curve-label">${series.label}</text>`).join('');
  const points = items.filter(point => point.x <= maxMonths).map(point => {
    const label = percentileLabel(point.result) || 'sem percentil';
    return `<g><circle cx="${xScale(point.x)}" cy="${yScale(point.y)}" r="6" class="child-growth-point"><title>${formatDate(point.item.date)} — ${formatLocaleNumber(metric === 'height' ? point.y : point.y, 2)} ${metric === 'weight' ? 'kg' : 'm'} — ${label}</title></circle><text x="${xScale(point.x)+8}" y="${yScale(point.y)-8}" class="point-label">${label}</text></g>`;
  }).join('');
  const gridY = yTicks.map(value => `<line x1="${left}" y1="${yScale(value)}" x2="${W-right}" y2="${yScale(value)}" class="chart-grid-line"/><text x="${left-8}" y="${yScale(value)+4}" text-anchor="end" class="axis-label">${formatLocaleNumber(value, metric === 'weight' ? 1 : 2)}</text>`).join('');
  const gridX = xTicks.map(value => `<line x1="${xScale(value)}" y1="${top}" x2="${xScale(value)}" y2="${H-bottom}" class="chart-grid-line vertical"/><text x="${xScale(value)}" y="${H-bottom+24}" text-anchor="middle" class="axis-label">${value < 24 ? Math.round(value) + 'm' : formatLocaleNumber(value/12,1) + 'a'}</text>`).join('');
  const svgInner = `${growthChartSvgStyle()}<rect x="${left}" y="${top}" width="${plotW}" height="${plotH}" rx="12" class="chart-bg"/>${gridY}${gridX}${curves}${points}<text x="${left}" y="16" class="axis-title">${metric === 'weight' ? 'Peso (kg)' : 'Altura (m)'}</text><text x="${W-right}" y="${H-8}" text-anchor="end" class="axis-title">Idade</text>`;
  const html = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de ${category.toLowerCase()} por idade">${svgInner}</svg>`;
  const latest = [...items].sort((a,b) => (b.item.date || '').localeCompare(a.item.date || ''))[0];
  return {
    html,
    svgInner,
    statusText: latest?.result ? `Último: ${percentileLabel(latest.result)}` : items.length ? 'Sem referência para o último registro' : 'Sem registros',
    sourceText: metric === 'weight' ? 'Referência: OMS. Peso por idade disponível até 10 anos.' : 'Referência: OMS. Altura por idade disponível até 19 anos.',
    unavailable: false,
    width: W,
    height: H
  };
}

function renderGrowthChart(metric) {
  const container = metric === 'weight' ? $('weightGrowthChart') : $('heightGrowthChart');
  const status = metric === 'weight' ? $('weightChartStatus') : $('heightChartStatus');
  if (!container) return;
  const view = buildGrowthChartView(metric);
  container.innerHTML = view.html;
  status.textContent = view.statusText;
}

function renderGrowthCharts() {
  renderGrowthChart('weight');
  renderGrowthChart('height');
}

window.editMilestone = function(id) {
  const item = currentChild().milestones.find(record => record.id === id);
  if (!item) return;
  const form = $('milestoneForm');
  form.classList.remove('hidden');
  form.elements.milestoneId.value = item.id;
  if (DEFAULT_CATEGORIES.includes(item.category) && item.category !== 'Categoria personalizada') {
    form.elements.category.value = item.category;
    form.elements.customCategory.value = '';
  } else {
    form.elements.category.value = 'Categoria personalizada';
    form.elements.customCategory.value = item.category || '';
  }
  updateMilestoneFieldBehavior();
  form.elements.date.value = item.date || '';
  form.elements.title.value = item.title || '';
  let value = item.numericValue ?? parseLocaleNumber(item.value);
  if (item.category === 'Altura' && Number.isFinite(Number(value)) && (item.unit === 'cm' || /cm/i.test(String(item.value || '')) || Number(value) > 3)) value = Number(value) / 100;
  form.elements.value.value = Number.isFinite(Number(value)) ? Number(value) : (item.value || '');
  form.elements.description.value = item.description || '';
  $('saveMilestoneBtn').textContent = 'Salvar alterações';
  $('cancelMilestoneEditBtn').classList.remove('hidden');
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.deleteMilestone = async function(id) {
  if (!await confirmUserChoice('Deseja realmente excluir este registro de evolução?')) return;
  const child = currentChild();
  const item = child.milestones.find(record => record.id === id);
  await deleteLocalFileRef(item?.photo);
  child.milestones = child.milestones.filter(record => record.id !== id);
  saveState();
  renderAll();
  showToast('Registro de evolução excluído.');
};

function populateMilestoneCategories() {
  const select = $('milestoneCategorySelect');
  const current = select.value;
  select.innerHTML = DEFAULT_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  if (DEFAULT_CATEGORIES.includes(current)) select.value = current;
  updateMilestoneFieldBehavior();
}

function milestoneCategoryOrder(category) {
  const index = DEFAULT_CATEGORIES.indexOf(category);
  return index === -1 ? 3 : index;
}

function renderMilestones() {
  const child = currentChild();
  const byCategory = child.milestones.reduce((acc, item) => {
    (acc[item.category] ||= []).push(item);
    return acc;
  }, {});
  const categories = Object.keys(byCategory).sort((a,b) => milestoneCategoryOrder(a) - milestoneCategoryOrder(b) || a.localeCompare(b));
  if (!categories.length) {
    $('milestoneList').innerHTML = '<p class="muted">Nenhum acompanhamento cadastrado.</p>';
    return;
  }
  $('milestoneList').innerHTML = categories.map(category => `
    <h3 class="category-title">${escapeHtml(category)}</h3>
    ${byCategory[category].sort((a,b) => (a.date || '').localeCompare(b.date || '')).map(item => {
      const percentile = milestonePercentile(item, child);
      const percentileText = percentileLabel(percentile);
      return `
      <article class="item milestone-card">
        ${item.photo ? `<img src="${fileRefUrl(item.photo)}" alt="${escapeHtml(item.title || category)}">` : ''}
        <div class="item-top">
          <strong>${escapeHtml(item.title || category)}</strong>
          <div class="milestone-actions">
            <button class="secondary compact-edit-btn" onclick="editMilestone('${item.id}')">Editar</button>
            <button class="danger compact-delete-btn" onclick="deleteMilestone('${item.id}')">Excluir</button>
          </div>
        </div>
        <small>${formatDate(item.date)} ${item.value ? '• ' + escapeHtml(item.value) : ''}</small>
        ${percentileText ? `<span class="percentile-badge">Percentil: ${escapeHtml(percentileText)}</span>` : (category === 'Peso' || category === 'Altura') ? '<span class="percentile-badge neutral">Percentil indisponível</span>' : ''}
        ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      </article>`;
    }).join('')}
  `).join('');
}

window.removeItem = async function(collection, id) {
  const child = currentChild();
  if (!Array.isArray(child[collection])) return;
  const item = child[collection].find(record => record.id === id);
  const message = collection === 'memories' ? 'Deseja realmente excluir esta memória?' : 'Deseja realmente excluir este item?';
  if (!await confirmUserChoice(message)) return;
  await deleteFilesForItem(collection, item);
  child[collection] = child[collection].filter(record => record.id !== id);
  saveState();
  renderAll();
  showToast('Item excluído.');
};

function renderAll() {
  renderChildSelect();
  fillChildForm();
  renderHome();
  renderMedications();
  renderExams();
  renderMedicalFiles();
  populateAlbumSelects();
  renderAlbums();
  renderMemories();
  renderManualMemorySelection();
  renderFavorites();
  renderProfileSettings();
  renderEvents();
  populateMilestoneCategories();
  renderGrowthCharts();
  renderMilestones();
}

function addFormListeners() {
  $('childSelect').addEventListener('change', event => {
    state.activeChildId = event.target.value;
    activeAlbumFilter = 'all';
    saveState();
    renderAll();
  });

  ['drawerChildSelect','drawerChildSelectMenu'].forEach(id => {
    if ($(id)) $(id).addEventListener('change', event => {
      state.activeChildId = event.target.value;
      activeAlbumFilter = 'all';
      saveState();
      renderAll();
    });
  });

  $('openSideMenu')?.addEventListener('click', openSideMenu);
  $('closeSideMenu')?.addEventListener('click', closeSideMenu);
  $('sideMenuBackdrop')?.addEventListener('click', closeSideMenu);
  $('changePhotoFromHome')?.addEventListener('click', () => { switchTab('cadastro'); $('childForm').elements.profilePhoto.click(); });
  $('goToCadastroBtn')?.addEventListener('click', () => switchTab('cadastro'));
  $('editChildBtnMenu')?.addEventListener('click', () => { switchTab('cadastro', { closeMenu: true }); });

  $('heroNotifyBtn')?.addEventListener('click', async () => {
    if (!('Notification' in window)) return showToast('Este navegador não suporta notificações.');
    const permission = await Notification.requestPermission();
    showToast(permission === 'granted' ? 'Notificações ativadas.' : 'Notificações não autorizadas.');
  });

  $('newChildBtnPanel')?.addEventListener('click', () => $('newChildBtn').click());
  $('newChildBtnMenu')?.addEventListener('click', () => { $('newChildBtn').click(); closeSideMenu(); });
  $('openChildPdfBuilderProfile')?.addEventListener('click', () => { switchTab('inicio'); openChildPdfBuilderAndScroll(); });
  $('openMemoriesPdfProfile')?.addEventListener('click', () => { switchTab('memorias'); $('memoryPdfBuilder').classList.remove('hidden'); renderManualMemorySelection(); });
  $('openEvolutionPdfProfile')?.addEventListener('click', () => generateEvolutionPdf());
  $('makeQrBtnProfile')?.addEventListener('click', () => { switchTab('inicio'); generateQrCode(); });
  $('exportBackupBtnProfile')?.addEventListener('click', exportBackup);
  $('notifyBtnProfile')?.addEventListener('click', () => $('heroNotifyBtn')?.click());
  $('drawerOpenRecordacoes')?.addEventListener('click', () => { switchTab('memorias', { closeMenu: true }); $('memoryPdfBuilder').classList.remove('hidden'); renderManualMemorySelection(); });
  $('drawerOpenQr')?.addEventListener('click', () => { switchTab('inicio', { closeMenu: true }); generateQrCode(); });
  $('drawerOpenBackup')?.addEventListener('click', () => { switchTab('inicio', { closeMenu: true }); document.querySelector('.backup-social-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });

  ['themeModeSelect','themeModeSelectMenu'].forEach(id => { if ($(id)) $(id).addEventListener('change', e => setThemeMode(e.target.value)); });
  $('themeStageSelect')?.addEventListener('change', () => updateManualThemePreview('main'));
  $('themeGenderSelect')?.addEventListener('change', () => updateManualThemePreview('main'));
  $('applyManualThemeBtn')?.addEventListener('click', () => applyManualThemeSelection('main'));
  $('themeStageSelectMenu')?.addEventListener('change', () => updateManualThemePreview('menu'));
  $('themeGenderSelectMenu')?.addEventListener('change', () => updateManualThemePreview('menu'));
  $('applyManualThemeBtnMenu')?.addEventListener('click', () => applyManualThemeSelection('menu'));

  $('newChildBtn').addEventListener('click', () => {
    const child = emptyChild();
    state.children.push(child);
    state.activeChildId = child.id;
    saveState();
    renderAll();
    switchTab('cadastro');
    showToast('Nova criança criada. Preencha o cadastro.');
  });

  $('deleteChildBtn').addEventListener('click', async () => {
    const childToDelete = currentChild();
    if (!await confirmUserChoice('Deseja realmente excluir esta criança e todos os dados vinculados?')) return;
    if (state.children.length <= 1) {
      await deleteFilesForChild(childToDelete);
      state.children = [emptyChild()];
      state.activeChildId = state.children[0].id;
    } else {
      await deleteFilesForChild(childToDelete);
      state.children = state.children.filter(c => c.id !== state.activeChildId);
      state.activeChildId = state.children[0].id;
    }
    saveState();
    renderAll();
    showToast('Cadastro excluído.');
  });

  $('childForm').addEventListener('submit', async event => {
    event.preventDefault();
    const child = currentChild();
    const form = event.currentTarget;
    const data = new FormData(form);
    for (const [key, value] of data.entries()) {
      if (key !== 'profilePhoto') child[key] = typeof value === 'string' ? value.trim() : value;
    }
    const file = form.elements.profilePhoto.files[0];
    if (file) {
      const oldId = child.profilePhoto && typeof child.profilePhoto === 'object' ? child.profilePhoto.id : '';
      child.profilePhoto = await storeLocalFile(file, oldId, { kind: 'profile-photo', childId: child.id, name: file.name || 'foto-perfil' });
    }
    saveState();
    renderAll();
    showToast('Criança salva com sucesso.');
  });

  $('childForm').elements.profilePhoto.addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    const previewUrl = createRuntimeObjectUrl(file);
    setImagePreview($('profilePreview'), previewUrl, 'Foto');
  });

  $('medForm').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    currentChild().medications.push({ id: uid(), ...data });
    event.currentTarget.reset();
    saveState();
    renderAll();
    showToast('Medicação adicionada.');
  });

  $('examForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const selectedFile = form.elements.arquivo.files[0];
    const child = currentChild();
    const examId = uid();
    const file = selectedFile ? await storeExamAttachment(selectedFile, '', { childId: child.id, parentId: examId }) : null;
    child.exams.push({ id: examId, data: data.data, nome: data.nome, descricao: data.descricao, file });
    form.reset();
    saveState();
    renderAll();
    showToast(file ? 'Exame e anexo salvos permanentemente.' : 'Exame adicionado.');
  });

  $('medicalFileForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const itemId = uid();
    const selectedFile = form.elements.file.files[0];
    const file = selectedFile ? await storeLocalFile(selectedFile, '', { kind: 'medical-file', childId: currentChild().id, parentId: itemId }) : null;
    currentChild().medicalFiles.push({ id: itemId, date: data.date, title: data.title, description: data.description, file });
    form.reset();
    saveState();
    renderAll();
    showToast('Arquivo médico adicionado.');
  });
  $('medicalFileSearch')?.addEventListener('input', renderMedicalFiles);
  $('medicalFileSort')?.addEventListener('change', renderMedicalFiles);

  $('showMemoryFormBtn').addEventListener('click', () => $('memoryFormCard').classList.toggle('hidden'));
  $('showAlbumFormBtn').addEventListener('click', () => $('albumFormCard').classList.toggle('hidden'));
  $('showMemoryPdfBuilderBtn').addEventListener('click', () => {
    $('memoryPdfBuilder').classList.remove('hidden');
    renderManualMemorySelection();
  });
  $('closeMemoryPdfBuilder').addEventListener('click', () => $('memoryPdfBuilder').classList.add('hidden'));

  $('gridViewBtn').addEventListener('click', () => {
    memoryView = 'grid';
    $('gridViewBtn').classList.add('active');
    $('listViewBtn').classList.remove('active');
    renderMemories();
  });
  $('listViewBtn').addEventListener('click', () => {
    memoryView = 'list';
    $('listViewBtn').classList.add('active');
    $('gridViewBtn').classList.remove('active');
    renderMemories();
  });

  $('albumForm').addEventListener('submit', event => {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get('nome').trim();
    if (!name) return;
    currentChild().albums.push({ id: uid(), name });
    event.currentTarget.reset();
    saveState();
    renderAll();
    showToast('Álbum criado.');
  });

  $('memoryForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const selectedFiles = Array.from(form.elements.arquivo.files || []).slice(0, 5);
    const child = currentChild();
    const memoryId = uid();
    const files = (await Promise.all(selectedFiles.map(file => fileToMemoryAsset(file, '', { childId: child.id, parentId: memoryId })))).filter(Boolean);
    child.memories.push({
      id: memoryId, date: data.data, title: data.titulo, description: data.descricao,
      albumId: data.albumId || '', favorite: data.favorite === 'true', files
    });
    form.reset();
    saveState();
    renderAll();
    showToast('Memória salva.');
  });

  $('memoryPdfFilter').addEventListener('change', () => {
    $('manualMemorySelection').classList.toggle('hidden', $('memoryPdfFilter').value !== 'manual');
  });
  $('generateMemoryPdfBtn').addEventListener('click', generateMemoryAlbumPdf);

  $('eventForm').addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    currentChild().events.push({ id: uid(), title: data.titulo, type: data.tipo, date: data.data, time: data.hora, location: data.local, description: data.descricao });
    event.currentTarget.reset();
    saveState();
    renderAll();
    showToast('Evento adicionado.');
  });

  $('notifyBtn').addEventListener('click', async () => {
    if (!('Notification' in window)) return showToast('Este navegador não suporta notificações.');
    const permission = await Notification.requestPermission();
    showToast(permission === 'granted' ? 'Notificações ativadas.' : 'Notificações não autorizadas.');
  });

  $('showMilestoneFormBtn').addEventListener('click', () => {
    const form = $('milestoneForm');
    if (form.classList.contains('hidden')) {
      resetMilestoneForm();
      form.classList.remove('hidden');
    } else {
      form.classList.add('hidden');
    }
  });
  $('milestoneCategorySelect').addEventListener('change', updateMilestoneFieldBehavior);
  $('cancelMilestoneEditBtn').addEventListener('click', () => {
    resetMilestoneForm();
    $('milestoneForm').classList.add('hidden');
  });
  $('milestoneForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    const selectedCategory = data.category;
    const category = selectedCategory === 'Categoria personalizada' ? data.customCategory.trim() : selectedCategory;
    if (!category) return showToast('Digite o nome da categoria personalizada.');
    const isWeight = category === 'Peso';
    const isHeight = category === 'Altura';
    const isGrowth = isWeight || isHeight;
    let numericValue = null;
    let value = String(data.value || '').trim();
    let unit = '';
    if (isGrowth) {
      numericValue = parseLocaleNumber(value);
      if (!Number.isFinite(numericValue) || numericValue <= 0) return showToast(`Informe um valor válido em ${isWeight ? 'kg' : 'metros'}.`);
      unit = isWeight ? 'kg' : 'm';
      value = `${formatLocaleNumber(numericValue, 2)} ${unit}`;
    }
    const selectedPhoto = form.elements.photo.files[0];
    const existingId = data.milestoneId;
    const child = currentChild();
    if (existingId) {
      const item = child.milestones.find(record => record.id === existingId);
      if (!item) return;
      let photo = item.photo || null;
      if (selectedPhoto) photo = await storeLocalFile(selectedPhoto, item.photo?.id || '', { kind: 'milestone', childId: child.id, parentId: item.id, name: selectedPhoto.name || 'foto-evolucao' });
      Object.assign(item, {
        category,
        date: data.date,
        title: isGrowth ? '' : data.title,
        value,
        numericValue,
        unit,
        description: data.description,
        photo
      });
      showToast('Registro de evolução atualizado.');
    } else {
      const milestoneId = uid();
      const photo = selectedPhoto ? await storeLocalFile(selectedPhoto, '', { kind: 'milestone', childId: child.id, parentId: milestoneId, name: selectedPhoto.name || 'foto-evolucao' }) : null;
      child.milestones.push({ id: milestoneId, category, date: data.date, title: isGrowth ? '' : data.title, value, numericValue, unit, description: data.description, photo });
      showToast('Registro de evolução salvo.');
    }
    resetMilestoneForm();
    form.classList.add('hidden');
    saveState();
    renderAll();
  });
  $('generateEvolutionPdfBtn').addEventListener('click', () => generateEvolutionPdf());

  $('openChildPdfBuilder').addEventListener('click', openChildPdfBuilderAndScroll);
  $('closeChildPdfBuilder').addEventListener('click', () => $('childPdfBuilder').classList.add('hidden'));
  $('generateSelectedChildPdf').addEventListener('click', () => generateSelectedChildPdf());
  $('makeQrBtn').addEventListener('click', generateQrCode);
  $('copyQrLink').addEventListener('click', async () => {
    await navigator.clipboard.writeText($('qrLink').value).catch(() => {});
    showToast('Link copiado.');
  });

  $('exportBackupBtn').addEventListener('click', exportBackup);
  $('importBackupInput').addEventListener('change', importBackup);

  $('closeVideoModal').addEventListener('click', closeVideoModal);
  $('videoModal').addEventListener('click', event => {
    if (event.target.id === 'videoModal') closeVideoModal();
  });
  $('closePhotoModal').addEventListener('click', closePhotoModal);
  $('photoModal').addEventListener('click', event => {
    if (event.target.id === 'photoModal') closePhotoModal();
  });
  $('closeExamAttachmentModal')?.addEventListener('click', closeExamAttachmentModal);
  $('examAttachmentModal')?.addEventListener('click', event => {
    if (event.target.id === 'examAttachmentModal') closeExamAttachmentModal();
  });

  $('closeMemoryViewer')?.addEventListener('click', closeMemoryViewer);
  $('prevMemoryAsset')?.addEventListener('click', () => moveMemoryAsset(-1));
  $('nextMemoryAsset')?.addEventListener('click', () => moveMemoryAsset(1));
  $('downloadAllMemoryAssets')?.addEventListener('click', downloadAllCurrentMemoryAssets);
  $('memoryEditForm')?.addEventListener('submit', saveMemoryEdits);
  $('memoryViewerModal')?.addEventListener('click', event => {
    if (event.target.id === 'memoryViewerModal') closeMemoryViewer();
  });
}

function closeVideoModal() {
  const player = $('memoryVideoPlayer');
  player.pause();
  player.src = '';
  $('videoModal').classList.add('hidden');
}

function closePhotoModal() {
  $('memoryPhotoViewer').src = '';
  $('photoModal').classList.add('hidden');
}

window.downloadIcs = function(eventId) {
  const child = currentChild();
  const e = child.events.find(item => item.id === eventId);
  if (!e) return;
  const date = (e.date || '').replace(/-/g, '');
  const time = (e.time || '0900').replace(':', '') + '00';
  const dt = `${date}T${time}`;
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//cReScer juntos//PT-BR', 'BEGIN:VEVENT',
    `UID:${e.id}@crescer-juntos`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
    `DTSTART:${dt}`, `SUMMARY:${escapeIcs(e.title)}`, `LOCATION:${escapeIcs(e.location || '')}`,
    `DESCRIPTION:${escapeIcs(e.description || '')}`, 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  downloadText(`${safeFileName(e.title || 'evento')}.ics`, ics, 'text/calendar');
};

function escapeIcs(value = '') {
  return String(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function safeFileName(value = 'arquivo') {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'arquivo';
}

async function fileRefForBackup(ref, fallbackName = 'arquivo') {
  if (!ref) return ref;
  if (typeof ref === 'string') {
    if (!ref.startsWith('data:')) return ref;
    const blob = dataUrlToBlob(ref);
    return {
      id: uid(),
      name: fallbackName,
      type: blob.type || 'application/octet-stream',
      size: blob.size,
      dataUrl: ref,
      storage: 'backup-base64'
    };
  }
  let blob = null;
  let thumbnailBlob = null;
  if (ref.id) {
    const record = await getExamAttachmentRecord(ref.id).catch(() => null);
    blob = record?.blob || null;
    thumbnailBlob = record?.thumbnailBlob || null;
  }
  if (!blob && ref.dataUrl) {
    if (String(ref.dataUrl).startsWith('data:')) blob = dataUrlToBlob(ref.dataUrl);
    else if (String(ref.dataUrl).startsWith('blob:')) {
      try { blob = await (await fetch(ref.dataUrl)).blob(); } catch {}
    }
  }
  if (!blob) return prepareStateForLocalStorage(ref);
  const backupRef = {
    ...prepareStateForLocalStorage(ref),
    name: ref.name || fallbackName,
    type: ref.type || blob.type || 'application/octet-stream',
    size: Number(ref.size || blob.size || 0),
    dataUrl: await blobToDataUrl(blob),
    storage: 'backup-base64'
  };
  if (thumbnailBlob) backupRef.thumbnail = await blobToDataUrl(thumbnailBlob);
  return backupRef;
}

async function exportBackup() {
  const exportState = prepareStateForLocalStorage(state);
  for (let childIndex = 0; childIndex < (state.children || []).length; childIndex += 1) {
    const originalChild = state.children[childIndex];
    const backupChild = exportState.children[childIndex];
    backupChild.profilePhoto = await fileRefForBackup(originalChild.profilePhoto, 'foto-perfil');
    for (let index = 0; index < (originalChild.exams || []).length; index += 1) {
      backupChild.exams[index].file = await fileRefForBackup(originalChild.exams[index].file, 'arquivo-exame');
    }
    for (let index = 0; index < (originalChild.medicalFiles || []).length; index += 1) {
      backupChild.medicalFiles[index].file = await fileRefForBackup(originalChild.medicalFiles[index].file, 'arquivo-medico');
    }
    for (let memoryIndex = 0; memoryIndex < (originalChild.memories || []).length; memoryIndex += 1) {
      const originalMemory = originalChild.memories[memoryIndex];
      const backupMemory = backupChild.memories[memoryIndex];
      backupMemory.files = [];
      for (const asset of originalMemory.files || []) backupMemory.files.push(await fileRefForBackup(asset, asset.name || 'anexo-memoria'));
    }
    for (let index = 0; index < (originalChild.milestones || []).length; index += 1) {
      backupChild.milestones[index].photo = await fileRefForBackup(originalChild.milestones[index].photo, 'foto-evolucao');
    }
  }
  const content = JSON.stringify({ exportedAt: new Date().toISOString(), app: 'cReScer juntos', version: 5, state: exportState }, null, 2);
  downloadText(`backup-crescer-juntos-${new Date().toISOString().slice(0,10)}.json`, content, 'application/json');
  showToast('Backup exportado com os anexos dos exames.');
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const importedState = parsed.state || parsed;
    if (!importedState.children || !Array.isArray(importedState.children)) throw new Error('Formato inválido');
    await hydrateAllLocalFiles(importedState);
    state = importedState;
    if (!state.activeChildId && state.children[0]) state.activeChildId = state.children[0].id;
    saveState();
    activeAlbumFilter = 'all';
    renderAll();
    showToast('Backup restaurado com os anexos dos exames.');
  } catch (error) {
    console.error(error);
    showToast('Arquivo de backup inválido.');
  } finally {
    event.target.value = '';
  }
}

function getPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast('Biblioteca de PDF ainda carregando. Tente novamente em alguns segundos.');
    return null;
  }
  return new window.jspdf.jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
}

let appLogoCache = null;
async function getAppLogoDataUrl() {
  if (appLogoCache) return appLogoCache;
  try {
    const response = await fetch('./icons/logo-main.png');
    const blob = await response.blob();
    appLogoCache = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    return appLogoCache;
  } catch (error) {
    console.warn('Logo não carregado para PDF.', error);
    return '';
  }
}

async function addPdfHeader(doc, documentTitle, childName = '') {
  const logo = await getAppLogoDataUrl();
  if (logo) addImageSafe(doc, logo, 14, 12, 16, 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 110, 229);
  doc.setFontSize(18);
  doc.text('Crescer Juntos', 34, 18);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(23, 33, 58);
  doc.setFontSize(9.5);
  doc.text('Guardando hoje, celebrando sempre.', 34, 24);
  doc.setFontSize(8.5);
  doc.text('Gerado em:', 153, 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 110, 229);
  doc.text(new Date().toLocaleDateString('pt-BR'), 153, 22);
  doc.setDrawColor(22, 110, 229);
  doc.setLineWidth(0.7);
  doc.line(14, 32, 196, 32);

  doc.setTextColor(23, 33, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text(documentTitle, 14, 48);
  if (childName) {
    doc.setTextColor(22, 110, 229);
    doc.setFontSize(22);
    doc.text(childName, 14, 60);
    return 72;
  }
  return 60;
}

function addPdfFooter(doc, title) {
  const pages = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setFillColor(22, 110, 229);
    doc.rect(0, 284, 210, 13, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Crescer Juntos', 14, 292);
    doc.setFont('helvetica', 'normal');
    doc.text(title, 105, 292, { align: 'center' });
    doc.text(`Página ${page} de ${pages}`, 196, 292, { align: 'right' });
  }
}

function ensurePage(doc, y, needed = 18) {
  if (y + needed > 274) {
    doc.addPage();
    return 18;
  }
  return y;
}

function addSection(doc, title, y, color = [22, 110, 229]) {
  y = ensurePage(doc, y, 22);
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, y, 182, 14, 4, 4, 'S');
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(title, 20, y + 9);
  return y + 21;
}

function addLine(doc, label, value, y) {
  if (!value) return y;
  y = ensurePage(doc, y, 9);
  doc.setTextColor(23, 33, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`${label}:`, 20, y);
  doc.setFont('helvetica', 'normal');
  const text = doc.splitTextToSize(String(value), 120);
  doc.text(text, 62, y);
  return y + Math.max(6, text.length * 5);
}

function addParagraph(doc, text, y, width = 170, maxLines = 999) {
  if (!text) return y;
  doc.setTextColor(23, 33, 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(String(text), width).slice(0, maxLines);
  lines.forEach(line => {
    y = ensurePage(doc, y, 6);
    doc.text(line, 20, y);
    y += 5;
  });
  return y + 2;
}

function addImageSafe(doc, dataUrl, x, y, maxW, maxH) {
  try {
    const props = doc.getImageProperties(dataUrl);
    const ratio = Math.min(maxW / props.width, maxH / props.height);
    const w = props.width * ratio;
    const h = props.height * ratio;
    doc.addImage(dataUrl, props.fileType || 'JPEG', x + (maxW - w) / 2, y, w, h);
    return { w, h };
  } catch (error) {
    console.warn('Imagem não suportada no PDF', error);
    doc.setFontSize(9);
    doc.text('Imagem não suportada neste PDF.', x, y + 8);
    return { w: 0, h: 10 };
  }
}

async function addImageSafeForPdf(doc, dataUrl, x, y, maxW, maxH) {
  const normalized = await normalizeImageForPdf(dataUrl);
  return addImageSafe(doc, normalized, x, y, maxW, maxH);
}

function childDisplayName(child) {
  return child.nome ? `${child.nome} ${child.sobrenome || ''}`.trim() : 'Criança sem nome';
}

async function addExamAttachmentToChildPdf(doc, file, y) {
  if (!file) return y;
  const name = file.name || 'arquivo-do-exame';
  if (isImageFile(file)) {
    y = ensurePage(doc, y, 96);
    try {
      const dataUrl = await resolvePersistentAssetDataUrl(file);
      if (!dataUrl) throw new Error('Anexo indisponível');
      doc.setTextColor(98, 112, 138);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`Imagem anexada: ${name}`, 20, y);
      y += 5;
      const image = await addImageSafeForPdf(doc, dataUrl, 20, y, 170, 82);
      return y + Math.max(14, image.h) + 8;
    } catch (error) {
      console.warn('Não foi possível carregar anexo do exame no PDF.', error);
      return addParagraph(doc, 'Não foi possível carregar este anexo.', y);
    }
  }
  if (isPdfFile(file)) return addParagraph(doc, `Arquivo PDF anexado: ${name}`, y);
  return addParagraph(doc, `${fileTypeLabel(file)} anexado: ${name}`, y);
}

async function generateSelectedChildPdf() {
  const doc = getPdf();
  if (!doc) return;
  const child = currentChild();
  const sections = qsa('input[name="pdfSection"]:checked').map(i => i.value);
  let y = await addPdfHeader(doc, 'Resumo da criança', '');

  const cardTop = 42;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(222, 234, 248);
  doc.roundedRect(14, cardTop, 182, 48, 6, 6, 'FD');
  if (child.profilePhoto) {
    await addImageSafeForPdf(doc, fileRefUrl(child.profilePhoto), 18, 48, 40, 40);
  } else {
    doc.setFillColor(234, 242, 255);
    doc.roundedRect(18, 48, 40, 40, 4, 4, 'F');
    doc.setTextColor(22, 110, 229);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Foto', 38, 70, { align: 'center' });
  }
  doc.setTextColor(23, 33, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Resumo da criança', 66, 58);
  doc.setTextColor(22, 110, 229);
  doc.setFontSize(21);
  doc.text(childDisplayName(child), 66, 70);
  doc.setFillColor(234, 242, 255);
  doc.roundedRect(66, 76, 56, 10, 5, 5, 'F');
  doc.setTextColor(22, 110, 229);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 94, 82.7, { align: 'center' });
  y = 98;

  if (sections.includes('fotoBio')) {
    y = addSection(doc, 'PERFIL', y, [134, 107, 255]);
    y = addLine(doc, 'Idade', calculateAgeText(child.nascimento), y);
    y = addLine(doc, 'Mini bio', child.miniBio, y);
  }

  if (sections.includes('cadastro')) {
    y = addSection(doc, 'CADASTRO', y, [22, 110, 229]);
    y = addLine(doc, 'Nome', childDisplayName(child), y);
    y = addLine(doc, 'Nascimento', formatDate(child.nascimento), y);
    y = addLine(doc, 'Tipo sanguíneo', child.tipoSanguineo, y);
    y = addLine(doc, 'Mãe', child.mae, y);
    y = addLine(doc, 'Telefone da mãe', child.telefoneMae, y);
    y = addLine(doc, 'Pai', child.pai, y);
    y = addLine(doc, 'Telefone do pai', child.telefonePai, y);
    y = addLine(doc, 'Contato de emergência', `${child.emergenciaNome || ''} ${child.emergenciaTelefone || ''}`.trim(), y);
    y = addLine(doc, 'Pediatra', `${child.pediatraNome || ''} ${child.pediatraTelefone || ''}`.trim(), y);
  }

  if (sections.includes('saude')) {
    y = addSection(doc, 'DADOS DE SAÚDE', y, [34, 178, 125]);
    y = addLine(doc, 'Problemas de saúde', child.problemas || 'Nenhum informado', y);
    y = addLine(doc, 'Alergias', child.alergias || 'Nenhuma informada', y);
    y = addLine(doc, 'Observações gerais', child.observacoes, y);
  }

  if (sections.includes('medicacoes')) {
    y = addSection(doc, 'MEDICAÇÕES', y, [134, 107, 255]);
    if (!child.medications.length) y = addParagraph(doc, 'Nenhuma medicação cadastrada.', y);
    child.medications.forEach(m => y = addParagraph(doc, `• ${m.nome || ''} | Dose: ${m.dose || '-'} | Frequência: ${m.frequencia || '-'} | Horário: ${m.horario || '-'}`, y));
  }

  if (sections.includes('exames')) {
    y = addSection(doc, 'EXAMES', y, [255, 179, 0]);
    if (!child.exams.length) y = addParagraph(doc, 'Nenhum exame cadastrado.', y);
    for (const exam of child.exams) {
      y = addParagraph(doc, `• ${[formatDate(exam.data), exam.nome, exam.descricao].filter(Boolean).join(' - ')}`, y);
      for (const file of examAttachments(exam)) y = await addExamAttachmentToChildPdf(doc, file, y);
    }
  }

  if (sections.includes('arquivosMedicos')) {
    y = addSection(doc, 'ARQUIVOS MÉDICOS', y, [98, 114, 138]);
    if (!child.medicalFiles.length) y = addParagraph(doc, 'Nenhum arquivo médico cadastrado.', y);
    child.medicalFiles.sort((a,b) => (b.date || '').localeCompare(a.date || '')).forEach(file => {
      y = addParagraph(doc, `• ${formatDate(file.date)} - ${file.title || 'Documento'}. ${file.description || ''}${file.file ? ' Arquivo: ' + file.file.name : ''}`, y);
    });
  }

  if (sections.includes('agenda') || sections.includes('consultas') || sections.includes('vacinas') || sections.includes('proximos')) {
    let events = [...child.events];
    if (!sections.includes('agenda')) {
      const filters = [];
      if (sections.includes('consultas')) filters.push('Consulta médica');
      if (sections.includes('vacinas')) filters.push('Vacina');
      events = events.filter(e => filters.includes(e.type));
    }
    if (sections.includes('proximos')) {
      const today = new Date().toISOString().slice(0,10);
      events = events.filter(e => !e.date || e.date >= today);
    }
    y = addSection(doc, 'CALENDÁRIO/AGENDA', y, [255, 179, 0]);
    if (!events.length) y = addParagraph(doc, 'Nenhum evento selecionado.', y);
    events.sort((a,b) => (a.date || '').localeCompare(b.date || '')).forEach(e => y = addParagraph(doc, `• ${formatDate(e.date)} ${e.time || ''} - ${e.type || 'Evento'}: ${e.title || ''}. ${e.location ? 'Local: ' + e.location + '. ' : ''}${e.description || ''}`, y));
  }

  if (sections.includes('evolucao')) {
    y = addSection(doc, 'MARCOS & EVOLUÇÃO', y, [34, 178, 125]);
    if (!child.milestones.length) y = addParagraph(doc, 'Nenhum marco cadastrado.', y);
    child.milestones.sort((a,b) => (a.date || '').localeCompare(b.date || '')).forEach(m => y = addParagraph(doc, evolutionRecordText(m, child), y));
    y = await addEvolutionChartToPdf(doc, y, child, 'weight');
    y = await addEvolutionChartToPdf(doc, y, child, 'height');
  }

  if (sections.includes('memoriasFavoritas')) {
    y = addSection(doc, 'MEMÓRIAS FAVORITAS/PRINCIPAIS', y, [255, 111, 174]);
    const memories = child.memories.filter(m => m.favorite).slice(0, 12);
    if (!memories.length) y = addParagraph(doc, 'Nenhuma memória favorita cadastrada.', y);
    memories.forEach(m => y = addParagraph(doc, `• ${formatDate(m.date)} - ${m.title || 'Memória'}: ${m.description || ''}`, y));
  }

  y = ensurePage(doc, y, 22);
  doc.setFillColor(245, 236, 252);
  doc.roundedRect(14, y, 182, 18, 5, 5, 'F');
  doc.setTextColor(134, 107, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('Acompanhar cada fase é construir histórias que ficam para sempre.', 105, y + 11, { align: 'center' });

  addPdfFooter(doc, 'Resumo da criança');
  doc.save(`resumo-${safeFileName(childDisplayName(child))}.pdf`);
  showToast('PDF da criança criado.');
}

async function generateMemoryAlbumPdf() {
  const doc = getPdf();
  if (!doc) return;
  const child = currentChild();
  const memories = getSelectedImageMemoriesForPdf();
  if (!memories.length) return showToast('Nenhuma memória com foto encontrada para o PDF.');

  const photoEntries = [];
  memories.forEach(memory => {
    memoryAssets(memory).filter(isImage).forEach(asset => photoEntries.push({ memory, asset }));
  });
  if (!photoEntries.length) return showToast('Nenhuma foto encontrada para o PDF.');

  let coverData = '';
  const coverSource = $('memoryPdfCoverSource').value;
  if (coverSource === 'profile') coverData = fileRefUrl(child.profilePhoto);
  if (coverSource === 'first') coverData = photoEntries[0].asset.dataUrl;
  if (coverSource === 'upload') {
    const file = $('memoryPdfCoverUpload').files[0];
    if (file) coverData = (await fileToDataUrl(file)).dataUrl;
  }

  doc.setFillColor(244, 248, 255);
  doc.rect(0, 0, 210, 297, 'F');
  await addPdfHeader(doc, 'Recordações', childDisplayName(child));
  if (coverData) await addImageSafeForPdf(doc, coverData, 30, 78, 150, 145);
  doc.setTextColor(23, 33, 58);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Criado em ${new Date().toLocaleDateString('pt-BR')}`, 105, 245, { align: 'center' });

  const slots = [{ x: 16, y: 24 }, { x: 16, y: 154 }];
  for (let index = 0; index < photoEntries.length; index += 1) {
    const { memory, asset } = photoEntries[index];
    if (index % 2 === 0) doc.addPage();
    const slot = slots[index % 2];
    await addImageSafeForPdf(doc, asset.dataUrl, slot.x, slot.y, 178, 82);
    doc.setTextColor(23, 33, 58);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(`${formatDate(memory.date)} - ${memory.title || 'Memória'}`, slot.x, slot.y + 91);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    const desc = doc.splitTextToSize(memory.description || '', 178).slice(0, 30);
    doc.text(desc, slot.x, slot.y + 99);
  }

  addPdfFooter(doc, 'Recordações');
  doc.save(`recordacoes-${safeFileName(childDisplayName(child))}.pdf`);
  showToast('Recordações criadas.');
}

function pdfCleanValue(value) {
  if (value == null) return '';
  const text = String(value).trim();
  return /^(undefined|null)$/i.test(text) ? '' : text;
}

function pdfJoinValues(values, separator = ' ') {
  return values.map(pdfCleanValue).filter(Boolean).join(separator);
}

function selectedPdfSections() {
  const selected = qsa('input[name="pdfSection"]:checked').map(input => input.value);
  return selected.length ? selected : ['cadastro', 'fotoBio', 'saude', 'medicacoes', 'exames', 'arquivosMedicos', 'agenda', 'evolucao', 'memoriasFavoritas'];
}

function addCleanLine(doc, label, value, y) {
  return addLine(doc, label, pdfCleanValue(value), y);
}

function addEvolutionChildData(doc, child, y) {
  y = addSection(doc, 'DADOS DA CRIANÇA', y, [22, 110, 229]);
  y = addCleanLine(doc, 'Nome', childDisplayName(child), y);
  y = addCleanLine(doc, 'Nascimento', child.nascimento ? formatDate(child.nascimento) : '', y);
  y = addCleanLine(doc, 'Idade', child.nascimento ? calculateAgeText(child.nascimento) : '', y);
  y = addCleanLine(doc, 'Sexo', child.sexo, y);
  y = addCleanLine(doc, 'Tipo sanguíneo', child.tipoSanguineo, y);
  y = addCleanLine(doc, 'Mãe', pdfJoinValues([child.mae, child.telefoneMae], ' - '), y);
  y = addCleanLine(doc, 'Pai', pdfJoinValues([child.pai, child.telefonePai], ' - '), y);
  y = addCleanLine(doc, 'Pediatra', pdfJoinValues([child.pediatraNome, child.pediatraTelefone], ' - '), y);
  return y;
}

function growthChartPdfSvg(metric, child) {
  const view = buildGrowthChartView(metric, child);
  const title = metric === 'weight' ? 'Peso por idade' : 'Altura por idade';
  const description = metric === 'weight'
    ? 'Curvas de referência da OMS e registros da criança.'
    : 'Curvas de referência da OMS e registros da criança.';
  const status = view.statusText || (view.unavailable ? '' : 'Sem registros');
  const statusBadge = status
    ? `<rect x="760" y="42" width="380" height="38" rx="19" fill="#eaf2ff"/><text x="950" y="66" text-anchor="middle" fill="#2f6ed0" font-size="18" font-weight="800" font-family="Inter,Arial,sans-serif">${escapeHtml(status)}</text>`
    : '';
  const chart = view.unavailable
    ? `<rect x="40" y="115" width="1120" height="500" rx="24" fill="#fbfdff" stroke="#dce7f8"/>
       <text x="600" y="365" text-anchor="middle" fill="#62708a" font-size="28" font-weight="700" font-family="Inter,Arial,sans-serif">${view.html.replace(/<[^>]+>/g, '')}</text>`
    : `<rect x="40" y="115" width="1120" height="500" rx="24" fill="#fbfdff" stroke="#dce7f8"/>
       <svg x="70" y="140" width="1060" height="488" viewBox="0 0 ${view.width} ${view.height}">${view.svgInner}</svg>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">
    <rect width="1200" height="720" fill="#ffffff"/>
    <text x="40" y="52" fill="#17213a" font-size="34" font-weight="800" font-family="Inter,Arial,sans-serif">${title}</text>
    <text x="40" y="84" fill="#62708a" font-size="20" font-weight="500" font-family="Inter,Arial,sans-serif">${description}</text>
    ${statusBadge}
    ${chart}
    <text x="40" y="682" fill="#62708a" font-size="19" font-weight="600" font-family="Inter,Arial,sans-serif">${view.sourceText}</text>
  </svg>`;
}

function svgToPngDataUrl(svg, width = 2400, height = 1440) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/png', 1));
    };
    image.onerror = reject;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

async function addEvolutionChartToPdf(doc, y, child, metric, options = {}) {
  const title = options.title || (metric === 'weight' ? 'Peso por idade' : 'Altura por idade');
  y = addSection(doc, title, y, metric === 'weight' ? [22, 110, 229] : [34, 178, 125]);
  y = ensurePage(doc, y, 118);
  const chartDataUrl = await svgToPngDataUrl(growthChartPdfSvg(metric, child));
  addImageSafe(doc, chartDataUrl, 16, y, 178, 107);
  return y + 114;
}

function evolutionRecordText(item, child) {
  const parts = [];
  parts.push(formatDate(item.date));
  parts.push(item.category);
  const title = pdfCleanValue(item.title);
  const value = pdfCleanValue(item.value);
  if (title && title !== item.category) parts.push(title);
  if (value) parts.push(value);
  const percentile = percentileLabel(milestonePercentile(item, child));
  if (percentile) parts.push(`Percentil ${percentile}`);
  const description = pdfCleanValue(item.description);
  return `• ${parts.filter(Boolean).join(' - ')}${description ? `. ${description}` : ''}`;
}

function addSelectedEvolutionPdfContent(doc, child, sections, y) {
  if (sections.includes('fotoBio') && child.miniBio) {
    y = addSection(doc, 'FOTO E MINI BIO', y, [134, 107, 255]);
    y = addParagraph(doc, child.miniBio, y);
  }
  if (sections.includes('saude') && (child.problemas || child.alergias || child.observacoes)) {
    y = addSection(doc, 'DADOS DE SAÚDE', y, [34, 178, 125]);
    y = addCleanLine(doc, 'Problemas de saúde', child.problemas, y);
    y = addCleanLine(doc, 'Alergias', child.alergias, y);
    y = addCleanLine(doc, 'Observações gerais', child.observacoes, y);
  }
  if (sections.includes('medicacoes') && child.medications.length) {
    y = addSection(doc, 'MEDICAÇÕES EM USO', y, [134, 107, 255]);
    child.medications.forEach(item => {
      y = addParagraph(doc, `• ${pdfJoinValues([item.nome, item.dose, item.frequencia, item.horario], ' - ')}`, y);
    });
  }
  if (sections.includes('exames') && child.exams.length) {
    y = addSection(doc, 'EXAMES', y, [255, 179, 0]);
    child.exams.forEach(item => {
      y = addParagraph(doc, `• ${pdfJoinValues([item.data ? formatDate(item.data) : '', item.nome, item.descricao, item.file?.name ? `Arquivo: ${item.file.name}` : ''], ' - ')}`, y);
    });
  }
  if (sections.includes('arquivosMedicos') && child.medicalFiles.length) {
    y = addSection(doc, 'ARQUIVOS MÉDICOS', y, [98, 114, 138]);
    child.medicalFiles.forEach(item => {
      y = addParagraph(doc, `• ${pdfJoinValues([item.date ? formatDate(item.date) : '', item.title || 'Documento', item.description, item.file?.name ? `Arquivo: ${item.file.name}` : ''], ' - ')}`, y);
    });
  }
  if ((sections.includes('agenda') || sections.includes('consultas') || sections.includes('vacinas') || sections.includes('proximos')) && child.events.length) {
    let events = [...child.events];
    if (!sections.includes('agenda')) {
      const filters = [];
      if (sections.includes('consultas')) filters.push('Consulta médica');
      if (sections.includes('vacinas')) filters.push('Vacina');
      events = events.filter(item => filters.includes(item.type));
    }
    if (sections.includes('proximos')) {
      const today = new Date().toISOString().slice(0,10);
      events = events.filter(item => !item.date || item.date >= today);
    }
    if (events.length) {
      y = addSection(doc, 'CALENDÁRIO/AGENDA', y, [255, 179, 0]);
      events.sort((a,b) => (a.date || '').localeCompare(b.date || '')).forEach(item => {
        y = addParagraph(doc, `• ${pdfJoinValues([item.date ? formatDate(item.date) : '', item.time, item.type || 'Evento', item.title, item.location ? `Local: ${item.location}` : '', item.description], ' - ')}`, y);
      });
    }
  }
  if (sections.includes('memoriasFavoritas')) {
    const memories = child.memories.filter(item => item.favorite).slice(0, 12);
    if (memories.length) {
      y = addSection(doc, 'MEMÓRIAS FAVORITAS/PRINCIPAIS', y, [255, 111, 174]);
      memories.forEach(item => {
        y = addParagraph(doc, `• ${pdfJoinValues([item.date ? formatDate(item.date) : '', item.title || 'Memória', item.description], ' - ')}`, y);
      });
    }
  }
  return y;
}

async function generateEvolutionPdf() {
  const doc = getPdf();
  if (!doc) return;
  const child = currentChild();
  const sections = selectedPdfSections();
  let y = 18;

  const logo = await getAppLogoDataUrl();
  if (logo) addImageSafe(doc, logo, 14, 12, 18, 18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 110, 229);
  doc.setFontSize(18);
  doc.text('Crescer Juntos', 36, 20);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(23, 33, 58);
  doc.setFontSize(9.5);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 196, 20, { align: 'right' });
  doc.setDrawColor(22, 110, 229);
  doc.setLineWidth(0.7);
  doc.line(14, 34, 196, 34);

  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(222, 234, 248);
  doc.roundedRect(14, 42, 182, 46, 6, 6, 'FD');
  if (logo) addImageSafe(doc, logo, 18, 48, 28, 28);
  doc.setTextColor(23, 33, 58);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('Resumo da Evolução', 54, 56);
  doc.setTextColor(22, 110, 229);
  doc.setFontSize(22);
  doc.text(childDisplayName(child), 54, 69);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(98, 112, 138);
  doc.setFontSize(9.5);
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 54, 80);
  y = 98;

  y = addEvolutionChildData(doc, child, y);
  y = addSelectedEvolutionPdfContent(doc, child, sections, y);
  y = await addEvolutionChartToPdf(doc, y, child, 'weight');
  y = await addEvolutionChartToPdf(doc, y, child, 'height');

  y = addSection(doc, 'REGISTROS DE EVOLUÇÃO', y, [34, 178, 125]);
  if (!child.milestones.length) {
    y = addParagraph(doc, 'Nenhum registro em Marcos & Evolução cadastrado.', y);
  } else {
    const grouped = child.milestones.reduce((acc, item) => ((acc[item.category || 'Outros'] ||= []).push(item), acc), {});
    Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).forEach(([category, items]) => {
      y = addSection(doc, category, y, [98, 114, 138]);
      items.sort((a,b) => (a.date || '').localeCompare(b.date || '')).forEach(item => {
        y = addParagraph(doc, evolutionRecordText(item, child), y);
        if (item.photo) {
          y = ensurePage(doc, y, 42);
          addImageSafe(doc, fileRefUrl(item.photo), 20, y, 52, 36);
          y += 42;
        }
      });
    });
  }

  addPdfFooter(doc, 'Resumo da Evolução');
  doc.save(`resumo-evolutivo-${safeFileName(childDisplayName(child))}.pdf`);
  showToast('Resumo Evolutivo criado.');
}

function generateQrCode() {
  const child = currentChild();
  const compact = {
    nome: childDisplayName(child), nascimento: formatDate(child.nascimento), tipoSanguineo: child.tipoSanguineo,
    alergias: child.alergias, problemas: child.problemas, mae: child.mae, telefoneMae: child.telefoneMae,
    pai: child.pai, telefonePai: child.telefonePai, emergencia: `${child.emergenciaNome || ''} ${child.emergenciaTelefone || ''}`.trim(),
    pediatra: `${child.pediatraNome || ''} ${child.pediatraTelefone || ''}`.trim(),
    medicacoes: child.medications.map(m => `${m.nome} - ${m.dose || ''} - ${m.frequencia || ''}`).slice(0, 8),
    proximosEventos: child.events.filter(e => !e.date || e.date >= new Date().toISOString().slice(0,10)).slice(0, 8).map(e => `${formatDate(e.date)} - ${e.type}: ${e.title}`)
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(compact))));
  const link = `${location.origin}${location.pathname}#resumo=${encoded}`;
  $('qrBox').classList.remove('hidden');
  $('qrLink').value = link;
  $('qrCodeCanvas').innerHTML = '';
  if (window.QRCode) {
    new QRCode($('qrCodeCanvas'), { text: link, width: 190, height: 190 });
    showToast('QR Code criado.');
  } else {
    showToast('Biblioteca de QR Code ainda carregando.');
  }
}

function maybeRenderSharedSummary() {
  if (!location.hash.startsWith('#resumo=')) return false;
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(location.hash.replace('#resumo=', '')))));
    document.body.innerHTML = `
      <main class="layout">
        <article class="card">
          <h1>Resumo da criança</h1>
          <p>Informações principais compartilhadas via cReScer juntos.</p>
          <div class="list">
            ${Object.entries(data).map(([key, value]) => Array.isArray(value)
              ? `<div class="item"><strong>${escapeHtml(labelFromKey(key))}</strong>${value.map(v => `<p>• ${escapeHtml(v)}</p>`).join('') || '<p>-</p>'}</div>`
              : `<div class="item"><strong>${escapeHtml(labelFromKey(key))}</strong><p>${escapeHtml(value || '-')}</p></div>`).join('')}
          </div>
          <div class="actions"><button class="primary" onclick="window.print()">Imprimir / salvar em PDF</button></div>
        </article>
      </main>`;
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

function labelFromKey(key) {
  const labels = { nome: 'Nome', nascimento: 'Nascimento', tipoSanguineo: 'Tipo sanguíneo', alergias: 'Alergias', problemas: 'Problemas de saúde', mae: 'Mãe', telefoneMae: 'Telefone da mãe', pai: 'Pai', telefonePai: 'Telefone do pai', emergencia: 'Emergência', pediatra: 'Pediatra', medicacoes: 'Medicações', proximosEventos: 'Próximos eventos' };
  return labels[key] || key;
}

async function init() {
  if (maybeRenderSharedSummary()) return;
  registerServiceWorker();
  initTabs();
  addFormListeners();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => false);
  await hydrateAllLocalFiles(state);
  saveState();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
