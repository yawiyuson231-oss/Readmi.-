// Right-hand panels: clip filters/speed and the text overlay editor.

import { state, FILTER_PRESETS, defaultFilters, activeClip, projectDuration, escapeHtml } from './state.js';
import { renderCurrent } from './preview.js';
import { renderTimeline, updatePlayhead } from './timeline.js';
import { selectText, addText } from './app.js';

const SLIDERS = [
  ['brightness', 'Brightness', 2],
  ['contrast', 'Contrast', 2],
  ['saturate', 'Saturation', 2],
  ['hue', 'Hue', 0],
  ['blur', 'Blur', 1],
  ['grayscale', 'B&W', 2],
  ['sepia', 'Sepia', 2],
];

const FONTS = [
  'system-ui, sans-serif',
  'Georgia, serif',
  'Impact, sans-serif',
  '"Courier New", monospace',
];

export function initPanels() {
  // presets
  const box = document.getElementById('presets');
  box.innerHTML = '';
  for (const name of Object.keys(FILTER_PRESETS)) {
    const b = document.createElement('button');
    b.className = 'preset';
    b.dataset.preset = name;
    b.textContent = name;
    b.addEventListener('click', () => {
      const clip = activeClip();
      if (!clip) return;
      clip.filters = { ...FILTER_PRESETS[name] };
      renderPanels();
      renderCurrent();
    });
    box.appendChild(b);
  }

  // sliders
  for (const [key, , digits] of SLIDERS) {
    const input = document.getElementById(`f-${key}`);
    const out = document.getElementById(`o-${key}`);
    input.addEventListener('input', () => {
      const clip = activeClip();
      if (!clip) return;
      clip.filters[key] = parseFloat(input.value);
      out.textContent = parseFloat(input.value).toFixed(digits);
      renderCurrent();
      document.querySelector(`.preset[data-preset]`)?.classList.remove('active');
      markActivePreset();
    });
  }

  // speed
  document.getElementById('speedSel').addEventListener('change', (e) => {
    const clip = activeClip();
    if (!clip) return;
    clip.speed = parseFloat(e.target.value);
    window.dispatchEvent(new CustomEvent('minicut:timeline-changed'));
  });

  // text list (delegated)
  document.getElementById('addTextBtn').addEventListener('click', () => addText());
  const list = document.getElementById('textList');
  list.addEventListener('input', onTextInput);
  list.addEventListener('change', onTextInput);
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.del');
    if (!btn) return;
    const id = btn.closest('.text-card').dataset.id;
    state.texts = state.texts.filter((t) => t.id !== id);
    if (state.selectedTextId === id) state.selectedTextId = null;
    window.dispatchEvent(new CustomEvent('minicut:timeline-changed'));
  });
}

function onTextInput(e) {
  const card = e.target.closest('.text-card');
  if (!card) return;
  const txt = state.texts.find((t) => t.id === card.dataset.id);
  if (!txt) return;
  const field = e.target.dataset.field;
  if (!field) return;

  switch (field) {
    case 'content': txt.content = e.target.value; break;
    case 'start': txt.start = Math.max(0, parseFloat(e.target.value) || 0); txt.end = Math.max(txt.end, txt.start + 0.1); break;
    case 'end': txt.end = Math.max(txt.start + 0.1, parseFloat(e.target.value) || 0.1); break;
    case 'size': txt.size = parseInt(e.target.value, 10) || 24; break;
    case 'color': txt.color = e.target.value; break;
    case 'font': txt.font = e.target.value; break;
    default: break;
  }
  // NOTE: update canvas + timeline only — rebuilding the panel here would
  // steal focus from the input the user is typing in.
  renderCurrent();
  renderTimeline();
  updatePlayhead();
}

function markActivePreset() {
  const clip = activeClip();
  document.querySelectorAll('.preset').forEach((b) => {
    const preset = FILTER_PRESETS[b.dataset.preset];
    b.classList.toggle('active', !!clip && JSON.stringify(preset) === JSON.stringify(clip.filters));
  });
}

export function renderPanels() {
  const clip = activeClip();

  // clip pane
  document.getElementById('clipName').textContent = clip ? `Clip: ${clip.name}` : 'No clip selected';
  for (const [key, , digits] of SLIDERS) {
    const input = document.getElementById(`f-${key}`);
    const out = document.getElementById(`o-${key}`);
    const v = clip ? clip.filters[key] : defaultFilters()[key];
    input.value = v;
    input.disabled = !clip;
    out.textContent = Number(v).toFixed(digits);
  }
  document.getElementById('speedSel').value = clip ? String(clip.speed) : '1';
  document.getElementById('speedSel').disabled = !clip;
  markActivePreset();

  // text pane
  const total = projectDuration();
  const list = document.getElementById('textList');
  list.innerHTML = '';
  for (const txt of state.texts) {
    const card = document.createElement('div');
    card.className = 'text-card' + (txt.id === state.selectedTextId ? ' selected' : '');
    card.dataset.id = txt.id;
    card.innerHTML = `
      <div class="row">
        <label>Text</label>
        <button class="del" title="Delete overlay">&times;</button>
      </div>
      <textarea data-field="content" placeholder="Type something…">${escapeHtml(txt.content)}</textarea>
      <div class="row" style="margin-top:8px">
        <label>In</label><input type="number" data-field="start" min="0" step="0.1" value="${txt.start.toFixed(1)}">
        <label>Out</label><input type="number" data-field="end" min="0.1" step="0.1" value="${txt.end.toFixed(1)}">
      </div>
      <div class="row">
        <label>Size</label><input type="range" data-field="size" min="12" max="200" step="1" value="${txt.size}">
        <span class="mini">${txt.size}px</span>
      </div>
      <div class="row">
        <label>Color</label><input type="color" data-field="color" value="${txt.color}">
        <label>Font</label>
        <select data-field="font">${FONTS.map((f) => `<option value="${f}"${f === txt.font ? ' selected' : ''}>${f.split(',')[0].replace(/"/g, '')}</option>`).join('')}</select>
      </div>
      <div class="row"><span class="mini">${txt.start.toFixed(1)}s – ${txt.end.toFixed(1)}s &middot; project ${total.toFixed(1)}s &middot; drag on canvas to move</span></div>`;
    card.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input,textarea,select,button')) return;
      selectText(txt.id);
    });
    list.appendChild(card);
  }
}
