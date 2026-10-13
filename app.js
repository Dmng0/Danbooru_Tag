'use strict';

const GROUP_ORDER = ['대상','인원수','머리 색상','머리 스타일','앞머리 스타일','눈 색상','눈매 스타일','피부 스타일','신체 스타일','표정','의상','자세','배경','카메라 구도','그림체 스타일','빛 스타일','퀄리티 태그'];
const state = {
  mode: 'image',
  imageData: '',
  imageFileName: '',
  groups: GROUP_ORDER.map(name => ({ name, tags: [] })),
  tailTags: [],
  status: null,
  analysisMeta: null,
};

const $ = selector => document.querySelector(selector);
const elements = {
  tabs: [...document.querySelectorAll('.tab')], dropZone: $('#dropZone'), imageInput: $('#imageInput'),
  imagePreview: $('#imagePreview'), imageMeta: $('#imageMeta'), imageName: $('#imageName'), dropContent: $('#dropContent'),
  removeImageButton: $('#removeImageButton'), textPane: $('#textPane'), textInput: $('#textInput'), characterCount: $('#characterCount'),
  generationSettings: $('#generationSettings'),
  generalThreshold: $('#generalThreshold'), characterThreshold: $('#characterThreshold'), generalValue: $('#generalValue'), characterValue: $('#characterValue'),
  generateButton: $('#generateButton'), generateButtonText: $('#generateButtonText'), tagSearchInput: $('#tagSearchInput'), searchForm: $('#searchForm'),
  searchResults: $('#searchResults'), tagCountLabel: $('#tagCountLabel'), promptOutput: $('#promptOutput'), promptEmpty: $('#promptEmpty'), promptGroups: $('#promptGroups'),
  copyButton: $('#copyButton'), clearButton: $('#clearButton'), analysisStrip: $('#analysisStrip'), analysisSource: $('#analysisSource'),
  analysisSummary: $('#analysisSummary'), extractedCount: $('#extractedCount'), chips: $('#chips'), chipsEmpty: $('#chipsEmpty'),
  manualAddForm: $('#manualAddForm'), manualTagInput: $('#manualTagInput'), manualWeightInput: $('#manualWeightInput'), toast: $('#toast'),
  modelStatusButton: $('#modelStatusButton'), modelStatusDot: $('#modelStatusDot'), modelStatusText: $('#modelStatusText'),
  modelDialog: $('#modelDialog'), modelStatusGrid: $('#modelStatusGrid'),
};

let toastTimer;
function showToast(message, type = 'info') {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', type === 'error');
  elements.toast.classList.add('show');
  toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({ error: '로컬 서버 응답을 읽을 수 없습니다.' }));
  if (!response.ok) {
    const error = new Error(data.error || `로컬 서버 오류 (${response.status})`);
    error.code = data.code;
    throw error;
  }
  return data;
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
  elements.generateButtonText.textContent = mode === 'image' ? '이미지에서 프롬프트 생성' : '설명에서 프롬프트 생성';
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

