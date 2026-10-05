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

## Phase 13 — Usable local release and lifecycle hardening (2026-10-05)

User request: make the app usable in normal real-world operation. Work is local
only; Karplus–Strong synthesis, worker inference, the startup delegate benchmark
and the one-second frame watchdog remain intact.

Changes:
- Camera capture now owns a separate video element outside React. Each screen
  binds only its visible preview, so calibration → performance, display-mode
  switching and results → re-record preserve live video and inference.
  Calibration preview also reattaches after React StrictMode effect replay;
  browser regression checks the live preview both before and after calibration.
- VisionSession owns startup immediately. Back/exit cancels worker initialization
  and releases late camera permission results; startup failures release tracks.
  Explicit inference error responses also schedule another frame (the watchdog
  alone could not recover once the error handler cleared the busy flag).
- Keyboard and vision performance controls are enabled only on the performance
  screen, preventing setup/calibration/results from starting hidden recordings.
- Microphone requests and worklet setup are scoped to the current take. Stop/exit
  invalidates pending work, releases late tracks, and disposes stale captures.
  Duplicate recording starts and starts during export are ignored. Disposed
  controllers cannot navigate to results or create export URLs after export.
- The PCM worklet uses Vite's compiled worker URL in production. Its output is
  connected to the audio destination to keep processing active, but contains only
  silence: microphone samples are never copied to speaker output.
- Recording includes a snapshot of an already selected chord/mute. Microphone
  capture startup offset is retained and applied when mixing, preventing delayed
  authorization from moving the vocal track to the start of the guitar track.
- Song progression input keeps its own draft (typed spaces previously disappeared
  immediately). Invalid/empty progressions block entry; incompatible meter/pattern
  settings fall back to down-beats. Stored keys, custom chords and calibration
  data are validated before reaching the realtime modules.
- Added setup and live strum sensitivity, a Chinese gesture-to-current-chord guide,
  configured keyboard entry from setup, microphone readiness feedback, export and
  recalibration guards, and responsive layout adjustments.
- Start-Guitar.cmd / scripts/start-local.ps1 prepare dependencies, WASM patches and
  the model, then open a local browser. README now documents actual usage.
- Final review also found a retained analyser input: disconnecting the analyser's
  output did not remove guitarBus → analyser. Meter teardown now removes that
  specific input while preserving the master connection. Repeated take tests
  count actual browser connections, not just component mounts.
- Two-hand record toggles consult the controller's current recording state, so
  button/keyboard/gesture controls stay synchronized. Disabling/resetting the
  pipeline releases its active mute, preventing a muted engine after re-entry.
  Guided recording restarts count-in even after metronome practice.

Verification:
- npm ci completed, including all three copied WASM loader patches.
- Typecheck and lint passed; production build includes a compiled PCM worklet.
- 252 unit/integration tests passed (27 files); new regressions cover microphone
  races, stale export completion, initial chord/mute, vocal alignment, independent
  camera capture, explicit inference errors, the one-second watchdog, analyser
  inputs, actual recording toggle state, mute release and guided count-in reset.
- Development browser suite: 16 passed; the opt-in soak is run separately.
- Production preview suite: 13 passed (keyboard, recording cycles, camera preview,
  mode switching, pending permissions, denial fallback and actual downloads).
  Vocal WAV downloaded and checked for non-silent PCM; initial G chord verified
  in the downloaded JSON. No dev introspection hook is required for these tests.
- Headed Chromium with the real webcam/GPU: startup GPU benchmark 4.87 ms;
  inference samples 9.7, 7.6, 7.1, 7.1, 6.7, 7.4 ms; FPS 24, 24, 23, 29, 29, 30.
- Full ten-minute debug-mode soak: PASSED, 600 wall-clock seconds of performance,
  19 recording/export cycles, zero page errors; uses real browser audio,
  MediaPipe model/WASM/worker, fake camera/microphone sources, repeated recording
  and local WAV export. Its duration is wall-clock time, not a mocked clock.
  An initial run reached 508 seconds / 16 recordings with zero page errors, then
  was deliberately stopped for the analyser/toggle fixes discovered in review.
  The final run additionally asserts one analyser input during performance, zero
  on results, microphone tracks ended after each take, and all tracks ended on exit.
  All those resource assertions passed; the full test finished in 10.1 minutes.
- Procedural performance benchmark: vision detector chain 0.0084 ms/frame;
  bus-to-six-voice scheduling 0.0099 ms; cold KS synthesis median 4.63 ms.

Environment notes:
- Windows sandbox sessions used different AppData browser caches. Test tooling
  supports a workspace .cache/ms-playwright directory and workspace downloads.
- Restricted Chromium downloads were cancelled by the sandbox; the identical
  download test passed when run in the host environment. Browser suites and the
  soak were therefore run there, against local servers only.
- An explicitly managed local server (GGW_EXTERNAL_SERVER=1) avoided restricted
  Windows child-process teardown hanging the test runner. Default tests still
  require their own server; production checks use port 5174 independently.

