// Timeline: ruler, clip track (trim / reorder / remove), text overlay track, playhead.

import { state, clipDuration, projectDuration, clipStartTimes, formatTime, escapeHtml } from './state.js';
import { selectClip, selectText, removeClipById } from './app.js';
import { seek, pause } from './preview.js';

const ruler = document.getElementById('ruler');
const clipsTrack = document.getElementById('clipsTrack');
const textsTrack = document.getElementById('textsTrack');
const playhead = document.getElementById('playhead');
const tlScroll = document.getElementById('tlScroll');

export function renderTimeline() {
  const total = projectDuration();
  const pps = state.pxPerSec;
  const width = Math.max(total * pps + 240, tlScroll.clientWidth || 800);

  /* ---- ruler ---- */
  ruler.style.width = `${width}px`;
  ruler.innerHTML = '';
  const step = pps >= 60 ? 1 : pps >= 30 ? 2 : 5;
  for (let s = 0; s <= Math.ceil(total) + step; s += step) {
    const tick = document.createElement('div');
    tick.className = 'tick';
    tick.style.left = `${s * pps}px`;
    tick.innerHTML = `<span>${formatTime(s)}</span>`;
    ruler.appendChild(tick);
  }

  /* ---- clips ---- */
  clipsTrack.style.width = `${width}px`;
  clipsTrack.innerHTML = '';
  const starts = clipStartTimes();
  state.clips.forEach((clip, i) => {
    const el = document.createElement('div');
    el.className = 'clip'
      + (clip.id === state.selectedClipId ? ' selected' : '')
      + (state._dragClipId === clip.id ? ' dragging' : '');
    el.dataset.id = clip.id;
    el.style.left = `${starts[i] * pps}px`;
    el.style.width = `${Math.max(18, clipDuration(clip) * pps)}px`;
    if (clip.thumb) el.style.backgroundImage = `url(${clip.thumb})`;
    el.innerHTML = `
      ${clip.speed !== 1 ? `<div class="clip-speed">${clip.speed}&times;</div>` : ''}
      <div class="clip-label">${i + 1}. ${escapeHtml(clip.name)} &middot; ${clipDuration(clip).toFixed(1)}s</div>
      <div class="handle handle-l" data-h="l" title="Trim start"></div>
      <div class="handle handle-r" data-h="r" title="Trim end"></div>
      <button class="clip-remove" title="Remove clip">&times;</button>`;
    clipsTrack.appendChild(el);
  });

  /* ---- text overlays ---- */
  textsTrack.style.width = `${width}px`;
  textsTrack.innerHTML = '';
  for (const txt of state.texts) {
    const el = document.createElement('div');
    el.className = 'textbar' + (txt.id === state.selectedTextId ? ' selected' : '');
    el.dataset.id = txt.id;
    el.style.left = `${txt.start * pps}px`;
    el.style.width = `${Math.max(20, (txt.end - txt.start) * pps)}px`;
    el.textContent = txt.content.split('\n')[0] || '(empty)';
    el.title = txt.content;
    textsTrack.appendChild(el);
  }

  updatePlayhead();
}

export function updatePlayhead() {
  const x = state.projectTime * state.pxPerSec;
  playhead.style.left = `${x}px`;
  // keep the playhead in view during playback
  const view = tlScroll.clientWidth;
  if (x < tlScroll.scrollLeft || x > tlScroll.scrollLeft + view - 60) {
    tlScroll.scrollLeft = Math.max(0, x - view / 3);
  }
}

/* ---------------- pointer interactions ---------------- */

clipsTrack.addEventListener('pointerdown', (e) => {
  const clipEl = e.target.closest('.clip');
  if (!clipEl) return;
  const id = clipEl.dataset.id;

  if (e.target.closest('.clip-remove')) {
    removeClipById(id);
    return;
  }
  selectClip(id);

  const handle = e.target.closest('.handle');
  if (handle) startTrim(e, id, handle.dataset.h);
  else startClipDrag(e, id);
});

textsTrack.addEventListener('pointerdown', (e) => {
  const bar = e.target.closest('.textbar');
  if (!bar) return;
  selectText(bar.dataset.id);
  startTextDrag(e, bar.dataset.id);
});

ruler.addEventListener('pointerdown', (e) => {
  pause();
  const scrub = (ev) => {
    const rect = ruler.getBoundingClientRect();
    seek((ev.clientX - rect.left) / state.pxPerSec);
  };
  scrub(e);
  const up = () => {
    window.removeEventListener('pointermove', scrub);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', scrub);
  window.addEventListener('pointerup', up);
});

function startTrim(e, id, side) {
  e.preventDefault();
  e.stopPropagation();
  const clip = state.clips.find((c) => c.id === id);
  if (!clip) return;
  const startX = e.clientX;
  const origStart = clip.trimStart;
  const origEnd = clip.trimEnd;
  const MIN = 0.1;

  const move = (ev) => {
    const delta = (ev.clientX - startX) / state.pxPerSec;
    if (side === 'l') clip.trimStart = Math.min(Math.max(0, origStart + delta), clip.trimEnd - MIN);
    else clip.trimEnd = Math.min(Math.max(clip.trimStart + MIN, origEnd + delta), clip.duration);
    renderTimeline();
    window.dispatchEvent(new CustomEvent('minicut:render'));
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.dispatchEvent(new CustomEvent('minicut:refresh-panels'));
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startClipDrag(e, id) {
  e.preventDefault();
  state._dragClipId = id;
  renderTimeline();

  const move = (ev) => {
    const rect = clipsTrack.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const pps = state.pxPerSec;
    const widths = state.clips.map((c) => clipDuration(c) * pps);
    let acc = 0;
    let target = state.clips.length - 1;
    for (let i = 0; i < state.clips.length; i++) {
      if (x < acc + widths[i] / 2) { target = i; break; }
      acc += widths[i];
    }
    const from = state.clips.findIndex((c) => c.id === id);
    if (target !== from && target >= 0) {
      const [moved] = state.clips.splice(from, 1);
      state.clips.splice(target, 0, moved);
      renderTimeline();
      window.dispatchEvent(new CustomEvent('minicut:render'));
    }
  };
  const up = () => {
    state._dragClipId = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    renderTimeline();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startTextDrag(e, id) {
  e.preventDefault();
  const txt = state.texts.find((t) => t.id === id);
  if (!txt) return;
  const startX = e.clientX;
  const origStart = txt.start;
  const len = txt.end - txt.start;
  const total = projectDuration();

  const move = (ev) => {
    const delta = (ev.clientX - startX) / state.pxPerSec;
    txt.start = Math.min(Math.max(0, origStart + delta), Math.max(0, total - len));
    txt.end = txt.start + len;
    renderTimeline();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}
