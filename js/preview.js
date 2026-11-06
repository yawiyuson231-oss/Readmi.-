// Canvas preview: frame rendering, playback engine, seeking, text dragging.

import { state, locate, filterString, projectDuration, formatTime } from './state.js';
import { drawCover, ensureAudio } from './media.js';

export const canvas = document.getElementById('preview');
export const ctx = canvas.getContext('2d');

/* ---------------- canvas sizing ---------------- */

export function syncCanvasSize() {
  const first = state.clips[0];
  const v = first?.videoEl;
  const w = Math.min(v?.videoWidth || 1280, 1920) || 1280;
  const h = Math.min(v?.videoHeight || 720, 1080) || 720;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

/* ---------------- rendering ---------------- */

export function renderCurrent() {
  renderAt(state.projectTime);
  updateTimeDisplay();
}

function renderAt(t) {
  const W = canvas.width;
  const H = canvas.height;
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const { clip, localTime } = locate(t);
  if (clip) {
    ctx.save();
    try { ctx.filter = filterString(clip.filters); } catch { /* filter unsupported */ }
    drawCover(ctx, clip.videoEl, W, H);
    ctx.restore();
    ctx.filter = 'none';
  } else {
    ctx.fillStyle = '#3a3a46';
    ctx.font = `600 ${Math.round(H / 18)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Import a video to start editing', W / 2, H / 2);
  }

  drawTexts(t);
}

function drawTexts(t) {
  state._boxes = [];
  const W = canvas.width;
  const H = canvas.height;

  for (const txt of state.texts) {
    if (t < txt.start - 1e-6 || t > txt.end + 1e-6) continue;
    const lines = String(txt.content).split('\n');
    ctx.save();
    ctx.font = `${txt.size}px ${txt.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lineHeight = txt.size * 1.25;
    const totalH = lines.length * lineHeight;
    const cxp = txt.x * W;
    const top = txt.y * H - totalH / 2;
    let maxW = 0;
    for (const line of lines) maxW = Math.max(maxW, ctx.measureText(line).width);

    lines.forEach((line, i) => {
      const y = top + lineHeight * (i + 0.5);
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, txt.size / 9);
      ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.strokeText(line, cxp, y);
      ctx.fillStyle = txt.color;
      ctx.fillText(line, cxp, y);
    });

    const pad = txt.size * 0.28;
    state._boxes.push({
      id: txt.id,
      x: cxp - maxW / 2 - pad,
      y: top - pad,
      w: maxW + pad * 2,
      h: totalH + pad * 2,
    });

    if (txt.id === state.selectedTextId) {
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2ee6c5';
      const b = state._boxes[state._boxes.length - 1];
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}

function updateTimeDisplay() {
  document.getElementById('timeNow').textContent = formatTime(state.projectTime);
  document.getElementById('timeTotal').textContent = formatTime(projectDuration());
}

/* ---------------- playback engine ---------------- */

let rafId = null;
let lastTs = 0;

/** Keep the <video> elements in sync with the master playhead. */
function syncVideos() {
  const { index, localTime } = locate(state.projectTime);
  state.clips.forEach((clip, i) => {
    const v = clip.videoEl;
    if (i === index) {
      v.playbackRate = clip.speed;
      if (Math.abs(v.currentTime - localTime) > 0.25) {
        try { v.currentTime = Math.min(Math.max(localTime, 0), Math.max(0, clip.duration - 0.03)); } catch { /* seeking */ }
      }
      if (v.paused) v.play().catch(() => { /* autoplay restrictions */ });
    } else if (!v.paused) {
      v.pause();
    }
  });
}

export function play() {
  if (state.playing || state.clips.length === 0) return;
  ensureAudio(); // resume the AudioContext inside a user gesture
  state.playing = true;
  lastTs = performance.now();
  syncVideos();
  rafId = requestAnimationFrame(tick);
  window.dispatchEvent(new CustomEvent('minicut:playstate'));
}

export function pause() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(rafId);
  state.clips.forEach((c) => { try { c.videoEl.pause(); } catch { /* noop */ } });
  window.dispatchEvent(new CustomEvent('minicut:playstate'));
}

export function togglePlay() {
  if (state.playing) { pause(); return; }
  if (state.projectTime >= projectDuration() - 0.01) seek(0);
  play();
}

export function seek(t) {
  state.projectTime = Math.min(Math.max(t, 0), Math.max(projectDuration(), 0));
  syncVideos();
  renderCurrent();
  window.dispatchEvent(new CustomEvent('minicut:seek'));
}

function tick() {
  if (!state.playing) return;
  const now = performance.now();
  const dt = (now - lastTs) / 1000;
  lastTs = now;
  state.projectTime += dt;

  const total = projectDuration();
  if (state.projectTime >= total) {
    state.projectTime = total;
    syncVideos();
    renderCurrent();
    pause();
    if (state.recording) window.dispatchEvent(new CustomEvent('minicut:export-done'));
    return;
  }

  syncVideos();
  renderCurrent();
  rafId = requestAnimationFrame(tick);
}

/* ---------------- text dragging on the canvas ---------------- */

export function initPreviewInteractions() {
  canvas.addEventListener('pointerdown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);

    const hit = [...state._boxes].reverse().find(
      (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h,
    );
    if (!hit) {
      if (state.selectedTextId !== null) window.dispatchEvent(new CustomEvent('minicut:deselect-text'));
      return;
    }
    window.dispatchEvent(new CustomEvent('minicut:select-text', { detail: hit.id }));

    const move = (ev) => {
      const txt = state.texts.find((t) => t.id === hit.id);
      if (!txt) return;
      const r = canvas.getBoundingClientRect();
      txt.x = Math.min(1, Math.max(0, (ev.clientX - r.left) * (canvas.width / r.width) / canvas.width));
      txt.y = Math.min(1, Math.max(0, (ev.clientY - r.top) * (canvas.height / r.height) / canvas.height));
      renderCurrent();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  });
}
