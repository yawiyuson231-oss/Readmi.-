# MiniCut ✂️

A **CapCut-style video editor that runs entirely in your browser** — no installs, no uploads, no accounts. Everything (decoding, filtering, encoding) happens locally on your machine with the HTML5 video + canvas APIs.

> Not affiliated with CapCut or ByteDance. This is an original editor built with standard web APIs.

## Run it

```bash
cd Readmi.-
npm start          # or: python3 -m http.server 8000 --bind 0.0.0.0
```

Open <http://localhost:8000> in Chrome, Edge, or Firefox. (A static server is required — the app uses ES modules.)

**No video files handy?** Click **✨ Demo clip** — MiniCut generates a 5-second animated clip (with audio) on the fly so you can try every feature immediately.

## Features

| Area | What works |
|---|---|
| Import | Multi-file import, drag & drop anywhere, MP4/MOV/WebM/… anything the browser can decode |
| Timeline | Clip track with thumbnails, drag to **reorder**, drag side handles to **trim**, zoom (10–120 px/s), click the ruler to scrub |
| Preview | Canvas renderer, letterbox-free "cover" framing, playhead auto-follow |
| Filters | 7 presets (Vivid, Warm, Cool, Mono, Vintage, Dream…) + live sliders: brightness, contrast, saturation, hue, blur, B&W, sepia |
| Speed | 0.25× – 4× per clip (timeline length updates automatically) |
| Text | Unlimited overlays: content, in/out timing, size, color, font, **drag directly on the canvas** |
| Audio | Clip audio is mixed and included in the export |
| Export | One-click render to `.webm` with a progress bar and in-app preview + download |

Keyboard: `Space` play/pause · `Del` remove selected clip/text · `Home`/`End` jump to start/end.

## How it works

```
index.html            UI shell
styles.css            dark editor theme
js/state.js           shared state + pure helpers (durations, locate(), filter strings)
js/media.js           file import, thumbnails, AudioContext routing, demo-clip recorder
js/preview.js         canvas renderer, rAF playback engine, seeking, canvas text dragging
js/timeline.js        ruler, clip track (trim/reorder), overlay track, playhead
js/panels.js          filter/speed panel + text overlay editor
js/exporter.js        canvas.captureStream() + MediaRecorder export pipeline
js/app.js             wiring: selection, refresh fan-out, shortcuts, drag & drop
```

No frameworks, no bundler, no dependencies — plain ES modules.

## Turning it into an Android APK

Because the whole app is static files, wrapping it as an APK is straightforward:

1. `npx cap add android` inside a Capacitor project pointing at this folder (`webDir`), or
2. Android Studio → WebView `loadUrl("file:///android_asset/index.html")` (keep the `js/` folder structure), or
3. A PWA wrapper (Bubblewrap / PWABuilder).

Then build a signed APK/AAB with Gradle. The editor itself needs no native code.

## Roadmap ideas

- MP4 export (via ffmpeg.wasm) — currently exports `.webm`
- Transitions between clips (crossfade/dip-to-black)
- Audio track import + volume keyframes
- Undo/redo history, project save/load as JSON
- Picture-in-picture, stickers, keyframe animation

## Known limitations

- Export is **real time** (a 30s timeline takes ~30s to render) because it uses `MediaRecorder`.
- Output is WebM (VP9/VP8 + Opus) — convert to MP4 with HandBrake/ffmpeg if needed.
- Canvas CSS filters are ignored by Safari < 17, so filter sliders have no visual effect there (export included).
