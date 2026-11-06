// App wiring: selection, refresh fan-out, import/drag-drop, keyboard, tabs.

import { state, uid, projectDuration } from './state.js';
import { importFiles, makeDemoClip, removeClip } from './media.js';
import { renderTimeline, updatePlayhead } from './timeline.js';
import { renderPanels, initPanels } from './panels.js';
import { syncCanvasSize, renderCurrent, togglePlay, seek, initPreviewInteractions } from './preview.js';
import { startExport, initExporter } from './exporter.js';

/* ---------------- shared UI actions (imported by other modules) ---------------- */

export function refreshAll() {
  syncCanvasSize();
  renderCurrent();
  renderTimeline();
  renderPanels();
  updatePlayhead();
}

export function selectClip(id) {
  state.selectedClipId = id;
  refreshAll();
}

export function selectText(id) {
  state.selectedTextId = id;
  refreshAll();
}

export function removeClipById(id) {
  removeClip(id);
  refreshAll();
}

export function addText() {
  const total = projectDuration();
  const txt = {
    id: uid(),
    content: 'Your text',
    start: 0,
    end: Math.max(0.5, Math.min(total || 3, 3)),
    size: 56,
    color: '#ffffff',
    font: 'system-ui, sans-serif',
    x: 0.5,
    y: 0.85,
  };
  state.texts.push(txt);
  state.selectedTextId = txt.id;
  switchTab('text');
  refreshAll();
}

/* ---------------- init ---------------- */

function init() {
  initPanels();
  initPreviewInteractions();
  initExporter();

  /* import */
  const fileInput = document.getElementById('fileInput');
  document.getElementById('importBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    await importFiles(fileInput.files);
    fileInput.value = '';
    if (!state.selectedClipId && state.clips[0]) state.selectedClipId = state.clips[0].id;
    refreshAll();
  });

  /* demo clip */
  document.getElementById('demoBtn').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await makeDemoClip();
      if (!state.selectedClipId && state.clips[0]) state.selectedClipId = state.clips[0].id;
      refreshAll();
    } finally {
      e.target.disabled = false;
    }
  });

  /* transport + export */
  document.getElementById('exportBtn').addEventListener('click', startExport);
  document.getElementById('playBtn').addEventListener('click', togglePlay);
  document.getElementById('toStartBtn').addEventListener('click', () => seek(0));

  /* drag & drop anywhere on the stage */
  const stage = document.getElementById('stage');
  stage.addEventListener('dragenter', (e) => { e.preventDefault(); stage.classList.add('dragover'); });
  stage.addEventListener('dragover', (e) => e.preventDefault());
  stage.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && stage.contains(e.relatedTarget)) return;
    stage.classList.remove('dragover');
  });
  stage.addEventListener('drop', async (e) => {
    e.preventDefault();
    stage.classList.remove('dragover');
    await importFiles(e.dataTransfer.files);
    if (!state.selectedClipId && state.clips[0]) state.selectedClipId = state.clips[0].id;
    refreshAll();
  });

  /* tabs */
  document.querySelectorAll('.tab').forEach((b) =>
    b.addEventListener('click', () => switchTab(b.dataset.tab)),
  );

  /* zoom */
  document.getElementById('zoom').addEventListener('input', (e) => {
    state.pxPerSec = parseInt(e.target.value, 10);
    renderTimeline();
  });

  /* cross-module events */
  window.addEventListener('minicut:playstate', updatePlayButton);
  window.addEventListener('minicut:render', () => renderCurrent());
  window.addEventListener('minicut:timeline-changed', refreshAll);
  window.addEventListener('minicut:refresh-panels', renderPanels);
  window.addEventListener('minicut:seek', updatePlayhead);
  window.addEventListener('minicut:select-text', (e) => selectText(e.detail));
  window.addEventListener('minicut:deselect-text', () => {
    if (state.selectedTextId !== null) selectText(null);
  });

  /* keyboard shortcuts */
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedTextId) {
        state.texts = state.texts.filter((t) => t.id !== state.selectedTextId);
        state.selectedTextId = null;
        refreshAll();
      } else if (state.selectedClipId) {
        removeClipById(state.selectedClipId);
      }
    } else if (e.key === 'Home') {
      seek(0);
    } else if (e.key === 'End') {
      seek(projectDuration());
    }
  });

  updatePlayButton();
  refreshAll();
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.getElementById('pane-clip').classList.toggle('hidden', name !== 'clip');
  document.getElementById('pane-text').classList.toggle('hidden', name !== 'text');
}

function updatePlayButton() {
  document.getElementById('playBtn').innerHTML = state.playing ? '&#10073;&#10073;' : '&#9654;';
}

init();
