'use strict';

const GROUP_ORDER = __GROUPS__;
const ALIASES = __ALIASES__;
const TAG_ROWS = __TAG_ROWS__;
const CATEGORY_LABELS = { '-1': 'prompt', '0': 'general', '4': 'character', '9': 'rating' };
const TAGS = TAG_ROWS.map(([name, category, count, groupIndex]) => ({ name, category, count, groupIndex }));
const TAG_MAP = new Map(TAGS.map(tag => [tag.name, tag]));
// Text analysis stays local. Remote search results never become prose match rules.
const EXTRA_ALIASES = {
  '성인 남성': ['1boy'], '성인 여성': ['1girl'], '남자 두 명': ['2boys'], '여자 두 명': ['2girls'],
  '두 남성': ['2boys'], '두 여성': ['2girls'], '남녀 한 명씩': ['1boy', '1girl'],
  '미소 짓': ['smile'], '미소짓': ['smile'], '웃고 있': ['smile'], '웃으며': ['smile'], '웃는': ['smile'],
  '활짝 웃': ['grin'], '슬픈': ['sad'], '슬퍼': ['sad'], '놀란': ['surprised'], '놀라': ['surprised'],
  '화난': ['angry'], '찡그린': ['frown'], '진지한': ['serious'], '눈물': ['tears'], '수줍': ['blush'],
  '눈을 감': ['closed_eyes'], '눈 감': ['closed_eyes'], '입을 벌': ['open_mouth'], '입을 다문': ['closed_mouth'],
  '앉아': ['sitting'], '앉은': ['sitting'], '서서': ['standing'], '서있는': ['standing'], '선 채': ['standing'],
  '걷고': ['walking'], '걸어가': ['walking'], '걸으며': ['walking'], '달리고': ['running'], '뛰는': ['running'],
  '뛰어가': ['running'], '누워': ['lying'], '누운': ['lying'], '무릎을 꿇': ['kneeling'],
  '춤추': ['dancing'], '춤을 추': ['dancing'], '점프': ['jumping'], '팔을 올': ['arms_up'],
  '팔을 들': ['arms_up'], '손을 흔': ['waving'], '뒤돌아': ['looking_back'], '뒤를 돌아': ['looking_back'],
  '우산을 들': ['holding_umbrella'], '책을 읽': ['reading'], '안경': ['glasses'], '장갑': ['gloves'],
  '운동화': ['sneakers'], '부츠': ['boots'], '넥타이': ['necktie'], '모자': ['hat'], '긴 소매': ['long_sleeves'],
  '반소매': ['short_sleeves'], '반팔': ['short_sleeves'], '긴팔': ['long_sleeves'],
  '치마': ['skirt'], '자켓': ['jacket'], '재킷': ['jacket'], '코트': ['coat'], '후드티': ['hoodie'],
  '머리를 묶': ['ponytail'], '곱슬머리': ['curly_hair'], '웨이브 머리': ['wavy_hair'], '앞머리': ['bangs'],
  '주근깨': ['freckles'], '흉터': ['scar'], '수염': ['facial_hair'], '문신': ['tattoo'],
  '창백한': ['pale_skin'], '어두운 피부': ['dark_skin'], '검은 피부': ['dark_skin'],
  '카메라를 보': ['looking_at_viewer'], '카메라를 바라': ['looking_at_viewer'], '정면을 바라': ['looking_at_viewer'],
  '뒤에서 본': ['from_behind'], '뒷모습': ['from_behind'], '옆모습': ['from_side'],
  '낮은 앵글': ['from_below'], '높은 앵글': ['from_above'], '로우앵글': ['from_below'], '하이앵글': ['from_above'],
  '얼굴을 가까이': ['close_up'], '전신샷': ['full_body'], '상반신샷': ['upper_body'],
  '숲속': ['forest'], '숲에서': ['forest'], '숲 속': ['forest'], '거리에서': ['street'],
  '도시': ['city'], '바닷가': ['beach'], '밤하늘': ['night', 'sky'], '석양': ['sunset'], '노을': ['sunset'],
  '햇빛': ['sunlight'], '햇살': ['sunlight'], '달빛': ['moonlight'], '네온': ['neon_lights'],
  'smiling': ['smile'], 'smiles': ['smile'], 'grinning': ['grin'], 'frowning': ['frown'],
  'looking at the camera': ['looking_at_viewer'], 'looking at the viewer': ['looking_at_viewer'],
  'wearing a white shirt': ['white_shirt'], 'holding an umbrella': ['holding_umbrella'],
  'arms raised': ['arms_up'], 'low angle': ['from_below'], 'high angle': ['from_above'],
  'short messy black hair': ['short_hair', 'messy_hair', 'black_hair'],
};
const TEXT_ALIASES = { ...ALIASES, ...EXTRA_ALIASES };
delete TEXT_ALIASES['두 명']; // A count alone does not establish gender.
const SORTED_ALIASES = Object.entries(TEXT_ALIASES).sort((a, b) => b[0].length - a[0].length);
const GROUP_OVERRIDES = new Map();
const groupOverrides = {
  '표정': ['smile', 'grin', 'sad', 'serious', 'angry', 'frown', 'crying', 'tears', 'blush', 'surprised', 'expressionless', 'closed_eyes', 'open_mouth', 'closed_mouth', 'wink'],
  '자세': ['standing', 'sitting', 'walking', 'running', 'lying', 'kneeling', 'dancing', 'jumping', 'arms_up', 'waving', 'holding', 'holding_umbrella', 'reading', 'crossed_arms'],
  '카메라 구도': ['looking_back', 'looking_at_viewer', 'close_up', 'close-up', 'upper_body', 'full_body', 'cowboy_shot', 'from_above', 'from_below', 'from_side', 'from_front', 'from_behind', 'profile', 'dutch_angle'],
  '의상': ['glasses', 'gloves', 'sneakers', 'boots', 'necktie', 'hat', 'long_sleeves', 'short_sleeves', 'shirt', 'skirt', 'jacket', 'coat', 'hoodie'],
  '신체 스타일': ['freckles', 'scar', 'facial_hair', 'tattoo'],
  '배경': ['forest', 'street', 'city', 'beach', 'night', 'sky', 'sunset'],
  '빛 스타일': ['sunlight', 'moonlight', 'neon_lights'],
};
Object.entries(groupOverrides).forEach(([group, names]) => names.forEach(name => GROUP_OVERRIDES.set(normalize(name), group)));
const LOCAL_BY_NORMALIZED = new Map(TAGS.map(tag => [normalize(tag.name), tag]));
const REMOTE_TAGS = new Map();
function canonicalName(value) {
  const normalized = normalize(value);
  return REMOTE_TAGS.get(normalized)?.name || LOCAL_BY_NORMALIZED.get(normalized)?.name || normalized;
}


