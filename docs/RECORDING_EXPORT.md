# Recording and Export

## 1. Required logical tracks

- Vocal
- Guitar
- Master mix
- Performance events

## 2. Recording synchronization

All event timestamps must share a session time origin.

At record start:
- establish `performanceStartTime`;
- start track capture;
- start event logging;
- align count-in and musical transport.

## 3. Browser recording reality

Browser-native MediaRecorder often produces WebM/Opus rather than WAV.

Therefore design two layers:

### Capture layer
Record browser-supported encoded streams efficiently.

### Export layer
Where practical, decode/render PCM and generate WAV client-side.

MVP acceptance:
- WAV exports should be produced if the implementation can do so reliably in-browser;
- if a specific browser API path cannot directly produce WAV, render/export through Web Audio/PCM rather than declaring a blocker;
- compressed browser-native output may coexist for convenience.

## 4. Guitar stem

Preferred robust approach:
- log every guitar performance event;
- optionally capture the guitar bus live;
- support offline re-render from the exact event log into an AudioBuffer for deterministic WAV export.

This makes guitar export independent of microphone capture quirks.

## 5. Mix

Mix may be:
- recorded live from the master bus; or
- rendered from vocal PCM + offline-rendered guitar.

Choose the path with better browser reliability.

## 6. Performance JSON

Required fields:
- version
- session metadata
- key
- scale mode/custom mapping
- handedness
- BPM
- time signature
- instrument preset
- events
- optional song plan
- optional evaluation

See `schemas/performance.schema.json`.

## 7. Failure handling

If exporting one format fails:
- preserve the raw captured track;
- attempt alternate local conversion;
- still export performance JSON;
- never silently discard the recording.
