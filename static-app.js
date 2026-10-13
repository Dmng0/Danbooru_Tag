'use strict';

const GROUP_ORDER = __GROUPS__;
const ALIASES = __ALIASES__;
const TAG_ROWS = __TAG_ROWS__;
const CATEGORY_LABELS = { '-1': 'prompt', '0': 'general', '4': 'character', '9': 'rating' };
const TAGS = TAG_ROWS.map(([name, category, count, groupIndex]) => ({ name, category, count, groupIndex }));
const TAG_MAP = new Map(TAGS.map(tag => [tag.name, tag]));
const SORTED_ALIASES = Object.entries(ALIASES).sort((a, b) => b[0].length - a[0].length);

const state = {
  mode: 'image',
  imageData: '',
  imageFileName: '',
  groups: GROUP_ORDER.map(name => ({ name, tags: [] })),
  tailTags: [],
  analysisMeta: null,
};

const $ = selector => document.querySelector(selector);
const elements = {
  tabs: [...document.querySelectorAll('.tab')],
  dropZone: $('#dropZone'), imageInput: $('#imageInput'), imagePreview: $('#imagePreview'), imageMeta: $('#imageMeta'),
  imageName: $('#imageName'), removeImageButton: $('#removeImageButton'), textPane: $('#textPane'), textInput: $('#textInput'),
  characterCount: $('#characterCount'), generationSettings: $('#generationSettings'), generateButton: $('#generateButton'),
  generateButtonText: $('#generateButtonText'), tagSearchInput: $('#tagSearchInput'), searchForm: $('#searchForm'),
  searchResults: $('#searchResults'), tagCountLabel: $('#tagCountLabel'), promptOutput: $('#promptOutput'), promptEmpty: $('#promptEmpty'),
  promptGroups: $('#promptGroups'), copyButton: $('#copyButton'), clearButton: $('#clearButton'), analysisStrip: $('#analysisStrip'),
  analysisSource: $('#analysisSource'), analysisSummary: $('#analysisSummary'), extractedCount: $('#extractedCount'),
  chips: $('#chips'), chipsEmpty: $('#chipsEmpty'), manualAddForm: $('#manualAddForm'), manualTagInput: $('#manualTagInput'),
  manualWeightInput: $('#manualWeightInput'), toast: $('#toast'), modelStatusButton: $('#modelStatusButton'),
  modelStatusDot: $('#modelStatusDot'), modelStatusText: $('#modelStatusText'), modelDialog: $('#modelDialog'),
  modelStatusGrid: $('#modelStatusGrid'), generalThreshold: $('#generalThreshold'), characterThreshold: $('#characterThreshold'),
  generalValue: $('#generalValue'), characterValue: $('#characterValue'),
};

let toastTimer;
function showToast(message, type = 'info') {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', type === 'error');
  elements.toast.classList.add('show');
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2800);
}

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase().trim().replaceAll('-', '_').replaceAll(/\s+/g, '_').replaceAll(/_+/g, '_').replace(/^_|_$/g, '');
}