const state = {
  mode: 'image',
  imageData: '',
  imageFileName: '',
  groups: GROUP_ORDER.map(name => ({ name, tags: [] })),
  tailTags: [],
  analysisMeta: null,
  sourceText: '',
};

const $ = selector => document.querySelector(selector);
const elements = {
  tabs: [...document.querySelectorAll('.tab')],
  dropZone: $('#dropZone'), imageInput: $('#imageInput'), imagePreview: $('#imagePreview'), imageMeta: $('#imageMeta'),
  imageName: $('#imageName'), removeImageButton: $('#removeImageButton'), textPane: $('#textPane'), textInput: $('#textInput'),
  characterCount: $('#characterCount'), generationSettings: $('#generationSettings'), generateButton: $('#generateButton'),
  generateButtonText: $('#generateButtonText'), tagSearchInput: $('#tagSearchInput'), searchForm: $('#searchForm'),
  searchSort: $('#searchSort'), searchMinCount: $('#searchMinCount'), searchSimilarity: $('#searchSimilarity'),
  searchSimilarityValue: $('#searchSimilarityValue'), searchCategory: $('#searchCategory'), searchSummary: $('#searchSummary'),
  searchRetry: $('#searchRetry'), searchMoreRemote: $('#searchMoreRemote'),
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
  const hasOutput = count > 0 || Boolean(state.sourceText);
  elements.promptEmpty.classList.toggle('hidden', hasOutput);
  elements.promptGroups.classList.toggle('hidden', !hasOutput);
  elements.copyButton.disabled = count === 0;
  elements.clearButton.disabled = !hasOutput;
  elements.extractedCount.textContent = count ? `${count}개` : '';
  elements.chipsEmpty.classList.toggle('hidden', count > 0);
  elements.promptGroups.textContent = count ? promptText() : '인식한 태그가 없습니다. 태그 검색에서 추가해 주세요.';
  PromptFormats.render(state.groups, state.tailTags, count, state.sourceText);
  updateSearchSelection();

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

  elements.analysisStrip.classList.toggle('hidden', !state.analysisMeta || !hasOutput);
  if (state.analysisMeta && hasOutput) {
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
  const override = GROUP_OVERRIDES.get(normalize(name));
  if (override) return override;
  const known = TAG_MAP.get(name) || REMOTE_TAGS.get(normalize(name));
  if (known && GROUP_ORDER[known.groupIndex]) return GROUP_ORDER[known.groupIndex];
  if (/^(holding_|arms_|hand_on_|hands_on_|sitting_|standing_|walking_|running_)/.test(name)) return '자세';
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
  const add = (name, score, group) => {
    const known = LOCAL_BY_NORMALIZED.get(normalize(name));
    if (!known) return;
    if (group) GROUP_OVERRIDES.set(normalize(known.name), group);
    scores.set(known.name, Math.max(scores.get(known.name) || 0, score));
  };
  for (const match of lowered.matchAll(/\(([^():]+):([0-9]+(?:\.[0-9]+)?)\)/g)) {
    const name = LOCAL_BY_NORMALIZED.get(normalize(match[1]))?.name;
    if (name) {
      weights.set(name, Math.max(0.1, Math.min(Number(match[2]), 2)));
      add(name, 1);
    }
  }
  // Longest phrases first, so "two women" is not also interpreted as "one woman".
  let remaining = lowered;
  for (const [phrase, names] of SORTED_ALIASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const latin = /^[a-z0-9]/i.test(phrase);
    const regex = new RegExp(`${latin ? '(?<![a-z0-9_])' : ''}${escaped}${latin ? '(?![a-z0-9_])' : ''}`, 'gu');
    remaining = remaining.replace(regex, match => {
      names.forEach(name => add(name, 0.96));
      return ' '.repeat(match.length);
    });
  }
  // Compose color + body/clothing properties even with intervening adjectives.
  const colors = {
    black: '검은(?:색)?|검정(?:색)?|흑색', white: '흰(?:색)?|하얀(?:색)?|백색',
    brown: '갈색|밤색', blonde: '금색|금발', blue: '파란(?:색)?|푸른(?:색)?|청색',
    red: '빨간(?:색)?|붉은(?:색)?|적색', green: '초록(?:색)?|녹색',
    pink: '분홍(?:색)?|핑크', purple: '보라(?:색)?|자주색', grey: '회색|잿빛', yellow: '노란(?:색)?|황금색',
  };
  const attributes = [
    ['hair', '머리(?:카락)?|헤어', '머리 색상'], ['eyes', '눈동자|눈', '눈 색상'],
    ['shirt', '셔츠|와이셔츠', '의상'], ['pants', '바지|팬츠', '의상'], ['dress', '드레스|원피스', '의상'],
    ['skirt', '치마|스커트', '의상'], ['jacket', '재킷|자켓', '의상'], ['coat', '코트', '의상'],
    ['hoodie', '후드티|후드', '의상'], ['gloves', '장갑', '의상'], ['footwear', '신발|구두', '의상'],
  ];
  const modifiers = '(?:의|이고|이며|하고|\\s|헝클어진|흐트러진|짧은|긴|곱슬|웨이브|단정한|반짝이는|큰|작은|커다란|오버사이즈|긴팔|반팔|헐렁한|빛나는){0,35}';
  for (const [color, pattern] of Object.entries(colors)) {
    for (const [attribute, noun, group] of attributes) {
      if (new RegExp(`(?:${pattern})${modifiers}(?:${noun})`, 'u').test(lowered)) add(`${color}_${attribute}`, 0.97, group);
    }
  }
  const hairRules = [
    ['short_hair', '짧은|짧게\\s*자른'], ['long_hair', '긴|길게\\s*기른'],
    ['messy_hair', '헝클어진|흐트러진'], ['curly_hair', '곱슬'], ['wavy_hair', '웨이브'],
  ];
  for (const [name, pattern] of hairRules) {
    if (new RegExp(`(?:${pattern})(?:의|\\s|헝클어진|흐트러진|짧은|긴|곱슬|단정한|검은색?|갈색|흰색?|파란색?){0,20}(?:머리|헤어)`, 'u').test(lowered)) add(name, 0.96, '머리 스타일');
  }
  const hairColors = 'black|white|brown|blonde|blue|red|green|pink|purple|grey|silver';
  const hairDetails = 'short|long|messy|curly|wavy|straight';
  for (const color of hairColors.split('|')) {
    if (new RegExp(`\\b${color}(?:\\s+(?:${hairDetails})){0,5}\\s+hair\\b`).test(lowered)) add(`${color}_hair`, 0.96, '머리 색상');
  }
  for (const detail of hairDetails.split('|')) {
    if (new RegExp(`\\b${detail}(?:\\s+(?:${hairColors}|${hairDetails})){0,5}\\s+hair\\b`).test(lowered)) add(`${detail}_hair`, 0.96, '머리 스타일');
  }
  for (const [adjective, name] of [['긴', 'long_hair'], ['짧은', 'short_hair'], ['헝클어진', 'messy_hair']]) {
    if (new RegExp(`${adjective}\\s*(?:금발|흑발|은발|백발|적발)`).test(lowered)) add(name, 0.96, '머리 스타일');
  }
  // Explicit comma-separated names may identify characters. Prose n-grams may not.
  lowered.split(/[,;\n]+/).map(piece => piece.trim()).filter(Boolean).forEach(fragment => {
    const direct = LOCAL_BY_NORMALIZED.get(normalize(fragment));
    if (direct) add(direct.name, 0.99);
  });
  const words = lowered.match(/[a-z0-9]+(?:[-_][a-z0-9]+)*/g) || [];
  for (let width = 6; width >= 1; width -= 1) {
    for (let start = 0; start <= words.length - width; start += 1) {
      const known = LOCAL_BY_NORMALIZED.get(normalize(words.slice(start, start + width).join(' ')));
      if (known && known.category !== 4 && known.category !== 1) add(known.name, width > 1 ? 0.88 : 0.72);
    }
  }
  const people = ['1boy', '1girl', '1other'].filter(name => scores.has(name));
  const multiple = ['2boys', '2girls', 'multiple_boys', 'multiple_girls'].some(name => scores.has(name));
  if (people.length === 1 && !multiple) add('solo', 0.72);
  if (people.length > 1 || multiple) scores.delete('solo');
  if (scores.has('2boys')) scores.delete('1boy');
  if (scores.has('2girls')) scores.delete('1girl');
  return groupTags([...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (TAG_MAP.get(b[0])?.count || 0) - (TAG_MAP.get(a[0])?.count || 0))
    .map(([name, score]) => ({ name, score, weight: weights.get(name) || null })));
}

function generatePrompt() {
  if (state.mode === 'image') {
    showToast('GitHub 정적판은 이미지 미리보기만 지원합니다. 이미지 AI 분석은 전체 로컬 앱을 사용하세요.', 'error');
    return;
  }
  const text = elements.textInput.value.trim();
  if (!text) return showToast('생성하고 싶은 이미지를 설명하세요.', 'error');
  state.sourceText = text;
  state.groups = analyzeText(text);
  state.tailTags = [];
  const covered = state.groups.filter(group => group.tags.length).map(group => group.name);
  state.analysisMeta = { summary: covered.length ? `${covered.join(' · ')} / 원문 보존` : '인식한 태그 없음 · 자연어 출력에 원문 보존' };
  renderResults();
  showToast(`프롬프트를 생성했습니다 · ${totalTags()}개 태그`);
}

function addTag(name, weight = null, appendToEnd = false) {
  const normalized = canonicalName(name);
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

const SEARCH_CATEGORIES = { general: '일반', character: '캐릭터', action: '동작', composition: '구도', other: '기타' };
function searchCategory(tag) {
  if (tag.category === 4) return 'character';
  if (tag.category !== 0) return 'other';
  const group = groupFor(tag.name);
  if (group === '자세') return 'action';
  if (group === '카메라 구도') return 'composition';
  return 'general';
}

function bigrams(text) {
  const pairs = new Map();
  for (let i = 0; i < text.length - 1; i += 1) {
    const pair = text.slice(i, i + 2);
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
  }
  return pairs;
}
function searchSimilarity(query, candidate, queryPairs = bigrams(query)) {
  if (query === candidate) return 1;
  if (candidate.includes(query)) return 0.6 + 0.4 * query.length / candidate.length;
  if (query.length < 2 || candidate.length < 2) return 0;
  const candidatePairs = bigrams(candidate);
  let overlap = 0;
  for (const [pair, count] of queryPairs) overlap += Math.min(count, candidatePairs.get(pair) || 0);
  return 0.9 * (2 * overlap / (query.length + candidate.length - 2));
}

const TAG_API = 'https://shima.donmai.us/tags.json';
const remoteSearch = { key: null, query: '', tags: [], plans: [], version: 0, controller: null, loading: false, error: '', loaded: false };
const searchCache = new Map();
let searchDebounce;
let renderedSearchLimit = 60;

function queryTerms(query) {
  const aliases = SORTED_ALIASES.filter(([phrase]) => normalize(phrase) === query).flatMap(([, names]) => names);
  return [...new Set(aliases.length ? aliases.map(normalize) : [query])].slice(0, 3);
}
function searchPlans(query) {
  if (!query) return [{ parameter: null, value: '', page: 1, done: false }];
  const terms = queryTerms(query);
  const plans = terms.map(term => ({ parameter: 'name_or_alias_matches', value: `*${term.replaceAll('*', '').replaceAll('_', '*')}*` }));
  // Include word matches, so a phrase can find related tags rather than only an exact substring.
  const parts = [...new Set(terms.flatMap(term => term.split('_')).filter(part => part.length > 2))];
  parts.sort((a, b) => b.length - a.length);
  parts.slice(0, 2).forEach(part => plans.push({ parameter: 'name_or_alias_matches', value: `*${part.replaceAll('*', '')}*` }));
  if (terms[0].length > 2) plans.push({ parameter: 'fuzzy_name_matches', value: terms[0].slice(0, 100) });
  return plans.filter((plan, index) => plans.findIndex(other => other.parameter === plan.parameter && other.value === plan.value) === index)
    .slice(0, 5).map(plan => ({ ...plan, page: 1, done: false }));
}
function setSearchMessage(message) {
  elements.searchResults.replaceChildren();
  const text = document.createElement('div');
  text.className = 'search-empty';
  text.textContent = message;
  elements.searchResults.append(text);
}
function cancelSearch() {
  clearTimeout(searchDebounce);
  remoteSearch.controller?.abort();
  remoteSearch.version += 1;
  remoteSearch.loading = false;
}
function scheduleSearch() {
  cancelSearch();
  remoteSearch.key = null;
  remoteSearch.tags = [];
  remoteSearch.loaded = false;
  elements.searchSummary.textContent = '검색어 입력 중…';
  elements.searchMoreRemote.classList.add('hidden');
  setSearchMessage('잠시 후 Danbooru에서 태그를 검색합니다.');
  searchDebounce = setTimeout(() => searchTags(elements.tagSearchInput.value), 650);
}

async function searchTags(query, { append = false, force = false } = {}) {
  clearTimeout(searchDebounce);
  const q = normalize(query).slice(0, 200);
  const category = elements.searchCategory.value;
  const key = `${q}|${category}`;
  if (!append && !force && remoteSearch.key === key && remoteSearch.loaded) {
    renderSearchResults();
    return;
  }
  cancelSearch();
  const version = remoteSearch.version;
  const controller = new AbortController();
  remoteSearch.controller = controller;
  if (!append) {
    const cached = searchCache.get(key);
    if (!force && cached && Date.now() - cached.time < 60_000) {
      Object.assign(remoteSearch, { key, query: q, tags: cached.tags, plans: cached.plans.map(plan => ({ ...plan })), loaded: true, error: '' });
      renderSearchResults();
      return;
    }
    Object.assign(remoteSearch, { key, query: q, tags: [], plans: searchPlans(q), loaded: false });
  }
  remoteSearch.loading = true;
  remoteSearch.error = '';
  elements.searchMoreRemote.disabled = true;
  elements.searchRetry.classList.add('hidden');
  elements.searchResults.setAttribute('aria-busy', 'true');
  elements.searchSummary.textContent = append ? 'Danbooru에서 후보를 더 가져오는 중…' : 'Danbooru 태그 검색 중…';
  if (!append) setSearchMessage('shima.donmai.us에서 태그를 가져오고 있습니다.');
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    // Sequential requests avoid bursting the public API. Successful pages are retained on partial failure.
    for (const plan of remoteSearch.plans.filter(item => !item.done)) {
      const url = new URL(TAG_API);
      url.searchParams.set('limit', '100');
      url.searchParams.set('page', String(plan.page));
      url.searchParams.set('search[order]', plan.parameter === 'fuzzy_name_matches' ? 'similarity' : 'count');
      url.searchParams.set('search[hide_empty]', 'true');
      if (plan.parameter) url.searchParams.set(`search[${plan.parameter}]`, plan.value);
      if (category === 'character') url.searchParams.set('search[category]', '4');
      if (['general', 'action', 'composition'].includes(category)) url.searchParams.set('search[category]', '0');
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error(response.status === 429 ? '요청이 많습니다. 잠시 후 다시 검색해 주세요. (429)' : `Danbooru 응답 오류 (${response.status})`);
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.some(row => !row || typeof row.name !== 'string' || !Number.isFinite(row.category) || !Number.isFinite(row.post_count))) {
        throw new Error('태그 API가 예상과 다른 응답을 반환했습니다.');
      }
      if (version !== remoteSearch.version) return;
      const unique = new Map(remoteSearch.tags.map(tag => [tag.name, tag]));
      for (const row of rows) {
        if (row.category === 1 || row.is_deprecated || row.post_count <= 0) continue;
        const local = LOCAL_BY_NORMALIZED.get(normalize(row.name));
        const tag = { name: row.name, category: row.category, count: row.post_count, groupIndex: local?.groupIndex ?? -1 };
        REMOTE_TAGS.set(normalize(row.name), tag);
        unique.set(tag.name, tag);
      }
      remoteSearch.tags = [...unique.values()];
      plan.done = rows.length < 100;
      plan.page += 1;
    }
    remoteSearch.loaded = true;
    searchCache.set(key, { time: Date.now(), tags: remoteSearch.tags, plans: remoteSearch.plans.map(plan => ({ ...plan })) });
    if (searchCache.size > 10) searchCache.delete(searchCache.keys().next().value);
  } catch (error) {
    if (version !== remoteSearch.version) return;
    remoteSearch.error = error.name === 'AbortError' ? '연결 시간이 초과되었습니다. 다시 시도해 주세요.'
      : error instanceof TypeError ? 'Danbooru에 연결할 수 없습니다. 인터넷 연결이나 사이트의 교차 출처 접근 허용 상태를 확인해 주세요.' : error.message;
    remoteSearch.loaded = remoteSearch.tags.length > 0;
  } finally {
    clearTimeout(timeout);
    if (version === remoteSearch.version) {
      remoteSearch.loading = false;
      elements.searchResults.setAttribute('aria-busy', 'false');
      renderSearchResults();
    }
  }
}

