# Gesture and Motion Specification

## 1. Role abstraction

Never write core logic as "left hand always chords, right hand always strums".

Use:

```ts
type HandRole = "chord" | "performance";
```

Handedness setting maps detected physical hand → role.

## 2. Landmark normalization

Before classification:
1. translate coordinates to a palm/wrist-centered origin;
2. normalize scale by a stable hand metric;
3. optionally rotate to a canonical palm orientation;
4. derive robust features:
   - finger joint angles;
   - fingertip-to-palm distances;
   - fingertip pair distances;
   - finger extension flags;
   - palm normal/orientation when reliable.

Do not classify from raw pixel coordinates.

## 3. Chord gesture recognition

MVP should prefer deterministic geometric classification before training a custom model.

Output:

```ts
interface GestureCandidate {
  gestureId: string;
  confidence: number;
}
```

## 4. Debounce / hysteresis

Suggested starting logic:

- candidate must remain dominant for 120–200 ms before committing;
- short recognition dropouts retain the committed chord for 300–500 ms;
- a new chord requires confidence threshold + stability threshold;
- UI may display candidate progress before commit.

All values are configurable constants.

## 5. Strum detection

The performance hand uses motion history, not only discrete hand poses.

Candidate primary tracking point:
- wrist or palm center.

Maintain timestamped normalized positions.

Estimate:
- vertical velocity;
- smoothed velocity;
- direction;
- movement amplitude;
- crossing of calibrated strum corridor.

A strum event requires:
1. correct direction;
2. velocity above threshold;
3. sufficient displacement;
4. crossing/entering the strum activation region;
5. not within refractory/cooldown period of the same swing.

Use hysteresis to avoid multiple events from one stroke.

## 6. Intensity

Map normalized speed/amplitude to `intensity ∈ [0,1]`.

UI labels:
- soft
- accent

Audio engine should receive the continuous value.

## 7. Mute

Mute should be a pose that is reliably distinct from the chord-hand vocabulary in the performance-hand context, likely a closed fist or equivalent.

Mute behavior:
- damp existing synthetic string voices quickly;
- subsequent strums while mute is active use muted articulation.

## 8. Control gestures

System controls require:
- both hands;
- explicit pose combination;
- hold duration;
- state-dependent interpretation.

Performance gestures must win over control gestures unless the full control condition is satisfied.

## 9. Calibration-derived thresholds

Store:
- neutral regions;
- hand scale;
- motion noise floor;
- strum corridor;
- baseline wrist position;
- sensitivity multiplier.

Thresholds must scale with calibration.

## 10. Debug simulator

Mandatory keyboard mapping example:

| Key | Event |
|---|---|
| 1..6 | chord slots |
| C/G/A/F etc. | explicit chord in debug mode |
| ArrowDown | down strum |
| ArrowUp | up strum |
| Space | mute |
| R | record |
| P | pause |
| Escape | stop |

Exact mapping may differ but functionality is mandatory.
