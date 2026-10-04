# Product Specification

## 1. Core use case

A user opens the web app, grants camera and microphone permissions, calibrates both hands, selects a musical key or a custom chord set, selects BPM / meter if desired, and performs by:

- holding a chord gesture with the chord hand;
- moving the performance hand down/up to strum;
- varying movement speed to control soft/accent dynamics;
- using a mute gesture for damping;
- singing into the microphone.

The app produces synchronized guitar sound in real time and can record the session.

## 2. Main modes

### 2.1 Free Play

No expected progression or rhythm pattern.

User controls:
- key
- chord mapping
- instrument preset
- metronome optional
- handedness

### 2.2 Guided Rhythm

The user selects a strumming pattern. The UI displays the expected next strum direction and timing.

Metrics:
- direction correctness
- timing error in milliseconds
- missed strums

### 2.3 Song Mode

User configures:
- chord progression by bar
- BPM
- time signature
- optional strumming pattern

The UI displays:
- current expected chord
- next chord
- current bar/beat
- detected chord
- timing feedback

The system never auto-switches the user's chord. It evaluates the user's gesture.

## 3. Chord model

### 3.1 Scale Mode

Gesture slots represent diatonic chord roles rather than fixed chord names.

MVP mapping:

| Slot | Major key role |
|---|---|
| I | major |
| ii | minor |
| iii | minor |
| IV | major |
| V | major |
| vi | minor |

Example in C major:
- I → C
- ii → Dm
- iii → Em
- IV → F
- V → G
- vi → Am

### 3.2 Custom Chord Set

User selects a supported visual gesture and binds it to any supported chord symbol.

Initial supported chord vocabulary should cover at least:
- C, Cm
- C#, C#m / Db, Dbm as aliases if desired
- D, Dm
- D#, D#m / Eb, Ebm
- E, Em
- F, Fm
- F#, F#m / Gb, Gbm
- G, Gm
- G#, G#m / Ab, Abm
- A, Am
- A#, A#m / Bb, Bbm
- B, Bm

Extended seventh/sus/add chords are architecture-ready, not required for first acceptance.

## 4. Fixed gesture vocabulary for MVP

The implementation may tune exact geometric classifiers, but the product-level gesture set should aim for 6–8 visually separable gestures.

Suggested initial set:
- index only
- index + middle
- index + middle + ring
- four fingers
- open palm
- thumbs up
- OK-like circle
- closed fist

If any gesture proves unreliable in real camera testing, replace it with a more separable gesture without changing the slot abstraction.

## 5. Performance-hand vocabulary

- Down strum
- Up strum
- Soft down
- Accent down
- Soft up
- Accent up
- Mute

The event must contain continuous velocity/intensity where possible even if UI labels reduce it to soft/accent.

## 6. System controls

Canonical controls are clickable UI controls:
- Start / Ready
- Pause / Resume
- Record
- Stop
- Save / Export
- Settings
- Recalibrate

Optional two-hand gesture shortcuts:
- Ready
- Pause/Resume
- Start Recording
- Stop Recording

To avoid accidental state changes:
- control gestures must involve both hands;
- control gestures must be held for a configurable duration;
- recording/stop may show a short visual confirmation countdown.

## 7. Calibration

Calibration lasts roughly 2–3 seconds and records:
- normalized hand scale;
- neutral hand positions;
- chord-hand operating region;
- performance-hand strumming region;
- camera handedness/mirroring assumptions;
- baseline motion noise.

All motion thresholds must be normalized to hand/body-relative units, never hardcoded pixels.

## 8. Display modes

### Normal
- camera preview
- mirrored video
- landmarks
- current chord
- current strum action
- recording status
- audio meters

### Performance
- minimized/hidden camera
- large current chord
- next chord
- strum cue
- beat indicator
- record timer

### Debug / Calibration
- all landmarks
- handedness
- classifier scores
- chord candidate
- debounce state
- wrist/palm velocity
- strum thresholds
- FPS
- per-stage latency
- audio state

## 9. Recording

Record and export:
- vocal track
- guitar track
- master mix
- `performance.json`

Target file names:
- `vocal.wav`
- `guitar.wav`
- `mix.wav`
- `performance.json`
- optional `mix.webm` or other browser-supported compressed share format

## 10. Performance feedback

After a guided/song recording, show:
- chord accuracy
- strum direction accuracy
- average timing offset
- timing spread
- missed expected strums
- unexpected extra strums
- unstable chord gestures
- bar-level issues

No S/A/B rank and no AI coaching required.

## 11. Privacy

Default:
- camera frames remain local;
- microphone audio remains local;
- hand landmarks remain local;
- no telemetry is required;
- no upload is required.

Permission denial must fail gracefully and clearly.
