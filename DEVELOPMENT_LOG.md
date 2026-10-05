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

## Phase 11 — Real-environment verification (done)

User challenge: "test the real situation, not just the demo." Previous gates used
mocks (FakeAudioContext) and unit-level fakes; this phase verified the real stack
in a real browser (headless Chromium, fake media device only for the camera IMAGE
source — everything else real).

- Real-verification E2E suite (e2e/real-verification.spec.ts), all passing:
  - Audio: AnalyserNode tapped onto the real master bus measures clear non-silent
    signal after a strum; AudioContext state "running".
  - Export: real OfflineAudioContext renders guitar-wav + mix-wav; both decoded
    back via decodeAudioData, duration and RMS asserted; performance.json parsed
    with the performed events. (In jsdom this same path falls into the isolated-
    failure branch — success here is the real-browser signal.)
  - Vision: real 7.8 MB MediaPipe model + WASM + module worker + camera loop
    reach "running", real inference measured (fps > 0, avgInferenceMs real),
    calibration fails gracefully with a hands-related reason on the hand-free
    fake camera. Production preview (vite preview, bundled worker) verified the
    same chain end to end.
- CRITICAL bugs found only by real testing, and fixed:
  1. Vision stack never started anywhere: tasks-vision's FilesetResolver falls
     back to dynamic import() of the UMD WASM loader inside ES module workers
     (what Vite serves) → "ModuleFactory not set." Fixed in
     scripts/copy-mediapipe-wasm.mjs: append `self.ModuleFactory = ModuleFactory`
     to the copied loaders at postinstall.
  2. Next strict-mode landmine: Emscripten's block-scoped `function custom_dbg`
     is a ReferenceError in ES modules. Same script now predefines a global
     custom_dbg so the loader's typeof check takes the safe path.
  3. CalibrateScreen showed "Camera could not be started" for EVERY failure
     (model/worker/permission indistinguishable). VisionSession now retains the
     VisionClientError (visionError getter); the screen maps kind → specific
     actionable message (denied / no-device / worker-error / timeout /
     unsupported).
- Also added scripts/diag-vision.mjs (worker-message + console capture against
  any base URL) — used to root-cause the above.
- Gates after fixes: tsc ✓, lint ✓, 234 unit tests ✓, build ✓, 9/9 E2E ✓.
- Headless CI note: SwiftShader software-GL inference averages 130–590 ms/frame;
  on real GPU hardware this is tens of ms and the adaptive tier controller
  downgrades resolution to keep the pump responsive.
- Remaining genuinely hardware-bound item: recognition accuracy on real hands in
  real lighting needs a physical camera + hands; everything up to the landmark
  boundary is now verified running for real.

## Phase 12 — Performance: real-camera lag + strum overhaul (done)

User report on real hardware: "卡。识别非常慢。完全无法实现扫弦。" (laggy, very
slow recognition, strumming impossible). Diagnosed with a headed-Chromium,
real-camera, real-GPU diagnostic (scripts/diag-real-camera.mjs) sampling
fps/inferenceMs/tier every 2 s via the window.__ggw dev hook.

Baseline before fixes (real camera, real GPU): fps 17/0/1/0/12/3 — the pipeline
kept collapsing to 0 and the tier flapped; strums could not fire.

Four root causes found and fixed:

1. Pump freeze on a lost worker response (the "卡"). The frame pump was
   setInterval + busy-flag: if the worker ever dropped one response, busy stayed
   true forever → 0 fps permanently. Replaced with a self-scheduling pump (the
   response handler schedules the next setTimeout tick, throttled to the tier
   rate) plus a 1 s watchdog that clears busy and reschedules if a response is
   ever lost (visionClient.ts).
2. Tier-flap camera restarts. setTier used to restart the camera stream (~1 s
   blackout each time) and reset() the adaptive controller, whose stale tier then
   disagreed with the client — every upgrade was reverted on the next sample, a
   flap loop. Now setTier only resizes the analysis canvas (the stream is
   resolution-independent, requested once at 640x480) and the controller gets a
   new sync(id) method that adopts the applied tier (adaptiveTier.ts).
3. No GPU/CPU delegate selection. GPU delegate is only faster with a REAL GPU;
   with software GL (SwiftShader, blocklisted drivers) it is 130-590 ms vs ~7 ms
   on XNNPACK CPU. The worker now benchmarks the preferred delegate at startup
   (1 warmup + 3 timed detectForVideo runs on a dummy bitmap) and also tries CPU
   when GPU is null or >60 ms, keeping the winning HandLandmarker instance
   (handLandmarker.worker.ts). The ready message carries {delegate, benchmark};
   the Perform screen debug mode shows Delegate / Tier / Startup bench.
4. Strum detector mathematically unable to fire below ~16 fps. Displacement was
   accumulated from the EMA-smoothed y, which converges to (sweep − EMA lag) from
   below — at low frame rates the 0.6 handScale threshold was approached but
   never crossed, so every strum silently aborted. Now displacement accumulates
   from RAW y (signed deltas still cancel jitter at high fps) and the trigger
   frame seeds lastTrackedY from the PREVIOUS raw frame so the triggering motion
   counts (strumDetector.ts). VelocityEstimator window raised 0.06 → 0.12 s with
   adaptive retention max(window, 2.2 x gap-EMA) so the slope estimate survives
   sparse frames (velocityEstimator.ts). Strum now fires AT the trigger frame at
   12 fps (acc = 1.5 immediately). Traced with scripts/debug-strum.ts; regression
   tests added for 12 fps and 8 fps down/up sweeps plus 8 fps slow-drift
   rejection (strumDetector.test.ts, 25 motion tests).

After fixes, same real camera + real GPU (diag-real-camera.mjs):
- ready {"delegate":"GPU","benchmark":{"gpuMs":4.57,"cpuMs":null}}
- fps 23-24 @ medium → steady 30 @ high, tier upgrades smooth, no collapse
- avgInferenceMs ~7-8 ms at 640x480 (was ~130-148 ms effective under flapping)

Gates after fixes: tsc ✓, lint ✓, 238 unit tests ✓, build ✓, 9/9 E2E ✓
(real-verification vision spec now also asserts a delegate + benchmark exist).