function readImage(file) {
  if (!file) return;
  const allowed = ['image/png','image/jpeg','image/webp','image/gif','image/bmp'];
  if (!allowed.includes(file.type)) return showToast('PNG, JPG, WEBP, GIF 또는 BMP 이미지를 선택하세요.', 'error');
  if (file.size > 16 * 1024 * 1024) return showToast('이미지는 최대 16MB까지 사용할 수 있습니다.', 'error');
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

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function setGenerating(active) {
  elements.generateButton.disabled = active;
  elements.generateButtonText.textContent = active ? '로컬에서 분석 중…' : (state.mode === 'image' ? '이미지에서 프롬프트 생성' : '설명에서 프롬프트 생성');
}

function totalTags() {
  return state.groups.reduce((sum, group) => sum + group.tags.length, 0) + state.tailTags.length;
}

function formatTag(tag) {
  const plain = tag.name.replaceAll('_', ' ');
  return tag.weight ? `(${plain}:${Number(tag.weight).toFixed(1).replace(/\.0$/, '')})` : plain;
}

function promptText() {
  const lines = state.groups
    .filter(group => group.tags.length)
    .map(group => group.tags.map(formatTag).join(', '));
  if (state.tailTags.length) {
    const tail = state.tailTags.map(formatTag).join(', ');
    if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]}, ${tail}`;
    else lines.push(tail);
  }
  return lines.map((line, index) => index < lines.length - 1 ? `${line},` : line).join('\n\n');
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

  const chipNodes = [];
  state.groups.forEach((group, groupIndex) => group.tags.forEach((tag, tagIndex) => {
    const wrap = document.createElement('div');
    wrap.className = 'chip-wrap';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-remove';
    remove.title = `${group.name}에서 제거`;
    remove.textContent = formatTag(tag);
    if (tag.score && tag.score < 1) {
      const score = document.createElement('span');
      score.className = 'chip-confidence';
      score.textContent = `${Math.round(tag.score * 100)}%`;
      remove.append(score);
    }
    remove.addEventListener('click', () => {
      state.groups[groupIndex].tags.splice(tagIndex, 1);
      renderResults();
    });
    const weight = document.createElement('button');
    weight.type = 'button';
    weight.className = 'chip-weight';
    weight.textContent = tag.weight ? `${tag.weight}×` : '1.0×';
    weight.title = '가중치 편집';
    weight.addEventListener('click', () => editWeight(groupIndex, tagIndex));
    wrap.append(remove, weight);
    chipNodes.push(wrap);
  }));
  state.tailTags.forEach((tag, tagIndex) => {
    const wrap = document.createElement('div');
    wrap.className = 'chip-wrap';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chip-remove';
    remove.title = '프롬프트 마지막에서 제거';
    remove.textContent = formatTag(tag);
    remove.addEventListener('click', () => {
      state.tailTags.splice(tagIndex, 1);
      renderResults();
    });
    const weight = document.createElement('button');
    weight.type = 'button';
    weight.className = 'chip-weight';
    weight.textContent = tag.weight ? `${tag.weight}×` : '1.0×';
    weight.title = '가중치 편집';
    weight.addEventListener('click', () => editTailWeight(tagIndex));
    wrap.append(remove, weight);
    chipNodes.push(wrap);
  });
  elements.chips.querySelectorAll('.chip-wrap').forEach(node => node.remove());
  elements.chips.append(...chipNodes);

  elements.analysisStrip.classList.toggle('hidden', !state.analysisMeta || count === 0);
  if (state.analysisMeta && count) {
    elements.analysisSource.textContent = state.analysisMeta.source === 'image' ? 'IMAGE ANALYSIS' : 'TEXT ANALYSIS';
    elements.analysisSummary.textContent = state.analysisMeta.summary || `${count}개 태그 · 로컬 처리 완료`;
  }
}

function editWeight(groupIndex, tagIndex) {
  const tag = state.groups[groupIndex].tags[tagIndex];
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

function editTailWeight(tagIndex) {
  const tag = state.tailTags[tagIndex];
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

async function generatePrompt() {
  if (state.mode === 'image' && !state.imageData) return showToast('분석할 이미지를 먼저 선택하세요.', 'error');
  const text = elements.textInput.value.trim();
  if (state.mode === 'text' && !text) return showToast('생성하고 싶은 이미지를 설명하세요.', 'error');
  setGenerating(true);
  try {
    let result;
    if (state.mode === 'image') {
      result = await api('/api/analyze-image', {
        method: 'POST',
        body: JSON.stringify({
          image: state.imageData,
          general_threshold: Number(elements.generalThreshold.value),
          character_threshold: Number(elements.characterThreshold.value),
        }),
      });
      state.analysisMeta = { source: 'image', summary: `${result.detected}개 태그 · 일반 ${result.thresholds.general} / 캐릭터 ${result.thresholds.character}` };
    } else {
      result = await api('/api/analyze-text', { method: 'POST', body: JSON.stringify({ text }) });
      state.analysisMeta = { source: 'text', summary: '로컬 태그 사전과 구문 규칙으로 분석됨' };
    }
    state.groups = normalizeGroups(result.groups);
    state.tailTags = [];
    renderResults();
    showToast(`프롬프트를 생성했습니다 · ${totalTags()}개 태그`);
  } catch (error) {
    showToast(error.message, 'error');
    if (error.code === 'MODEL_UNAVAILABLE') elements.modelDialog.showModal();
  } finally {
    setGenerating(false);
  }
}

function normalizeGroups(groups) {
  const byName = new Map((groups || []).map(group => [group.name, group.tags || []]));
  return GROUP_ORDER.map(name => ({ name, tags: byName.get(name) || [] }));
}

function addTag(name, weight = null, score = 1, appendToEnd = false) {
  const normalized = name.trim().toLowerCase().replaceAll(/\s+/g, '_');
  if (!normalized) return;
  if (state.groups.some(group => group.tags.some(tag => tag.name === normalized)) || state.tailTags.some(tag => tag.name === normalized)) return showToast('이미 포함된 태그입니다.');
  const tag = { name: normalized, display: normalized.replaceAll('_',' '), score, weight };
  if (appendToEnd) state.tailTags.push(tag);
  else {
    const target = classifyClient(normalized);
    const group = state.groups.find(item => item.name === target) || state.groups[0];
    group.tags.push(tag);
  }
  state.analysisMeta ||= { source: 'text', summary: '직접 편집한 프롬프트' };
  renderResults();
  if (appendToEnd) {
    requestAnimationFrame(() => {
      elements.promptOutput.scrollTop = elements.promptOutput.scrollHeight;
    });
  }
}

function classifyClient(name) {
  if (/^(solo|multiple_|\d+(boys?|girls?))/.test(name)) return name === '1boy' || name === '1girl' ? '대상' : '인원수';
  if (/_(hair)$/.test(name) && /^(black|brown|blonde|white|silver|grey|gray|blue|red|pink|green|purple|orange|aqua|yellow)_/.test(name)) return '머리 색상';
  if (name.includes('bangs')) return '앞머리 스타일';
  if (name.endsWith('_eyes')) return '눈 색상';
  if (/(shirt|pants|dress|skirt|uniform|jacket|coat|suit|jeans|shoes|boots)/.test(name)) return '의상';
  if (/(standing|sitting|lying|walking|running|kneeling|pose)/.test(name)) return '자세';
  if (name.includes('background') || /^(outdoors|indoors|city|street|forest|room|beach|sky|scenery|landscape|night|day)$/.test(name)) return '배경';
  if (/(upper_body|full_body|close-up|looking_at_viewer|from_)/.test(name)) return '카메라 구도';
  if (/(lighting|light|shadow|backlight)/.test(name)) return '빛 스타일';
  if (/(masterpiece|quality|highres|absurdres)/.test(name)) return '퀄리티 태그';
  if (/(sketch|lineart|watercolor|painting|pixel_art|monochrome|realistic)/.test(name)) return '그림체 스타일';
  if (/(smile|grin|blush|cry|angry|wink|expression)/.test(name)) return '표정';
  if (name.includes('hair')) return '머리 스타일';
  return '대상';
}

async function searchTags(query) {
  if (!query.trim()) {
    elements.searchResults.replaceChildren();
    return;
  }
  elements.searchResults.innerHTML = '<div class="search-loading">로컬 인덱스 검색 중…</div>';
  try {
    const data = await api(`/api/tags?q=${encodeURIComponent(query)}&limit=20`, { headers: {} });
    if (!data.results.length) {
      elements.searchResults.innerHTML = '<div class="search-empty">일치하는 태그가 없습니다.</div>';
      return;
    }
    elements.searchResults.replaceChildren(...data.results.map(result => {
      const row = document.createElement('div');
      row.className = 'search-result';
      const code = document.createElement('code'); code.textContent = result.name;
      const meta = document.createElement('span'); meta.className = 'result-meta'; meta.textContent = `${result.type} · ${formatCount(result.count)}`;
      const add = document.createElement('button'); add.type = 'button'; add.textContent = '＋ 추가'; add.addEventListener('click', () => addTag(result.name, null, 1, true));
      const desc = document.createElement('p'); desc.textContent = result.description;
      row.append(code, meta, add, desc);
      return row;
    }));
  } catch (error) {
    elements.searchResults.innerHTML = `<div class="search-empty">${escapeHtml(error.message)}</div>`;
  }
}

function formatCount(count) {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(count || 0);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

async function copyPrompt() {
  try {
    await navigator.clipboard.writeText(promptText());
    elements.copyButton.textContent = '복사됨';
    elements.copyButton.classList.add('copied');
    setTimeout(() => { elements.copyButton.textContent = '전체 복사'; elements.copyButton.classList.remove('copied'); }, 1100);
  } catch {
    showToast('클립보드에 복사할 수 없습니다.', 'error');
  }
}

function clearResults() {
  state.groups = GROUP_ORDER.map(name => ({ name, tags: [] }));
  state.tailTags = [];
  state.analysisMeta = null;
  renderResults();
}

async function refreshStatus() {
  try {
    state.status = await api('/api/status', { headers: {} });
    elements.tagCountLabel.textContent = `${state.status.tag_count.toLocaleString()} TAGS · OFFLINE`;
    elements.modelStatusDot.className = `status-dot${state.status.ready ? '' : ' warning'}`;
    elements.modelStatusText.textContent = state.status.ready ? '이미지 모델 준비됨' : '텍스트 모드 준비됨 · 이미지 모델 미설치';
    const rows = [
      ['로컬 서버', state.status.local_only ? '127.0.0.1 전용' : '확인 필요', state.status.local_only],
      ['태그 인덱스', `${state.status.tag_count.toLocaleString()}개`, state.status.tag_count > 0],
      ['ONNX Runtime', state.status.onnxruntime_available ? '설치됨' : '미설치', state.status.onnxruntime_available],
      ['이미지 모델', state.status.model_installed ? formatBytes(state.status.model_bytes) : '미설치', state.status.model_installed],
      ['입력 저장', state.status.stores_inputs ? '저장함' : '저장하지 않음', !state.status.stores_inputs],
      ['외부 요청', state.status.external_requests ? '사용함' : '사용하지 않음', !state.status.external_requests],
    ];
    elements.modelStatusGrid.replaceChildren(...rows.flatMap(([label, value, ok]) => {
      const a = document.createElement('span'); a.textContent = label;
      const b = document.createElement('span'); b.textContent = value; b.className = ok ? 'status-yes' : 'status-no';
      return [a,b];
    }));
  } catch {
    elements.modelStatusDot.className = 'status-dot error';
    elements.modelStatusText.textContent = '로컬 서버 연결 오류';
  }
}

elements.tabs.forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
elements.imageInput.addEventListener('change', event => readImage(event.target.files[0]));
elements.removeImageButton.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); clearImage(); });
['dragenter','dragover'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.add('dragging'); }));
['dragleave','drop'].forEach(type => elements.dropZone.addEventListener(type, event => { event.preventDefault(); elements.dropZone.classList.remove('dragging'); }));
elements.dropZone.addEventListener('drop', event => readImage(event.dataTransfer.files[0]));
elements.textInput.addEventListener('input', () => elements.characterCount.textContent = String(elements.textInput.value.length));
elements.generalThreshold.addEventListener('input', () => elements.generalValue.textContent = Number(elements.generalThreshold.value).toFixed(2));
elements.characterThreshold.addEventListener('input', () => elements.characterValue.textContent = Number(elements.characterThreshold.value).toFixed(2));
elements.generateButton.addEventListener('click', generatePrompt);
elements.copyButton.addEventListener('click', copyPrompt);
elements.clearButton.addEventListener('click', clearResults);
elements.searchForm.addEventListener('submit', event => { event.preventDefault(); searchTags(elements.tagSearchInput.value); });
let searchDebounce;
elements.tagSearchInput.addEventListener('input', () => { clearTimeout(searchDebounce); searchDebounce = setTimeout(() => searchTags(elements.tagSearchInput.value), 220); });
const searchPlaceholder = elements.tagSearchInput.placeholder;
elements.tagSearchInput.addEventListener('focus', () => elements.tagSearchInput.placeholder = '');
elements.tagSearchInput.addEventListener('blur', () => { if (!elements.tagSearchInput.value) elements.tagSearchInput.placeholder = searchPlaceholder; });
elements.manualAddForm.addEventListener('submit', event => {
  event.preventDefault();
  const weight = elements.manualWeightInput.value ? Number(elements.manualWeightInput.value) : null;
  if (weight !== null && (!Number.isFinite(weight) || weight < 0.1 || weight > 2)) return showToast('가중치는 0.1에서 2.0 사이여야 합니다.', 'error');
  addTag(elements.manualTagInput.value, weight);
  elements.manualTagInput.value = '';
  elements.manualWeightInput.value = '';
});
elements.modelStatusButton.addEventListener('click', () => elements.modelDialog.showModal());

setMode('image');
renderResults();
refreshStatus();
