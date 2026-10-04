# Gesture Guitar Web — Autonomous Development Base Pack

A Windows-first, local-only development specification for an autonomous Claude Code workflow using DeepSeek-Flash.

## Product in one sentence

A browser-based "air guitar" application that tracks only the user's hands through a webcam, maps the chord-hand gesture to chords, maps the performance-hand motion to guitar strums, records singing through the microphone, and exports vocal, guitar, mixed audio, and structured performance data.

## Hard project constraints

- Development environment: Windows.
- Main target: desktop Chrome / Edge.
- No backend required for MVP.
- No account system.
- No cloud inference.
- Camera and microphone data stay local by default.
- Claude Code is the only development harness.
- Claude Code is connected to DeepSeek-Flash.
- Claude Code may use parallel subagents internally.
- The Supervisor owns the complete task context and DAG.
- Subagents receive only the minimum context needed for their tasks.
- Git is local-only.
- Local commits are required.
- Never create a remote, push, open a PR, or depend on GitHub.
- Missing guitar samples are NEVER a blocker.
- A playable procedural guitar synth is the mandatory fallback.
- No human confirmation is required between phases.
- Continue autonomously until all acceptance criteria pass or a genuinely impossible external hardware/browser condition prevents execution.

## Recommended first command

Open this directory in Claude Code and paste the full contents of:

`CLAUDE_CODE_GOAL_PROMPT.md`

## Documentation map

- `docs/PRODUCT_SPEC.md` — behavior and user-facing scope
- `docs/ARCHITECTURE.md` — runtime architecture and module boundaries
- `docs/GESTURE_SPEC.md` — hand roles, gesture mapping, debounce, strum detection
- `docs/AUDIO_ENGINE.md` — guitar synthesis, timing, metronome, routing
- `docs/RECORDING_EXPORT.md` — vocal/guitar/mix recording and exports
- `docs/UX_FLOW.md` — screens and interaction states
- `docs/WINDOWS_SETUP.md` — Windows-first implementation constraints
- `docs/AUTONOMOUS_DEV_PROTOCOL.md` — Supervisor/subagent operating rules
- `docs/TASK_DAG.md` — execution phases, dependencies and parallelism
- `docs/ACCEPTANCE_TESTS.md` — testable Definition of Done
- `docs/DECISIONS.md` — frozen decisions made during discovery
- `schemas/performance.schema.json` — performance event export contract
- `scripts/bootstrap.ps1` — suggested local project bootstrap