function updateSearchSelection() {
  const selected = new Set([...state.groups.flatMap(group => group.tags), ...state.tailTags].map(tag => normalize(tag.name)));
  elements.searchResults.querySelectorAll('.search-tag').forEach(button => {
    const added = selected.has(normalize(button.dataset.tag));
    button.classList.toggle('selected', added);
    button.setAttribute('aria-pressed', String(added));
    button.setAttribute('aria-label', `${button.dataset.tag} ${added ? '추가됨' : '프롬프트에 추가'}`);
  });
}
function renderSearchResults() {
  const q = remoteSearch.query;
  const threshold = Number(elements.searchSimilarity.value) / 100;
  const minimum = Math.max(0, Number(elements.searchMinCount.value) || 0);
  const category = elements.searchCategory.value;
  elements.searchSimilarityValue.textContent = `${elements.searchSimilarity.value}%`;
  if (remoteSearch.loading) return;
  elements.searchRetry.classList.toggle('hidden', !remoteSearch.error);
  const terms = queryTerms(q);
  const ranked = remoteSearch.tags.map(tag => ({ ...tag, searchCategory: searchCategory(tag),
    similarity: q ? Math.max(...terms.map(term => searchSimilarity(term, normalize(tag.name)))) : 1,
  })).filter(tag => tag.category !== 1 && (!category || tag.searchCategory === category) && tag.count >= minimum &&
    (!q || (tag.similarity > 0 && tag.similarity + Number.EPSILON >= threshold)));
  const titleOrder = (a, b) => a.name.localeCompare(b.name, 'en');
  const sorts = {
    similarity: (a, b) => b.similarity - a.similarity || b.count - a.count || titleOrder(a, b),
    title: titleOrder, 'title-desc': (a, b) => titleOrder(b, a),
    usage: (a, b) => b.count - a.count || titleOrder(a, b),
    'usage-asc': (a, b) => a.count - b.count || titleOrder(a, b),
  };
  ranked.sort(sorts[elements.searchSort.value] || sorts.similarity);
  const hasMore = remoteSearch.plans.some(plan => !plan.done);
  elements.searchMoreRemote.classList.toggle('hidden', !remoteSearch.loaded || !hasMore);
  elements.searchMoreRemote.disabled = false;
  elements.searchSummary.textContent = remoteSearch.error
    ? `${remoteSearch.error}${remoteSearch.tags.length ? ' · 일부 응답 결과만 표시' : ' · 결과를 가져오지 못했습니다.'}`
    : `Danbooru 후보 ${remoteSearch.tags.length.toLocaleString()}개 · 조건 일치 ${ranked.length.toLocaleString()}개`;
  elements.searchResults.replaceChildren();
  if (!ranked.length) {
    setSearchMessage(remoteSearch.error ? '연결 후 다시 시도해 주세요. 내장 태그를 실시간 결과로 대신 표시하지 않습니다.'
      : '조건에 맞는 태그가 없습니다. 임계값을 낮추거나 영어 태그명으로 검색해 보세요.');
    return;
  }
  renderedSearchLimit = 60;
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'search-more';
  function draw() {
    elements.searchResults.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'search-tag-grid';
    for (const result of ranked.slice(0, renderedSearchLimit)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'search-tag';
      button.dataset.tag = result.name;
      button.title = `${result.name} · ${SEARCH_CATEGORIES[result.searchCategory]} · ${result.count.toLocaleString()}회${q ? ` · 유사도 ${Math.round(result.similarity * 100)}%` : ''}`;
      const name = document.createElement('span');
      name.className = 'search-tag-name';
      name.textContent = result.name;
      const usage = document.createElement('small');
      usage.textContent = `${formatCount(result.count)}${q ? ` · ${Math.round(result.similarity * 100)}%` : ''}`;
      button.append(name, usage);
      button.addEventListener('click', () => addTag(result.name));
      grid.append(button);
    }
    elements.searchResults.append(grid);
    if (renderedSearchLimit < ranked.length) {
      more.textContent = `결과 60개 더 보기 (${ranked.length - renderedSearchLimit}개 남음)`;
      elements.searchResults.append(more);
    }
    updateSearchSelection();
  }
  more.addEventListener('click', () => { renderedSearchLimit += 60; draw(); });
  draw();
  elements.searchResults.scrollTop = 0;
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
  state.sourceText = '';
  renderResults();
}

