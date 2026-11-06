// Export: real-time capture of the preview canvas + mixed audio into a .webm file.

import { state, projectDuration } from './state.js';
import { canvas, play, pause, seek } from './preview.js';
import { getExportDest, recorderMime } from './media.js';

let recorder = null;
let chunks = [];
let lastUrl = null;

const modal = document.getElementById('exportModal');
const statusEl = document.getElementById('exportStatus');
const titleEl = document.getElementById('exportTitle');
const barEl = document.getElementById('exportBar');
const videoEl = document.getElementById('exportVideo');
const downloadEl = document.getElementById('exportDownload');
const closeBtn = document.getElementById('exportClose');

export function isExporting() { return state.recording; }

export function initExporter() {
  closeBtn.addEventListener('click', () => {
    if (state.recording) return; // block closing mid-render
    modal.classList.add('hidden');
  });
  window.addEventListener('minicut:export-done', finishExport);

  // progress bar driven off the master playhead while recording
  const loop = () => {
    if (state.recording) {
      const total = projectDuration();
      if (total > 0) {
        barEl.style.width = `${Math.min(100, Math.round((state.projectTime / total) * 100))}%`;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

export async function startExport() {
  if (state.recording) return;
  if (state.clips.length === 0) {
    alert('Add at least one clip before exporting.');
    return;
  }
  const total = projectDuration();
  if (total < 0.2) {
    alert('Your timeline is too short to export.');
    return;
  }

  const canvasStream = canvas.captureStream(30);
  const dest = getExportDest();
  const stream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const mime = recorderMime();
  try {
    recorder = mime
      ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8000000 })
      : new MediaRecorder(stream);
  } catch (err) {
    alert(`Recording is not supported in this browser (${err.message}).`);
    return;
  }

  chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = onRecorderStop;

  // reset UI
  if (lastUrl) { URL.revokeObjectURL(lastUrl); lastUrl = null; }
  videoEl.classList.add('hidden');
  videoEl.removeAttribute('src');
  downloadEl.classList.add('hidden');
  titleEl.textContent = 'Exporting…';
  statusEl.textContent = `Recording ${total.toFixed(1)}s in real time — keep this tab visible.`;
  barEl.style.width = '0%';
  closeBtn.disabled = true;
  closeBtn.textContent = 'Recording…';
  modal.classList.remove('hidden');

  state.recording = true;
  recorder.start(1000);
  seek(0);
  play();
}

function finishExport() {
  if (!state.recording) return;
  state.recording = false;
  pause();
  statusEl.textContent = 'Finishing up…';
  // small delay so the last frames/audio flush into the recorder
  setTimeout(() => { try { recorder && recorder.stop(); } catch { /* already stopped */ } }, 250);
}

function onRecorderStop() {
  const blob = new Blob(chunks, { type: 'video/webm' });
  lastUrl = URL.createObjectURL(blob);
  videoEl.src = lastUrl;
  videoEl.classList.remove('hidden');
  downloadEl.href = lastUrl;
  downloadEl.classList.remove('hidden');
  titleEl.textContent = 'Export complete';
  statusEl.textContent = `minicut-export.webm · ${(blob.size / 1024 / 1024).toFixed(1)} MB (webm — convert to MP4 with any converter if you need it).`;
  barEl.style.width = '100%';
  closeBtn.disabled = false;
  closeBtn.textContent = 'Close';
  state.recording = false;
}
