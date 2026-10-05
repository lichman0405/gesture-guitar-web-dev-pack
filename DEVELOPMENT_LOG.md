# Development Log

Maintained by the Supervisor per docs/AUTONOMOUS_DEV_PROTOCOL.md §9.

## Phase 0 — Bootstrap (done, commit e227815)

Decisions:
- Package manager: npm (Windows-default, zero extra install).
- Scaffold: hand-written Vite 6 + React 19 + TypeScript 5.7 (strict) instead of interactive `npm create`.
- Tests: Vitest 3 (unit, node env; jsdom for UI), Playwright (Chromium, fake media devices) for E2E.
- Lint: ESLint 9 flat config + typescript-eslint recommended + react-hooks.
- MediaPipe: `@mediapipe/tasks-vision` npm package; WASM runtime copied to `public/vendor/mediapipe-wasm` on postinstall; hand landmarker model downloaded once to `public/models/` via `npm run fetch:model` — no CDN dependency at runtime.
- Git: `git init -b main`, local-only, no remote (verified `git remote` is empty).

## Phase 1 — Domain Core (done, commit ec0f6a4)

- Event contracts + synchronous EventBus + SessionRecorder (events re-based to record start).
- Music theory: 24-chord vocabulary (sharp-canonical, flat aliases), real voicings (open + E/A barres), diatonic scale-mode slot mapping.
- KeyboardSimulator: slots 1–6, explicit chords C–B (Shift=minor), strum ↓/↑ (Shift accent / Ctrl soft), Space mute, R record, P pause, Esc stop.
- Storage: KeyValueAdapter (memory/localStorage w/ fallback), sanitized settings store, IndexedDB session store.

## Phase 2 — Audio Core (done)

- Karplus–Strong plucked-string synth: seeded LCG excitation, decay-targeted loop gain, brightness lowpass; autocorrelation pitch estimator (±3%).
- ProceduralGuitarEngine: LRU buffer cache, per-string strum scheduling (direction order, intensity-scaled spacing 3–40 ms), choke-on-retrigger, mute damping, narrow GuitarAudioContext interface (real/Offline/fake compatible). No samples required — fully procedural per spec.
- BeatGrid (4/4, 3/4, 6/8 + count-in) → Transport (25 ms lookahead scheduler on ctx.currentTime) → Metronome (accented clicks, visual pulse).
- AudioGraph: guitar bus → master → compressor; vocal bus present but NOT connected to master (feedback safety). LevelMeters.

## Phase 3/4 — Vision + Gesture/Motion (done as modules)

- VisionClient + module worker (MediaPipe HandLandmarker, GPU→CPU fallback, adaptive quality tiers, full camera release on stop).
- Landmark normalization (wrist-origin, scale-invariant) + HandFeatures extraction.
- Rule-based chord gesture classifier (8 gestures, priority tie-break) + GestureDebouncer (commit/retention hysteresis).
- StrumDetector (EMA + least-squares velocity, corridor gate, cooldown, calibration-relative thresholds), MuteDetector (fist hold/release), ControlGestureRecognizer (two-hand combos: ready/pause/record/stop).
- Calibrator: 2.5 s window → handScale, noise floor, neutral poses, strum corridor; actionable failure reason.

## Phase 5 — Integration (in progress)

- VisionPipeline: VisionFrame → normalize → features → classify/debounce/strum/mute/control → bus events. Detectors run on the vision clock; published events re-stamped with bus.now() (single epoch for session log + audio). Runs fully outside React.
- VisionSession: camera lifecycle + pipeline ownership; calibration persisted to localStorage (ggw.calibration.v1) with validation on load.
- UI: CameraView (mirrored video + rAF landmark/corridor overlay, no per-frame React state), CalibrateScreen (progress, retry, use-defaults, keyboard fallback), PerformScreen camera panel + 4 Hz debug stats + recalibrate. App flow: landing → setup → calibrate → perform; keyboard demo path unchanged.

## Phase 6 — Recording (done, commit 7230b18 + wiring commit)

- Contracts: recording/types.ts, performanceJson.ts (schema-conformant export doc).
- GuitarEngine.setMuted gained optional `when` for offline-scheduled damping.
- Delegated: wavEncoder, mixer, guitarRenderer (offline re-render from event log), micCapture + PCM worklet, sessionExporter (per-track failure isolation).
- PerformanceController: start/stop recording, mic capture with graceful denial (acceptance L), guided-plan auto-transport with count-in, evaluation at stop, async export with results screen navigation. Export object URLs revoked on dispose.
- ResultsScreen: mix playback, per-artifact downloads, failure list, evaluation metrics.

## Phase 7 — Guided mode (done)

- STRUM_PATTERNS (down-beats, down-up-8ths, folk-432) via getPatternForMeter(id, sig); GuidedPlan.barCount for pattern-only guided mode.
- buildExpectedEvents + evaluateSession (greedy nearest strum match ±150 ms, population-stddev timing spread, chord hit windows, unstable bars).
- SetupScreen: pattern select (filtered by time signature) + song progression input with vocabulary warning. PerformScreen: expected/next chord, next-strum arrow, bar counter.

## Phase 8 — UX polish (done, commit 7eaa127)

- Display modes on perform screen: normal / performance (minimal oversized-chord layout) / debug (stats panel forced open, 4 Hz polling gated to debug mode only).
- Full journey landing → setup → calibrate → perform → results works without dev console.

## Phase 9 — Hardening (done)

- Playwright E2E on installed Chromium: 4 keyboard-mode specs (acceptance B deterministic path) + 2 stability specs (acceptance N proxy). All 6 pass.
- Bugs found by E2E and fixed:
  - Session re-entry re-attached a KeyboardSimulator bound to the disposed controller's bus → keyboardRef nulled on exitSession so re-entry rebuilds it.
  - Record toggle desync when mixing keyboard start + UI stop → KeyboardSimulator accepts isRecording() source-of-truth callback wired to the controller store.
- A11y basics: aria-live chord readout, role=alert mic warning, labelled meters/camera panel/display-mode group.
- Windows smoke: dev server + build + E2E all run on this Windows host.

## Phase 10 — Final audit (done)

- Clean install (`npm ci`) → typecheck ✓, lint ✓, 234 unit/integration tests (24 files) ✓, production build ✓, 6 Playwright E2E ✓. Working tree clean; `git remote -v` empty; nothing ever pushed.
- Performance (scripts/perf-bench.ts, node, deterministic):
  - Vision pipeline detector chain: 0.005 ms/frame avg (5000 frames, 2 hands) — negligible against the 33 ms frame budget; MediaPipe inference itself runs in a Web Worker off the main thread.
  - Strum event → engine scheduleStrum: 0.007 ms avg (synchronous bus publish → 6 voices scheduled).
  - Cold Karplus–Strong synthesis (6 string buffers, ~12 s of audio): median 3.4 ms — ~3500× realtime; LRU cache makes repeat strums buffer-free.
  - Acceptance E (<100 ms strum latency) is therefore bounded by camera capture + MediaPipe inference on the user's hardware, not by the software path (~µs).
- Known non-blocking limitations (all hardware/environment-level):
  - 10-minute continuous soak (acceptance N) not run to wall-clock completion in automation; the E2E stability specs exercise the same record/exit/re-enter code paths repeatedly without page errors.
  - Camera/microphone behavior verified with Playwright fake media devices and unit-level mocks; real-device latency and lighting robustness require physical hardware.
  - jsdom lacks OfflineAudioContext, so the guitar-wav export failure-isolation path is unit-tested via that absence; the success path is covered by Chromium E2E (export artifact visible on results screen).
