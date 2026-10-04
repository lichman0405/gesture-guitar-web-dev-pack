# Audio Engine Specification

## 1. Non-blocking source strategy

External guitar samples are optional.

Development MUST proceed in this order:

1. Implement a procedural guitar engine that requires no external audio assets.
2. Make the full application playable and recordable using that engine.
3. Add a sample-based engine only if redistributable assets are available without blocking the project.

No phase may fail solely because samples cannot be found.

## 2. Procedural guitar engine

Recommended MVP synthesis:
- Karplus–Strong / digital waveguide style plucked-string synthesis;
- one voice per guitar string;
- configurable damping, brightness, decay and excitation;
- optional body resonator/filter stage.

The goal is credible responsiveness, not studio-grade physical modeling.

## 3. Guitar voicing

Represent each chord as six physical guitar-string slots:

```ts
type GuitarStringNote = {
  midi: number | null; // null = do not play
  muted?: boolean;
}
```

Example conceptual C major voicing:
- low E muted
- A string C
- D string E
- G string G
- B string C
- high E string E

Use actual guitar voicings, not generic piano triads.

## 4. Strum scheduler

A strum is a sequence of individual string triggers.

Down:
- low-pitched playable string → high-pitched string

Up:
- high-pitched string → low-pitched playable string

Inter-string spacing should depend on:
- direction;
- intensity;
- preset;
- optional user strum-speed parameter.

Initial range can be around tens of milliseconds total/string spacing, tuned by ear.

Use Web Audio scheduling timestamps, not `setTimeout()` for musical timing.

## 5. Dynamics

Intensity controls:
- excitation amplitude;
- brightness;
- potentially strum spacing;
- body/resonance amount.

Muted articulation controls:
- shorter decay;
- darker timbre;
- faster damping.

## 6. Instrument presets

Stable interface:

```ts
interface GuitarEngine {
  prepare(): Promise<void>;
  setPreset(id: string): void;
  setChord(chord: string): void;
  strum(event: StrumEvent): void;
  setMuted(active: boolean): void;
  stopAll(): void;
  connect(node: AudioNode): void;
}
```

Implement:
- `ProceduralGuitarEngine` — mandatory
- `SampleGuitarEngine` — optional / future

Preset IDs:
- `acoustic-steel` — mandatory
- `nylon` — optional
- `clean-electric` — optional

## 7. Audio graph

Suggested:

```text
Procedural/Sample Guitar
        ↓
   Guitar Gain
        ↓
  Guitar Track Bus ───────────────┐
                                  ↓
Microphone → Vocal Gain → Vocal Bus → Master Bus → Monitor
                  │               │
                  │               └→ Mix Recorder
                  └────────────────→ Vocal Recorder

Guitar Track Bus ──────────────────→ Guitar Recorder
```

Prevent feedback:
- microphone must not be routed back to speakers by default;
- guitar may be monitored locally;
- vocal recording remains active without live vocal monitoring.

## 8. Metronome

Support:
- BPM range reasonable for songs (e.g. 40–240)
- 4/4
- 3/4
- 6/8
- audible on/off
- visual pulse independent of audible click
- 1 bar count-in by default, configurable

Use an audio-clock-driven scheduler.

## 9. Tone.js

Tone.js may be used where it simplifies:
- transport;
- metronome;
- musical timing.

Do not couple core domain events to Tone-specific classes. Wrap it.
