# Autonomous Task DAG

This DAG is designed for Claude Code Supervisor + parallel subagents.

## Phase 0 — Bootstrap

Tasks:
- initialize Vite React TypeScript project;
- add lint/typecheck/test stack;
- initialize local Git if absent;
- confirm no remote;
- create app skeleton;
- create DEVELOPMENT_LOG.md;
- create domain event contracts.

Exit:
- dev server runs;
- test runner runs;
- build passes;
- first local commit.

## Phase 1 — Domain Core

Parallelizable:
- P1-A Music theory/chord voicings
- P1-B Performance event bus/types
- P1-C Keyboard simulator
- P1-D Settings/storage adapter

Exit:
- keyboard can emit chord/strum/mute events;
- event log deterministic;
- unit tests pass.

## Phase 2 — Audio Core

Parallelizable after contracts:
- P2-A Procedural plucked-string oscillator/voice
- P2-B GuitarEngine chord/strum scheduler
- P2-C Metronome/transport
- P2-D Mixer/meters

Exit:
- keyboard mode can play chords and up/down strums;
- intensity audible;
- mute works;
- metronome/count-in works;
- no camera required.

This phase MUST succeed without external samples.

## Phase 3 — Vision Core

Parallelizable:
- P3-A Camera acquisition + preview
- P3-B Hand landmark worker
- P3-C Landmark normalization/features
- P3-D Calibration module

Exit:
- two hands tracked;
- mirrored preview;
- landmarks rendered;
- debug FPS/latency shown.

## Phase 4 — Gesture + Motion

Parallelizable:
- P4-A chord gesture classifier
- P4-B chord debounce/hysteresis
- P4-C strum motion detector
- P4-D mute/control gesture detector

Exit:
- chord role emits stable events;
- strum role emits one event per swing;
- soft/accent separation works;
- handedness swap works.

## Phase 5 — Integration

Tasks:
- connect vision → events → audio;
- avoid React hot path;
- performance tuning;
- adaptive inference tier;
- calibrate default thresholds.

Exit:
- camera-driven air guitar playable;
- perceived strum latency meets target when hardware allows;
- no major UI lockups.

## Phase 6 — Recording

Parallelizable:
- P6-A microphone capture
- P6-B vocal recording
- P6-C guitar offline/live stem rendering
- P6-D master mix
- P6-E JSON export

Exit:
- complete session can produce vocal/guitar/mix/performance outputs;
- failure of one export path preserves data.

## Phase 7 — Guided Rhythm + Song Mode

Parallelizable:
- P7-A rhythm pattern model
- P7-B song progression model
- P7-C expected-event evaluator
- P7-D guided UI

Exit:
- Free Play;
- Guided Rhythm;
- Song Mode;
- chord/strum timing evaluation.

## Phase 8 — UX + Controls

Tasks:
- Normal/Performance/Debug modes;
- control buttons;
- two-hand shortcut gestures;
- permission/error UX;
- settings;
- result screen.

Exit:
- complete user journey works without dev console.

## Phase 9 — Hardening

Parallelizable:
- P9-A unit tests
- P9-B Playwright browser flows
- P9-C stress/performance checks
- P9-D accessibility basics
- P9-E Windows-specific smoke checks

Exit:
- all acceptance tests green or hardware-only checks explicitly documented.

## Phase 10 — Final Audit

Supervisor:
- build from clean install;
- run test suite;
- inspect git status;
- ensure no remote;
- review code boundaries;
- verify no secrets;
- generate final DEVELOPMENT_LOG summary;
- final local commit.

Final status should include:
- local commit hash;
- test counts;
- build result;
- measured performance;
- known non-blocking limitations.

## Phase 14 — Recognition and natural strumming (completed, 2026-10-05)

World-landmark forwarding → joint/bone geometry → exact/uncertain pose matching
→ ten chord slots and settings/help → knuckle-point calibration → bidirectional
motion legs → pick-grip/mute distinction → real browser/audio/export checks.

Exit: typecheck/lint/build green; 308 unit tests; 18 development browser tests
plus relevant final rechecks; 14 production flow tests. Real webcam/GPU still
runs at up to 30 FPS. Human recognition accuracy needs actual playing feedback.

## Phase 15 — C/L and rock usability follow-up (completed, 2026-10-05)

Human feedback -> failing natural-pose regressions -> palm-relative thumb spread
-> exclusive pointing/L decisions -> rock-specific finger-coupling tolerance
-> Cm/C/E pipeline and actual browser audio/export verification.

Exit: 322 unit/integration tests, six relevant E2E, typecheck/lint/build green.
