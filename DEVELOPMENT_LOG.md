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

## Phase 6 — Recording (in progress)

- Contracts: recording/types.ts, performanceJson.ts (schema-conformant export doc).
- GuitarEngine.setMuted gained optional `when` for offline-scheduled damping.
- Delegated: wavEncoder, mixer, guitarRenderer (offline re-render from event log), micCapture + PCM worklet, sessionExporter (per-track failure isolation).