function showStaticStatus() {
  elements.modelStatusDot.className = 'status-dot warning';
  elements.modelStatusText.textContent = 'GitHub 정적판 · 텍스트 모드';
  elements.tagCountLabel.textContent = 'DANBOORU · LIVE';
  const rows = [
    ['실행 방식', '단일 HTML', true],
    ['텍스트 분석 인덱스', `${TAGS.length.toLocaleString()}개`, true],
    ['텍스트 분석', '브라우저 내부', true],
    ['이미지 미리보기', '지원', true],
    ['이미지 AI 분석', '전체 로컬 앱 필요', false],
    ['태그 검색', 'shima.donmai.us API', true],
    ['전송 항목', '태그 검색어만', true],
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
elements.searchForm.addEventListener('submit', event => { event.preventDefault(); searchTags(elements.tagSearchInput.value, { force: true }); });
elements.tagSearchInput.addEventListener('input', scheduleSearch);
elements.searchCategory.addEventListener('change', () => searchTags(elements.tagSearchInput.value));
elements.searchSort.addEventListener('change', renderSearchResults);
[elements.searchMinCount, elements.searchSimilarity].forEach(control => control.addEventListener('input', renderSearchResults));
elements.searchRetry.addEventListener('click', () => searchTags(elements.tagSearchInput.value, { force: true }));
elements.searchMoreRemote.addEventListener('click', () => searchTags(elements.tagSearchInput.value, { append: true }));
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
searchTags('');