function setMode(mode) {
  state.mode = mode;
  elements.tabs.forEach(tab => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  elements.dropZone.classList.toggle('hidden', mode !== 'image');
  elements.textPane.classList.toggle('hidden', mode !== 'text');
  elements.generationSettings.classList.toggle('hidden', mode !== 'image');
  elements.generateButtonText.textContent = mode === 'image' ? '정적판 이미지 기능 안내' : '설명에서 프롬프트 생성';
}

function clearImage() {
  state.imageData = '';
  state.imageFileName = '';
  elements.imageInput.value = '';
  elements.imagePreview.removeAttribute('src');
  elements.imagePreview.classList.add('hidden');
  elements.imageMeta.classList.add('hidden');
  elements.dropZone.classList.remove('has-image');
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readImage(file) {
  if (!file) return;
  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp'];
  if (!allowed.includes(file.type)) return showToast('PNG, JPG, WEBP, GIF 또는 BMP 이미지를 선택하세요.', 'error');
  if (file.size > 16 * 1024 * 1024) return showToast('이미지는 최대 16MB까지 미리 볼 수 있습니다.', 'error');
  const reader = new FileReader();
  reader.onload = () => {
    state.imageData = String(reader.result);
    state.imageFileName = file.name;
    elements.imagePreview.src = state.imageData;
    elements.imagePreview.classList.remove('hidden');
    elements.imageName.textContent = `${file.name} · ${formatBytes(file.size)}`;
    elements.imageMeta.classList.remove('hidden');
    elements.dropZone.classList.add('has-image');
  };
  reader.onerror = () => showToast('이미지를 읽을 수 없습니다.', 'error');
  reader.readAsDataURL(file);
}

function formatTag(tag) {
  const plain = tag.name.replaceAll('_', ' ');
  return tag.weight ? `(${plain}:${Number(tag.weight).toFixed(1).replace(/\.0$/, '')})` : plain;
}

function totalTags() {
  return state.groups.reduce((sum, group) => sum + group.tags.length, 0) + state.tailTags.length;
}

function promptText() {
  const lines = state.groups.filter(group => group.tags.length).map(group => group.tags.map(formatTag).join(', '));
  if (state.tailTags.length) {
    const tail = state.tailTags.map(formatTag).join(', ');
    if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}, ${tail}`;
    else lines.push(tail);
  }
  return lines.map((line, index) => index < lines.length - 1 ? `${line},` : line).join('\n\n');
}

function makeChip(tag, removeAction, weightAction, title) {
  const wrap = document.createElement('div');
  wrap.className = 'chip-wrap';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'chip-remove';
  remove.title = title;
  remove.textContent = formatTag(tag);
  if (tag.score && tag.score < 1) {
    const score = document.createElement('span');
    score.className = 'chip-confidence';
    score.textContent = `${Math.round(tag.score * 100)}%`;
    remove.append(score);
  }
  remove.addEventListener('click', removeAction);
  const weight = document.createElement('button');
  weight.type = 'button';
  weight.className = 'chip-weight';
  weight.textContent = tag.weight ? `${tag.weight}×` : '1.0×';
  weight.title = '가중치 편집';
  weight.addEventListener('click', weightAction);
  wrap.append(remove, weight);
  return wrap;
}

function renderResults() {
  const count = totalTags();
  elements.promptEmpty.classList.toggle('hidden', count > 0);
  elements.promptGroups.classList.toggle('hidden', count === 0);
  elements.copyButton.disabled = count === 0;
  elements.clearButton.disabled = count === 0;
  elements.extractedCount.textContent = count ? `${count}개` : '';
  elements.chipsEmpty.classList.toggle('hidden', count > 0);
  elements.promptGroups.textContent = count ? promptText() : '';
  PromptFormats.render(state.groups, state.tailTags, count);

  const nodes = [];
  state.groups.forEach((group, groupIndex) => group.tags.forEach((tag, tagIndex) => {
    nodes.push(makeChip(
      tag,
      () => { state.groups[groupIndex].tags.splice(tagIndex, 1); renderResults(); },
      () => editWeight(tag),
      `${group.name}에서 제거`,
    ));
  }));
  state.tailTags.forEach((tag, tagIndex) => {
    nodes.push(makeChip(
      tag,
      () => { state.tailTags.splice(tagIndex, 1); renderResults(); },
      () => editWeight(tag),
      '프롬프트 마지막에서 제거',
    ));
  });
  elements.chips.querySelectorAll('.chip-wrap').forEach(node => node.remove());
  elements.chips.append(...nodes);

  elements.analysisStrip.classList.toggle('hidden', !state.analysisMeta || count === 0);
  if (state.analysisMeta && count) {
    elements.analysisSource.textContent = 'TEXT ANALYSIS';
    elements.analysisSummary.textContent = state.analysisMeta.summary;
  }
}

function editWeight(tag) {
  const raw = window.prompt('가중치를 0.1에서 2.0 사이로 입력하세요. 비우면 기본값으로 돌아갑니다.', tag.weight || '1.0');
  if (raw === null) return;
  if (!raw.trim() || Number(raw) === 1) tag.weight = null;
  else {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0.1 || value > 2) return showToast('가중치는 0.1에서 2.0 사이여야 합니다.', 'error');
    tag.weight = Math.round(value * 10) / 10;
  }
  renderResults();
}

function groupFor(name) {
  const known = TAG_MAP.get(name);
  if (known && GROUP_ORDER[known.groupIndex]) return GROUP_ORDER[known.groupIndex];
  if (/^(1boy|1girl|1other)$/.test(name)) return '대상';
  if (/^(solo|multiple_|\d+(boys?|girls?|others?))/.test(name)) return '인원수';
  if (name.includes('background') || /^(outdoors|indoors|city|street|forest|room|beach|sky|scenery|landscape|night|day)$/.test(name)) return '배경';
  if (/(upper_body|full_body|close_up|looking_at_viewer|from_)/.test(name)) return '카메라 구도';
  if (/(masterpiece|quality|highres|absurdres)/.test(name)) return '퀄리티 태그';
  return '대상';
}

function groupTags(tags) {
  const groups = GROUP_ORDER.map(name => ({ name, tags: [] }));
  const seen = new Set();
  tags.forEach(tag => {
    if (!tag.name || seen.has(tag.name)) return;
    seen.add(tag.name);
    const group = groups.find(item => item.name === groupFor(tag.name)) || groups[0];
    group.tags.push(tag);
  });
  return groups;
}

function analyzeText(text) {
  const source = String(text || '').normalize('NFKC').trim();
  const lowered = source.toLowerCase();
  const scores = new Map();
  const weights = new Map();
  const add = (name, score) => {
    const normalized = normalize(name);
    if (!TAG_MAP.has(normalized)) return;
    scores.set(normalized, Math.max(scores.get(normalized) || 0, score));
  };

  for (const match of lowered.matchAll(/\(([^():]+):([0-9]+(?:\.[0-9]+)?)\)/g)) {
    const name = normalize(match[1]);
    if (TAG_MAP.has(name)) {
      weights.set(name, Math.max(0.1, Math.min(Number(match[2]), 2)));
      add(name, 1);
    }
  }

  for (const [phrase, names] of SORTED_ALIASES) {
    if (phrase && lowered.includes(phrase)) names.forEach(name => add(name, 0.96));
  }

  lowered.split(/[,;\n]+/).map(piece => piece.trim()).filter(Boolean).forEach(fragment => {
    const direct = normalize(fragment.replace(/\([^)]*\)/g, ''));
    if (TAG_MAP.has(direct)) add(direct, 0.99);
  });

  const words = lowered.match(/[a-z0-9]+(?:-[a-z0-9]+)?/g) || [];
  for (let width = 5; width >= 1; width -= 1) {
    for (let start = 0; start <= words.length - width; start += 1) {
      const candidate = normalize(words.slice(start, start + width).join(' '));
      if (TAG_MAP.has(candidate)) add(candidate, width > 1 ? 0.88 : 0.72);
    }
  }

  if ((scores.has('1boy') || scores.has('1girl')) && !['solo', '2boys', '2girls', 'multiple_boys', 'multiple_girls'].some(name => scores.has(name))) add('solo', 0.72);

  const tags = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (TAG_MAP.get(b[0])?.count || 0) - (TAG_MAP.get(a[0])?.count || 0))
    .map(([name, score]) => ({ name, score, weight: weights.get(name) || null }));
  return groupTags(tags);
}

function generatePrompt() {
  if (state.mode === 'image') {
    showToast('GitHub 정적판은 이미지 미리보기만 지원합니다. 이미지 AI 분석은 전체 로컬 앱을 사용하세요.', 'error');
    return;
  }
  const text = elements.textInput.value.trim();
  if (!text) return showToast('생성하고 싶은 이미지를 설명하세요.', 'error');
  state.groups = analyzeText(text);
  state.tailTags = [];
  state.analysisMeta = { summary: '내장 태그 인덱스와 로컬 구문 규칙으로 분석됨' };
  renderResults();
  showToast(`프롬프트를 생성했습니다 · ${totalTags()}개 태그`);
}

function addTag(name, weight = null, appendToEnd = false) {
  const normalized = normalize(name);
  if (!normalized) return;
  if (state.groups.some(group => group.tags.some(tag => tag.name === normalized)) || state.tailTags.some(tag => tag.name === normalized)) return showToast('이미 포함된 태그입니다.');
  const tag = { name: normalized, score: 1, weight };
  if (appendToEnd) state.tailTags.push(tag);
  else {
    const group = state.groups.find(item => item.name === groupFor(normalized)) || state.groups[0];
    group.tags.push(tag);
  }
  state.analysisMeta ||= { summary: '직접 편집한 프롬프트' };
  renderResults();
  if (appendToEnd) requestAnimationFrame(() => { elements.promptOutput.scrollTop = elements.promptOutput.scrollHeight; });
}

function formatCount(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count || 0);
}

function searchTags(query) {
  const raw = String(query || '').normalize('NFKC').trim().toLowerCase();
  if (!raw) { elements.searchResults.replaceChildren(); return; }
  const q = normalize(raw);
  const aliasNames = new Set(ALIASES[raw] || []);
  const ranked = [];
  for (const tag of TAGS) {
    let score = 0;
    if (tag.name === q) score = 5;
    else if (aliasNames.has(tag.name)) score = 4;
    else if (tag.name.startsWith(q)) score = 3.5;
    else if (tag.name.includes(q)) score = 2.5;
    if (score) ranked.push({ ...tag, score: score + Math.min(tag.count / 5_000_000, 0.8) });
  }
  ranked.sort((a, b) => b.score - a.score || b.count - a.count || a.name.localeCompare(b.name));
  const results = ranked.slice(0, 20);
  if (!results.length) {
    elements.searchResults.innerHTML = '<div class="search-empty">일치하는 태그가 없습니다.</div>';
    return;
  }
  elements.searchResults.replaceChildren(...results.map(result => {
    const row = document.createElement('div');
    row.className = 'search-result';
    const code = document.createElement('code');
    code.textContent = result.name;
    const meta = document.createElement('span');
    meta.className = 'result-meta';
    meta.textContent = `${CATEGORY_LABELS[result.category] || 'general'} · ${formatCount(result.count)}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '＋ 추가';
    button.addEventListener('click', () => addTag(result.name, null, true));
    const description = document.createElement('p');
    description.textContent = `${GROUP_ORDER[result.groupIndex] || '대상'} · ${result.name.replaceAll('_', ' ')}`;
    row.append(code, meta, button, description);
    return row;
  }));
}

