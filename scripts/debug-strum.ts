import { StrumDetector } from "../src/motion/strumDetector";
import type { CalibrationData } from "../src/motion/calibrationTypes";

const CAL: CalibrationData = {
  version: 1, calibratedAt: "", handScale: 0.2, noiseFloor: 0.005,
  chordHandNeutral: null, performanceHandNeutral: null,
  strumCorridor: { topY: 0.3, bottomY: 0.8, neutralY: 0.55 }, sensitivity: 1,
};

function traceAtFps(startY: number, endY: number, duration: number, fps: number, startT = 0) {
  const dt = 1 / fps;
  const steps = Math.max(1, Math.round(duration / dt));
  const trace: Array<{ y: number; t: number }> = [];
  for (let i = 0; i <= steps; i++) trace.push({ t: startT + i * dt, y: startY + (endY - startY) * (i / steps) });
  return trace;
}

const fps = Number(process.argv[2] ?? 12);
const d = new StrumDetector(CAL);
const sweep = traceAtFps(0.4, 0.7, 0.12, fps);
const dwell = traceAtFps(0.7, 0.7, 0.6, fps, sweep[sweep.length - 1].t);
dwell.shift();
const trace = sweep.concat(dwell);

for (const s of trace) {
  const ev = d.update(s.y, s.t);
  const motion = d.debug;
  console.log(
    `t=${s.t.toFixed(3)} y=${s.y.toFixed(3)} state=${d.state} ` +
      `displacement=${motion.displacement.toFixed(3)} ` +
      `velocity=${motion.velocity.toFixed(2)} direction=${motion.direction} fired=${motion.fired}` +
      (ev ? `  >>> EVENT ${ev.direction}` : ""),
  );
}
