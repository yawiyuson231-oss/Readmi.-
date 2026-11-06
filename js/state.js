// Central application state + small pure helpers shared by all modules.

export const state = {
  clips: [],          // { id, name, url, videoEl, duration, trimStart, trimEnd, speed, filters, thumb }
  texts: [],          // { id, content, start, end, size, color, font, x, y }
  selectedClipId: null,
  selectedTextId: null,
  playing: false,
  recording: false,
  projectTime: 0,     // seconds, master playhead position
  pxPerSec: 40,       // timeline zoom
  audioCtx: null,
  exportDest: null,
  _boxes: [],         // text hit-boxes from the last rendered frame (canvas dragging)
  _dragClipId: null,  // clip currently being dragged on the timeline
};

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultFilters() {
  return { brightness: 1, contrast: 1, saturate: 1, hue: 0, blur: 0, grayscale: 0, sepia: 0 };
}

export const FILTER_PRESETS = {
  None: defaultFilters(),
  Vivid: { brightness: 1.05, contrast: 1.2, saturate: 1.45, hue: 0, blur: 0, grayscale: 0, sepia: 0 },
  Warm: { brightness: 1.08, contrast: 1.05, saturate: 1.25, hue: -10, blur: 0, grayscale: 0, sepia: 0.25 },
  Cool: { brightness: 1, contrast: 1.1, saturate: 1.1, hue: 14, blur: 0, grayscale: 0, sepia: 0 },
  Mono: { brightness: 1.05, contrast: 1.15, saturate: 1, hue: 0, blur: 0, grayscale: 1, sepia: 0 },
  Vintage: { brightness: 0.95, contrast: 0.9, saturate: 0.8, hue: 0, blur: 0, grayscale: 0, sepia: 0.55 },
  Dream: { brightness: 1.1, contrast: 0.95, saturate: 1.1, hue: 0, blur: 2.5, grayscale: 0, sepia: 0 },
};

export function filterString(f) {
  return [
    `brightness(${f.brightness})`,
    `contrast(${f.contrast})`,
    `saturate(${f.saturate})`,
    `hue-rotate(${f.hue}deg)`,
    `blur(${f.blur}px)`,
    `grayscale(${f.grayscale})`,
    `sepia(${f.sepia})`,
  ].join(' ');
}

/** On-screen length of a clip after trimming + speed. */
export function clipDuration(clip) {
  return Math.max(0.05, (clip.trimEnd - clip.trimStart) / clip.speed);
}

export function projectDuration() {
  return state.clips.reduce((sum, c) => sum + clipDuration(c), 0);
}

/** Start time (project seconds) of every clip, in order. */
export function clipStartTimes() {
  const starts = [];
  let t = 0;
  for (const c of state.clips) { starts.push(t); t += clipDuration(c); }
  return starts;
}

/** Which clip is under the playhead, and the corresponding time inside that clip's source video. */
export function locate(t) {
  const starts = clipStartTimes();
  let idx = -1;
  for (let i = 0; i < state.clips.length; i++) if (t >= starts[i] - 1e-6) idx = i;
  if (idx < 0) return { index: -1, clip: null, start: 0, localTime: 0 };
  const clip = state.clips[idx];
  return { index: idx, clip, start: starts[idx], localTime: clip.trimStart + (t - starts[idx]) * clip.speed };
}

export function activeClip() {
  return state.clips.find((c) => c.id === state.selectedClipId) || null;
}

export function activeText() {
  return state.texts.find((t) => t.id === state.selectedTextId) || null;
}

export function formatTime(s) {
  s = Math.max(0, s || 0);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(1).padStart(4, '0')}`;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}
