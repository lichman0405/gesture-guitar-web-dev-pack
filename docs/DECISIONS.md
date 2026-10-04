# Frozen Decisions

These decisions are already approved. Do not ask the user to re-decide them.

1. Product form: desktop-first web application.
2. Core audio approach: hybrid architecture with procedural synthesis fallback and optional real samples later.
3. Chord system:
   - Scale Mode: hand gestures map to scale degrees / chord slots.
   - Custom Mode: user maps supported gestures to arbitrary chords.
4. Chord-hand and performance-hand are abstract roles, not hardcoded physical sides.
5. Right-handed default: left hand = chord hand, right hand = performance hand.
6. Left-handed mode swaps roles.
7. Performance-hand MVP recognizes:
   - down strum
   - up strum
   - soft vs accent based on motion velocity
   - mute
8. System control:
   - page buttons are canonical
   - special two-hand held gestures may be shortcuts
   - destructive/state-changing actions require hold/confirmation
9. Recording output:
   - vocal track
   - guitar track
   - master mix
   - performance event JSON
   - share-friendly compressed audio when practical
10. Camera UI:
   - mirrored camera preview
   - hand landmark overlay
   - Normal mode
   - Performance mode
   - Debug/Calibration mode
11. User posture:
   - seated or standing
   - mandatory quick calibration before performance
12. Recognition timing:
   - chord gestures use short debounce
   - strum triggering prioritizes low latency
13. MVP target:
   - Windows + recent desktop Chrome/Edge
   - no mobile acceptance requirement
   - no Safari/Firefox acceptance requirement
14. Architecture:
   - local-first
   - no server computation required
   - Web Worker/WASM/WebGPU allowed
   - AudioWorklet allowed
15. Rhythm:
   - BPM
   - metronome
   - 4/4, 3/4, 6/8
   - count-in
16. Play modes:
   - Free Play
   - Guided Rhythm
   - Free Chord Mode
   - Song Mode
17. Song Mode:
   - user-defined chord progression
   - BPM
   - meter
   - optional strumming pattern
18. Gesture customization:
   - MVP uses fixed reliable gesture vocabulary
   - user can remap those gestures to chords
   - later version may support user-recorded gesture templates
19. Instruments:
   - Acoustic Steel is the main MVP target
   - Nylon and Clean Electric are optional presets if inexpensive to implement
   - preset interface must exist regardless
20. Feedback:
   - lightweight performance summary
   - no gamified rank system
21. Technology baseline:
   - React
   - TypeScript
   - Vite
   - MediaPipe Hand Landmarker or equivalent local hand landmark model
   - Web Audio API
   - Tone.js may be used for scheduling/metronome
   - Web Worker
   - AudioWorklet when useful
   - Vitest
   - Playwright
22. Developer simulation mode is mandatory:
   - keyboard can emit chord, strum, mute and control events without a camera.
23. Development orchestration:
   - Claude Code is the sole harness.
   - Claude Code uses DeepSeek-Flash.
   - parallel subagents are allowed.
   - Supervisor owns integration, testing and local commits.
24. Git:
   - local repository only.
   - NEVER configure remote.
   - NEVER push.
   - NEVER create PRs.
25. Missing external samples cannot stop development.
   - Build a procedural plucked-string guitar engine if suitable redistributable samples are absent.
