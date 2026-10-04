# UX Flow

## 1. Landing

Actions:
- Start
- Demo / Keyboard Mode
- Settings

Explain:
- camera used only for hands;
- microphone used for singing;
- processing is local for MVP.

## 2. Permission

Request camera and microphone deliberately.

Handle independently:
- camera denied → keyboard simulation can still demonstrate app;
- microphone denied → guitar performance still works, vocal recording disabled;
- both denied → full debug/demo mode remains usable.

## 3. Setup

Select:
- handedness
- Free / Guided / Song mode
- key
- Scale / Custom chord mapping
- BPM
- meter
- metronome on/off
- instrument preset

## 4. Calibration

2–3 second flow:
1. show both hands;
2. settle into comfortable playing position;
3. capture scale/noise/regions;
4. run quick gesture sanity test;
5. enter Ready.

Calibration failure must provide actionable hints rather than raw errors.

## 5. Performance screen

Normal view:
- mirrored camera
- hand landmarks
- chord label
- strum direction/intensity
- beat pulse
- record state
- vocal/guitar meters
- recent event ribbon

Performance view:
- large chord
- next chord
- beat
- next guided strum
- record timer
- minimal camera

Debug:
- classifiers
- confidence
- FPS
- latency
- threshold visualizations

## 6. Recording

Flow:
- Record
- count-in
- active recording
- Pause optional
- Stop
- render/export
- results

## 7. Results

Show:
- playback
- export buttons
- lightweight metrics
- timeline issues for guided/song mode
- New Session / Re-record

## 8. Accessibility / usability

- large readable chord display;
- keyboard control for all primary actions;
- no critical information conveyed only by color;
- camera overlay can be hidden;
- error messages remain visible long enough to read.