async function copyPrompt() {
  const text = promptText();
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.append(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
  elements.copyButton.textContent = '복사됨';
  elements.copyButton.classList.add('copied');
  setTimeout(() => { elements.copyButton.textContent = '전체 복사'; elements.copyButton.classList.remove('copied'); }, 1100);
}

function clearResults() {
  state.groups = GROUP_ORDER.map(name => ({ name, tags: [] }));
  state.tailTags = [];
  state.analysisMeta = null;
  renderResults();
}

function showStaticStatus() {
  elements.modelStatusDot.className = 'status-dot warning';
  elements.modelStatusText.textContent = 'GitHub 정적판 · 텍스트 모드';
  elements.tagCountLabel.textContent = `${TAGS.length.toLocaleString()} TAGS · EMBEDDED`;
  const rows = [
    ['실행 방식', '단일 HTML', true],
    ['태그 인덱스', `${TAGS.length.toLocaleString()}개`, true],
    ['텍스트 분석', '브라우저 내부', true],
    ['이미지 미리보기', '지원', true],
    ['이미지 AI 분석', '전체 로컬 앱 필요', false],
    ['외부 요청', '사용하지 않음', true],
    ['입력 저장', '저장하지 않음', true],
  ];
  elements.modelStatusGrid.replaceChildren(...rows.flatMap(([label, value, ok]) => {
    const a = document.createElement('span'); a.textContent = label;
    const b = document.createElement('span'); b.textContent = value; b.className = ok ? 'status-yes' : 'status-no';
    return [a, b];
  }));
}

elements.tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
elements.imageInput.addEventListener('change', event => readImage(event.target.files[0]));
elements.removeImageButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); clearImage(); });
['dragenter', 'dragover'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove('dragging'); }));
elements.dropZone.addEventListener('drop', event => readImage(event.dataTransfer.files[0]));
elements.textInput.addEventListener('input', () => { elements.characterCount.textContent = String(elements.textInput.value.length); });
elements.generalThreshold.addEventListener('input', () => { elements.generalValue.textContent = Number(elements.generalThreshold.value).toFixed(2); });
elements.characterThreshold.addEventListener('input', () => { elements.characterValue.textContent = Number(elements.characterThreshold.value).toFixed(2); });
elements.generateButton.addEventListener('click', generatePrompt);
elements.copyButton.addEventListener('click', copyPrompt);
elements.clearButton.addEventListener('click', clearResults);
elements.searchForm.addEventListener('submit', event => { event.preventDefault(); searchTags(elements.tagSearchInput.value); });
let searchDebounce;
elements.tagSearchInput.addEventListener('input', () => { clearTimeout(searchDebounce); searchDebounce = setTimeout(() => searchTags(elements.tagSearchInput.value), 160); });
const searchPlaceholder = elements.tagSearchInput.placeholder;
elements.tagSearchInput.addEventListener('focus', () => { elements.tagSearchInput.placeholder = ''; });
elements.tagSearchInput.addEventListener('blur', () => { if (!elements.tagSearchInput.value) elements.tagSearchInput.placeholder = searchPlaceholder; });
elements.manualAddForm.addEventListener('submit', event => {
  event.preventDefault();
  const weight = elements.manualWeightInput.value ? Number(elements.manualWeightInput.value) : null;
  if (weight !== null && (!Number.isFinite(weight) || weight < 0.1 || weight > 2)) return showToast('가중치는 0.1에서 2.0 사이여야 합니다.', 'error');
  addTag(elements.manualTagInput.value, weight, false);
  elements.manualTagInput.value = '';
  elements.manualWeightInput.value = '';
});
elements.modelStatusButton.addEventListener('click', () => elements.modelDialog.showModal());

setMode('image');
renderResults();
showStaticStatus();