Remaining limitation: real-hand gesture accuracy across users, poses and lighting
has not been systematically measured. The real-device diagnostic measures the
camera/inference pipeline; it does not prove recognition accuracy on a human.

## Phase 14 — Finger recognition and natural strumming (2026-10-05)

User-reported problems: five-finger/open-palm and thumbs-up were unreliable,
normal alternating strokes did not behave like guitar strumming, and six chord
poses were insufficient.

Changes:
- Worker now forwards MediaPipe's metric worldLandmarks. Finger geometry uses
  these 3-D points; fallback image geometry corrects x/z vs y aspect ratio.
  Motion/overlay positions remain in normalized image coordinates.
- Finger extension uses PIP, DIP, MCP direction and local bone-length reach.
  Thumb uses MCP/IP straightness, local reach and abduction from the index base,
  instead of requiring a long wrist-to-tip distance. Curl follows joint extension.
- Classifier requires the requested finger mask rather than giving a wrong pose
  0.7 confidence for one mismatched finger. Partial bends yield uncertainty;
  chord debounce/retention preserves the previous chord during transitions.
  OK pinch now gets usable confidence throughout its accepted distance range.
- Short-lived hand-label flicker is resolved by wrist continuity; both hands are
  assigned uniquely even when output order changes. Tracks expire after 0.4 s.
- New fixed chord poses: little finger, index+little finger (rock), thumb+index
  (L), thumb+little finger (phone). Ten slots retain the original first six;
  C mapping is C, Dm, Em, F, G, Am, D, E, Cm, Bb (canonical A#). All twelve keys
  transpose the extra II/III/i/bVII slots. Custom mode assigns any of the 24
  supported major/minor chords, persists all ten slots, and shows pose names.
  Keyboard slots 7/8/9/0 are available; 0 selects slot 10.
- Strums follow the index/middle MCP midpoint, allowing wrist pivot as well as
  translation while ignoring finger-only pose changes. Calibration uses the same
  point, performance-hand scale, median neutral and robust MAD vertical noise.
  Old wrist-centered persisted calibration is rejected via motionPoint metadata.
- Detector emits once per directional leg, re-arms on a noise-qualified reversal
  without requiring a pause, counts displacement from the true extremum, and
  accepts a corridor crossing between sparse frames. Default displacement is
  0.35 hand scales (was 0.6), bounded below by four times measured noise. Hand
  loss, >0.3 s stalls and duplicate timestamps do not create phantom strokes.
  The 90 ms refractory period and same-direction rest guard remain.
- Pick grip (thumb/index touch, index PIP >=95 degrees) is reserved and does not
  activate fist mute. A fully closed index still distinguishes deliberate fist.
  Active strumming resets system holds so two open hands do not stop a G chord.
- Live help, calibration instructions, yellow tracking-point overlay, per-hand
  finger extension and velocity/displacement/threshold debug readouts updated.
  debug-strum.ts uses the detector's public diagnostics instead of removed fields.
- Procedural Karplus-Strong audio, outside-React processing, WASM patches, startup
  delegate benchmark and one-second worker watchdog retained.

Verification:
- Typecheck, lint and production build passed.
- 308 unit/integration tests passed (30 files). Geometry checks cover 13 poses on
  both physical hands with rotation, 3-D tilt, scale and landmark jitter (468
  combinations); separate regressions cover short thumbs, curled DIP, half-bent
  fingers, hand-label errors, calibration outliers and persisted compatibility.
- Continuous alternating strokes pass at 8/12/24/30/60 FPS, and sinusoidal wrist
  strokes at eight strokes/second. Pipeline checks include a fixed wrist pivot,
  finger-only changes without phantom strums, open-palm playing without stop,
  and normal pick-grip articulation versus deliberate fist mute.
- Development browser suite: 18 passed (ten-minute soak remains opt-in; it was
  completed in Phase 13 and was not repeated for this change). After final
  pick-grip/MAD changes, relevant gesture/audio/export/model tests rechecked.
  Ten real detector poses and twenty alternating pick-grip strokes reached real
  browser audio and recording JSON; all strokes had normal articulation.
- Production browser flows: 14 passed; the dev-only landmark injection test is
  skipped in production. New custom slots persist and work in the built app.
- Headed real-camera/GPU diagnostic: startup GPU 5.30 ms; measured inference
  10.6, 8.5, 7.8, 6.8, 7.8, 7.4 ms; FPS 24,24,24,30,29,30.
- Detector-chain benchmark before the final small grip/MAD changes: 0.0095 ms
  per two-hand frame; bus-to-six-voice scheduling 0.0063 ms; cold KS synthesis
  median 3.32 ms. debug-strum.ts at 8 FPS emits one down event and runs cleanly.

Practical limit: geometric regressions use synthetic landmarks, not labeled
human-video accuracy measurements. Real-device diagnostics verify performance,
not recognition correctness for all people/lighting/occlusion conditions. The
updated app should be refreshed and recalibrated in the actual playing pose.
