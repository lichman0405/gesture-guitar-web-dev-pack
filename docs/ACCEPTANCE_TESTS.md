# MVP Acceptance Tests

## A. Bootstrap / build

- `npm install` (or chosen package manager equivalent) succeeds on Windows.
- dev server starts.
- production build succeeds.
- typecheck succeeds.
- unit tests succeed.
- no Git remote is configured.

## B. Keyboard simulation

Without camera:
- set C;
- trigger down strum;
- hear C;
- switch to G;
- trigger up strum;
- hear G;
- enable mute;
- hear damped articulation;
- intensity changes audible response.

This is a mandatory deterministic E2E path.

## C. Vision

With camera where hardware exists:
- detect up to two hands;
- distinguish physical left/right handedness sufficiently for role mapping;
- draw landmarks;
- run at >=20 Hz target on normal hardware or gracefully reduce inference settings;
- UI remains responsive.

## D. Chord gesture

- stable gesture commits within configured debounce target;
- one-frame misclassification does not switch chord;
- brief landmark loss does not instantly clear chord;
- custom gesture-to-chord mapping works;
- Scale Mode updates mapping when key changes.

## E. Strum

- downward movement triggers down event;
- upward movement triggers up event;
- one physical stroke does not produce repeated events;
- slow vs fast strokes produce distinct intensity;
- strum event-to-audible target is <100 ms where measurable on supported hardware.

## F. Calibration

- calibration stores normalized scale/regions;
- both seated and standing-like simulated positions work;
- thresholds do not depend on raw pixel distance only;
- recalibration updates motion behavior.

## G. Handedness

- right-handed mode: chord role left, performance role right;
- left-handed mode reverses role mapping;
- no domain module hardcodes physical hand as the musical role.

## H. Rhythm

- BPM can change;
- 4/4 works;
- 3/4 works;
- 6/8 works;
- count-in works;
- audible metronome can be disabled while visual pulse remains.

## I. Guided Rhythm

- expected direction displayed;
- correct/incorrect direction evaluated;
- timing error logged;
- missed strum logged.

## J. Song Mode

- progression can be defined;
- current and next chord displayed;
- detected chord compared with expected chord;
- bar/beat progression synchronized to transport.

## K. Recording

At minimum:
- microphone vocal captured;
- guitar stem produced;
- mix produced;
- performance JSON produced.

Export strategy may use offline re-render for guitar.

## L. Privacy

- no required backend;
- no required upload;
- no server hand inference;
- camera denial produces clear fallback;
- mic denial preserves guitar functionality.

## M. UI

Normal mode:
- preview + landmarks + current chord + strum + meter + recording state.

Performance mode:
- minimal, large musical feedback.

Debug mode:
- FPS
- vision latency
- confidence
- motion values
- active thresholds

## N. Stability

- 10-minute debug-mode performance run without fatal crash;
- repeated start/stop recording does not leak obvious audio nodes/tracks;
- camera track is released when app stops using it;
- microphone track is released when app stops using it.

Automated full-duration check: `npm run test:soak` runs at least ten wall-clock
minutes with the real model/WASM/worker and browser audio in Debug mode, repeated
recordings and WAV exports. Camera images and microphone input use Chromium fake
devices; real-hand accuracy and light-dependent behavior still require a person.

## O. Final local-only Git state

- working tree clean after final commit;
- no remote;
- no push performed;
- local commit history shows phase progression.

## Post-MVP recognition checks (Phase 14)

- Show all five fingers, then tuck only the thumb: G and F in default C mapping
  must remain distinct. A shorter/upright thumb with four curled fingers selects
  Am; changing palm orientation must not depend on fingertip screen height.
- Try the additional little finger / rock / L / phone poses: D / E / Cm / Bb.
  Custom slot 7–10 assignments must survive reload; keys 7/8/9/0 must match them.
- Hold a chord while changing only the performance-hand fingers: no chord change
  and no phantom strum. Short model label/order errors must preserve hand roles.
- With thumb/index lightly touching as a pick grip, pivot the wrist up/down in
  the calibrated region repeatedly without pausing: one event per stroke, correct
  alternating direction, normal articulation. A deliberately complete fist mutes.
- Keep both hands open while actively strumming G: no accidental stop control.
- Lose/reacquire a hand or stall frames: no jump-triggered stroke. Jitter and
  small settling outliers during calibration must not prevent intentional strokes.

Automated coverage: 308 unit tests, synthetic 21-point/3-D gesture variants,
continuous 8–60 FPS traces and real-browser audio/export checks. These checks
must not be reported as a measured human recognition-accuracy percentage.
