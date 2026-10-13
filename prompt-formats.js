'use strict';

// Shared by the local app and the single-file GitHub Pages build.
const PromptFormats = (() => {
  const plain = tag => tag.name.replaceAll('_', ' ');
  const weight = tag => String(Number(Number(tag.weight).toFixed(1)));

  function novel(groups, tailTags) {
    const format = tag => tag.weight && Number(tag.weight) !== 1
      ? `${weight(tag)}::${plain(tag)}::` : plain(tag);
    const lines = groups.filter(group => group.tags.length).map(group => group.tags.map(format).join(', '));
    if (tailTags.length) {
      const tail = tailTags.map(format).join(', ');
      if (lines.length) lines[lines.length - 1] += `, ${tail}`;
      else lines.push(tail);
    }
    return lines.map((line, index) => index < lines.length - 1 ? `${line},` : line).join('\n\n');
  }

  const phrases = {
    '1boy': 'one male character', '1girl': 'one female character', '1other': 'one character',
    'no_humans': 'a scene without people', 'solo': 'alone', '2boys': 'two male characters',
    '2girls': 'two female characters', 'smile': 'smiling', 'grin': 'grinning',
    'expressionless': 'a neutral expression', 'crying': 'crying', 'wink': 'winking',
    'abs': 'defined abdominal muscles', 'tareme': 'downturned eyes', 'tsurime': 'upturned eyes',
    'aegyo_sal': 'soft lower-eyelid fullness', 'upper_body': 'an upper-body view',
    'full_body': 'a full-body view', 'close-up': 'a close-up view', 'close_up': 'a close-up view', 'looking_at_viewer': 'looking at the viewer',
    'from_above': 'a view from above', 'from_below': 'a view from below',
    'outdoors': 'an outdoor setting', 'indoors': 'an indoor setting',
    'sketch': 'a sketch', 'lineart': 'line art', 'masterpiece': 'masterpiece quality',
  };
  const join = values => values.length < 2 ? (values[0] || '')
    : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
  const sentence = text => text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}.` : '';

  function natural(groups, tailTags, sourceText = '') {
    const emphasized = [];
    const softened = [];
    const describe = tag => {
      const text = phrases[tag.name] || plain(tag);
      if (tag.weight && Number(tag.weight) > 1) emphasized.push(text);
      if (tag.weight && Number(tag.weight) < 1) softened.push(text);
      return text;
    };
    const byName = new Map(groups.map(group => [group.name, group.tags.map(describe)]));
    const get = name => join(byName.get(name) || []);
    const sentences = [];
    const subjects = get('대상');
    if (subjects) sentences.push(sentence(`Depict ${subjects}${get('인원수') ? `, ${get('인원수')}` : ''}`));
    else if (get('인원수')) sentences.push(sentence(`Show ${get('인원수')}`));
    const appearance = ['머리 색상', '머리 스타일', '앞머리 스타일', '눈 색상', '눈매 스타일', '피부 스타일', '신체 스타일'].flatMap(name => byName.get(name) || []);
    if (appearance.length) sentences.push(sentence(`Visible features include ${join(appearance)}`));
    if (get('표정')) sentences.push(sentence(`The expression is ${get('표정')}`));
    if (get('의상')) sentences.push(sentence(`Clothing includes ${get('의상')}`));
    if (get('자세')) sentences.push(sentence(`The pose is ${get('자세')}`));
    if (get('배경')) sentences.push(sentence(`Set the scene against ${get('배경')}`));
    if (get('카메라 구도')) sentences.push(sentence(`Use ${get('카메라 구도')}`));
    if (get('그림체 스타일')) sentences.push(sentence(`Render the image in the style of ${get('그림체 스타일')}`));
    if (get('빛 스타일')) sentences.push(sentence(`Light the scene with ${get('빛 스타일')}`));
    if (get('퀄리티 태그')) sentences.push(sentence(`Aim for ${get('퀄리티 태그')}`));
    if (tailTags.length) sentences.push(sentence(`Include ${join(tailTags.map(describe))}`));
    if (emphasized.length) sentences.push(sentence(`Place extra emphasis on ${join(emphasized)}`));
    if (softened.length) sentences.push(sentence(`Keep ${join(softened)} subtle`));
    const generated = sentences.join(' ');
    return [sourceText ? `Original description:\n${sourceText}` : '', generated].filter(Boolean).join('\n\n');
  }

  function render(groups, tailTags, count, sourceText = '') {
    document.querySelector('#promptVariants').classList.toggle('hidden', count === 0 && !sourceText);
    document.querySelector('#novelPrompt').textContent = count ? novel(groups, tailTags) : '인식한 태그가 없습니다. 태그 검색에서 추가해 주세요.';
    document.querySelector('#naturalPrompt').textContent = natural(groups, tailTags, sourceText);
    document.querySelectorAll('[data-copy-output]').forEach(button => {
      button.disabled = button.dataset.copyOutput === 'naturalPrompt' ? count === 0 && !sourceText : count === 0;
    });
  }

  document.querySelectorAll('[data-copy-output]').forEach(button => {
    button.addEventListener('click', async () => {
      const text = document.getElementById(button.dataset.copyOutput).textContent;
      let helper;
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else throw new Error('Clipboard unavailable');
      } catch {
        helper = document.createElement('textarea');
        helper.value = text;
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.append(helper);
        helper.select();
        if (!document.execCommand('copy')) {
          helper.remove();
          button.textContent = '복사 실패';
          setTimeout(() => { button.textContent = '전체 복사'; }, 1300);
          return;
        }
        helper.remove();
      }
      button.textContent = '복사됨';
      setTimeout(() => { button.textContent = '전체 복사'; }, 1100);
    });
  });
  return { novel, natural, render };
})();
