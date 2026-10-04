# Runtime Architecture

## 1. Architectural principle

"Pure frontend" means "no mandatory server", not "single-threaded JavaScript".

The system must isolate:
- UI rendering
- vision inference
- gesture interpretation
- motion estimation
- music event generation
- real-time audio
- recording/export

## 2. Top-level pipeline

```text
Camera
  │
  ├── preview → Canvas/video UI
  │
  └── downsampled frames
         ↓
    Vision Worker
    Hand Landmarker
         ↓
   normalized landmarks
         ↓
 ┌──────────────────────┐
 │ Gesture Engine       │
 │ - chord classifier   │
 │ - control classifier │
 │ - debounce           │
 └──────────────────────┘
         │
         ├───────────────┐
         ↓               ↓
   Chord Events      Motion Engine
                     - velocity
                     - direction
                     - hysteresis
                     - cooldown
                          ↓
                     Strum Events
                          │
                          └──────┐
                                 ↓
                         Performance Bus
                                 ↓
                         Music / Guitar Engine
                                 ↓
                         Web Audio Graph
                          ┌──────┴────────┐
                          ↓               ↓
                      monitoring       recording
                                           ↑
Microphone → Audio Input / Worklet ─────────┘
```

## 3. React must not own realtime state

React owns:
- page navigation
- user settings
- mode configuration
- summarized display state

React must not:
- ingest every camera frame;
- calculate every landmark sample;
- schedule individual string plucks;
- serialize high-rate performance history on each render.

Use an event bus/store with rate-limited UI snapshots.

## 4. Proposed source layout

```text
src/
  app/
    App.tsx
    routes/
    state/

  vision/
    handLandmarker.worker.ts
    visionClient.ts
    normalizeLandmarks.ts
    types.ts

  gesture/
    chordGestureRecognizer.ts
    controlGestureRecognizer.ts
    gestureFeatures.ts
    gestureDebouncer.ts
    gestureVocabulary.ts

  motion/
    strumDetector.ts
    velocityEstimator.ts
    motionSmoother.ts
    calibration.ts

  music/
    theory/
      keys.ts
      chords.ts
      voicings.ts
    engine/
      GuitarEngine.ts
      ProceduralGuitarEngine.ts
      SampleGuitarEngine.ts
      InstrumentPreset.ts
    timing/
      transport.ts
      metronome.ts
      patterns.ts

  audio/
    graph.ts
    mixer.ts
    meters.ts
    worklets/
    recording/

  performance/
    eventBus.ts
    eventTypes.ts
    session.ts
    evaluator.ts

  storage/
    settingsStore.ts
    indexedDb.ts
    adapters.ts

  ui/
    camera/
    overlays/
    performance/
    settings/
    recording/
    results/

  debug/
    keyboardSimulator.ts
    syntheticLandmarks.ts
    diagnostics.ts

  test/
```

## 5. Stable event contracts

### Chord event

```ts
interface ChordEvent {
  type: "chord";
  t: number;
  slot?: string;
  chord: string;
  confidence: number;
  source: "vision" | "keyboard" | "test";
}
```

### Strum event

```ts
interface StrumEvent {
  type: "strum";
  t: number;
  direction: "down" | "up";
  velocity: number;    // normalized
  intensity: number;   // 0..1
  articulation: "normal" | "muted";
  source: "vision" | "keyboard" | "test";
}
```

### Mute event

```ts
interface MuteEvent {
  type: "mute";
  t: number;
  active: boolean;
}
```

All audio engines consume performance events. They must not import camera or MediaPipe modules.

## 6. Performance budget

Target on a normal recent Windows laptop:

| Stage | Target |
|---|---:|
| Preview | >= 30 FPS |
| Hand inference | >= 20 FPS |
| Typical hand inference | ideally < 50 ms |
| Chord perceived switch | < 200 ms |
| Strum-to-audible response | < 100 ms |
| Audio scheduling jitter | inaudible |
| UI | responsive under load |

## 7. Adaptive performance

Implement a simple controller:

- start at medium inference resolution;
- track moving average inference time;
- reduce inference resolution / rate if overloaded;
- optionally disable cosmetic landmark effects;
- never degrade audio timing first.

Suggested tiers:

| Tier | Inference |
|---|---|
| High | 640×480 @ ~30 Hz |
| Medium | ~512×384 @ ~24 Hz |
| Low | ~448×336 @ ~18–20 Hz |

Exact values may be tuned empirically.

## 8. Storage

Use:
- localStorage for tiny preferences;
- IndexedDB for session metadata / larger structured data if needed;
- Blob downloads for audio exports.

Define an adapter interface so cloud persistence could be added later without changing domain logic.
