# /goal — Build Gesture Guitar Web autonomously

You are the sole development Supervisor for this repository.

Your development harness is Claude Code using DeepSeek-Flash. You may create/use parallel subagents internally when this improves throughput.

Your objective is to build the entire application described by this repository from zero to a tested MVP, autonomously, on Windows.

## Read first

Before editing code, read all of:

- README.md
- docs/DECISIONS.md
- docs/PRODUCT_SPEC.md
- docs/ARCHITECTURE.md
- docs/GESTURE_SPEC.md
- docs/AUDIO_ENGINE.md
- docs/RECORDING_EXPORT.md
- docs/UX_FLOW.md
- docs/WINDOWS_SETUP.md
- docs/AUTONOMOUS_DEV_PROTOCOL.md
- docs/TASK_DAG.md
- docs/ACCEPTANCE_TESTS.md
- schemas/performance.schema.json

Treat those files as the project contract.

## Non-negotiable operating rules

1. Work autonomously from start to finish.
2. Do not ask the user routine implementation questions.
3. Do not require human confirmation between phases.
4. Make reasonable engineering decisions yourself and record them in DEVELOPMENT_LOG.md.
5. Maintain a task DAG and execute independent work in parallel with subagents where appropriate.
6. Supervisor keeps full project context.
7. Give each subagent only the minimum context/files/contracts it needs.
8. Subagents do not redefine scope.
9. Supervisor reviews and integrates all subagent output.
10. Run tests after every meaningful integration.
11. On failure: diagnose, fix, rerun. Do not stop merely because a test failed.
12. Create local Git commits at meaningful phase boundaries.
13. This repository is LOCAL ONLY.
14. Never add a Git remote.
15. Never push.
16. Never create a GitHub repository.
17. Never open a pull request.
18. Never use GitHub as a required dependency for project completion.
19. Do not expose secrets.
20. Keep the working tree clean after phase commits.

## Critical audio rule

Lack of guitar samples is NOT a blocker.

You MUST first implement a self-contained procedural guitar synthesizer, preferably a Karplus–Strong / plucked-string approach, with realistic guitar chord voicings and per-string strum scheduling.

The full MVP must be playable, recordable and exportable using the procedural engine alone.

If suitable redistributable real guitar samples are easy to integrate later, add a SampleGuitarEngine behind the same interface. If not, continue without it. Never ask the user for samples.

## Critical architecture rule

Do not put realtime camera or audio processing into React render loops.

Use clear domain boundaries:
- vision
- gesture
- motion
- performance events
- music/audio
- recording
- UI

Use Web Worker for vision where practical.
Use Web Audio scheduling for musical timing.
Use AudioWorklet if it materially improves realtime audio behavior.
Use keyboard simulation as a mandatory first-class development/debug path.

## Implementation order

Follow docs/TASK_DAG.md.

In particular:

### First playable milestone
Before integrating camera:
- keyboard chooses chords;
- keyboard emits up/down strums;
- procedural guitar produces sound;
- intensity works;
- mute works;
- metronome works.

This gives a deterministic end-to-end audio baseline.

### Then vision
Implement camera acquisition, two-hand landmarks, role mapping, calibration, gesture recognition, debounce, strum motion detection and handedness swap.

### Then recording
Implement vocal, guitar, mix and performance JSON exports.

### Then guided/song features
Implement patterns, expected chords, feedback and results.

## Testing

Use:
- unit tests for theory, gesture geometry, debounce, strum logic, event evaluation;
- browser tests for UI and keyboard simulation;
- real camera/mic smoke testing when hardware/permissions are available;
- synthetic landmark traces for automated motion/gesture tests.

Acceptance is defined by docs/ACCEPTANCE_TESTS.md.

## Performance

Continuously measure:
- vision FPS
- vision inference latency
- strum event latency
- UI responsiveness

Implement graceful adaptive vision quality rather than sacrificing audio timing.

## Windows

The project must be directly usable from Windows/PowerShell.
Do not require WSL.
Do not write Bash-only core workflow scripts.

## Completion behavior

Do not stop after scaffolding.
Do not stop after a prototype.
Do not stop after implementing only gesture recognition.
Do not stop because samples are missing.
Do not stop because thresholds need tuning.
Do not ask the user whether to continue.

Continue until the entire MVP contract is implemented and tests pass as far as the local environment can verify.

If a genuinely unavoidable hardware limitation prevents one final smoke test:
- complete all other work;
- create synthetic/automated coverage;
- document the exact remaining hardware-only check;
- still finish the repository.

## Final report

When complete, output a concise final report containing:
- final local commit hash
- major implemented capabilities
- test/build results
- measured performance
- remaining non-blocking limitations
- confirmation that no remote exists and nothing was pushed

Then stop.
