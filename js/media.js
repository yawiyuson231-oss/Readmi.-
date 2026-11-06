// Media plumbing: importing files, thumbnails, audio routing, demo clip generation.

import { state, uid, defaultFilters } from './state.js';

/* ---------------- audio graph ---------------- */

export function ensureAudio() {
  if (!state.audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new Ctx();
  }
  if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
  return state.audioCtx;
}

/** One shared MediaStreamDestination that feeds the MediaRecorder during export. */
export function getExportDest() {
  const ctx = ensureAudio();
  if (!state.exportDest) state.exportDest = ctx.createMediaStreamDestination();
  return state.exportDest;
}

/** Route a video element's audio to both the speakers and the export destination (once). */
export function routeAudio(videoEl) {
  const ctx = ensureAudio();
  if (videoEl._srcNode) return;
  try {
    const src = ctx.createMediaElementSource(videoEl);
    src.connect(ctx.destination);
    src.connect(getExportDest());
    videoEl._srcNode = src;
  } catch (err) {
    console.warn('Audio routing failed for clip:', err);
  }
}

/* ---------------- drawing helpers ---------------- */

/** Draw any video/canvas source scaled to "cover" a w×h box (no letterboxing). */
export function drawCover(ctx, src, w, h) {
  const sw = src.videoWidth || src.width;
  const sh = src.videoHeight || src.height;
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function makeThumb(video) {
  return new Promise((resolve) => {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 90;
    const cx = c.getContext('2d');
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      try { drawCover(cx, video, 160, 90); } catch { /* frame not ready */ }
      resolve(c.toDataURL('image/jpeg', 0.6));
    };
    video.addEventListener('seeked', onSeeked);
    try { video.currentTime = Math.min(video.duration * 0.25, Math.max(0, video.duration - 0.05)); }
    catch { resolve(''); }
  });
}

/* ---------------- import / remove ---------------- */

export async function addClipFromFile(file) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.preload = 'auto';
  video.playsInline = true;
  video.muted = false;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error(`Cannot decode "${file.name}"`));
  });

  const duration = Number.isFinite(video.duration) ? video.duration : 5;
  routeAudio(video); // must happen while we still hold the user gesture
  const clip = {
    id: uid(),
    name: file.name,
    url,
    videoEl: video,
    duration,
    trimStart: 0,
    trimEnd: duration,
    speed: 1,
    filters: defaultFilters(),
    thumb: '',
  };
  clip.thumb = await makeThumb(video);

  // Repaint the preview when a paused seek finishes.
  video.addEventListener('seeked', () => {
    if (!state.playing) window.dispatchEvent(new CustomEvent('minicut:render'));
  });

  state.clips.push(clip);
  return clip;
}

export async function importFiles(files) {
  const videos = [...files].filter((f) => f.type.startsWith('video/'));
  if (!videos.length) return 0;
  for (const f of videos) {
    try { await addClipFromFile(f); }
    catch (err) { alert(err.message); }
  }
  return videos.length;
}

export function removeClip(id) {
  const i = state.clips.findIndex((c) => c.id === id);
  if (i < 0) return;
  const [clip] = state.clips.splice(i, 1);
  try { clip.videoEl.pause(); } catch { /* noop */ }
  URL.revokeObjectURL(clip.url);
  clip.videoEl.src = '';
  if (state.selectedClipId === id) state.selectedClipId = state.clips[0]?.id ?? null;
}

/* ---------------- demo clip (no asset needed) ---------------- */

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((m) => window.MediaRecorder?.isTypeSupported(m)) || '';
}

export function recorderMime() { return pickMime(); }

function drawDemoFrame(cx, c, t) {
  const g = cx.createLinearGradient(0, 0, c.width, c.height);
  const hue = (t * 40) % 360;
  g.addColorStop(0, `hsl(${hue}, 70%, 22%)`);
  g.addColorStop(1, `hsl(${(hue + 120) % 360}, 70%, 45%)`);
  cx.fillStyle = g;
  cx.fillRect(0, 0, c.width, c.height);

  // bouncing ball
  const x = c.width / 2 + Math.sin(t * 2) * (c.width / 3);
  const y = c.height / 2 + Math.abs(Math.cos(t * 3)) * -80 + 40;
  cx.beginPath();
  cx.arc(x, y, 36, 0, Math.PI * 2);
  cx.fillStyle = '#fff';
  cx.fill();

  // frame counter
  cx.fillStyle = 'rgba(0,0,0,.55)';
  cx.fillRect(20, 20, 240, 64);
  cx.fillStyle = '#2ee6c5';
  cx.font = 'bold 34px system-ui, sans-serif';
  cx.fillText(`DEMO ${t.toFixed(1)}s`, 36, 62);
}

/** Records a 5s animated canvas (with a soft beep) into a real video File. */
export async function makeDemoClip() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const cx = c.getContext('2d');

  const stream = c.captureStream(30);

  // gentle beep so the exported demo has an audio track
  const actx = ensureAudio();
  const dest = actx.createMediaStreamDestination();
  const osc = actx.createOscillator();
  const gain = actx.createGain();
  gain.gain.value = 0.05;
  osc.frequency.value = 440;
  osc.connect(gain);
  gain.connect(dest);
  osc.start();
  if (dest.stream.getAudioTracks()[0]) stream.addTrack(dest.stream.getAudioTracks()[0]);

  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((res) => { rec.onstop = res; });

  rec.start(200);
  const t0 = performance.now();
  await new Promise((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      drawDemoFrame(cx, c, Math.min(t, 5));
      if (t < 5) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
  rec.stop();
  await stopped;
  osc.stop();

  const blob = new Blob(chunks, { type: 'video/webm' });
  const file = new File([blob], 'demo-clip.webm', { type: 'video/webm' });
  return addClipFromFile(file);
}
