import { useEffect, useRef, useState } from "react";
import type { PerformanceController } from "../../app/performanceController";
import type { VisionSession } from "../../app/visionSession";
import type { PipelineDebugStats } from "../../app/visionPipeline";
import { useAppStore } from "../hooks";
import { LevelMeter } from "../../audio/meters";
import { CameraView } from "../camera/CameraView";

interface Props {
  controller: PerformanceController;
  visionSession?: VisionSession | null;
  onRecalibrate?: () => void;
  onExit: () => void;
}

/** rAF-polled level bar for one LevelMeter. */
function MeterBar({ meter, label }: { meter: LevelMeter | null; label: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!meter) return;
    let raf = 0;
    const draw = () => {
      const { rms } = meter.getLevelWithPeak();
      if (barRef.current) {
        barRef.current.style.width = `${Math.round(rms * 100)}%`;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [meter]);
  return (
    <div className="meter" aria-label={label} role="meter">
      <span className="meter-label">{label}</span>
      <div className="meter-track">
        <div ref={barRef} className="meter-fill" />
      </div>
    </div>
  );
}

const KEYBOARD_HINTS: [string, string][] = [
  ["1–6", "chord slots"],
  ["C D E F G A B (+Shift)", "explicit chord (minor)"],
  ["↓ / ↑", "strum down / up"],
  ["Shift / Ctrl + strum", "accent / soft"],
  ["Space", "mute"],
  ["R", "record"],
  ["P", "pause"],
  ["Esc", "stop"],
];

export function PerformScreen({ controller, visionSession, onRecalibrate, onExit }: Props) {
  const ui = useAppStore(controller.store);
  const [guitarMeter, setGuitarMeter] = useState<LevelMeter | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [debug, setDebug] = useState<{
    fps: number;
    inferenceMs: number;
    stats: PipelineDebugStats;
  } | null>(null);

  // Debug stats poll (4 Hz) — only when a vision session exists.
  useEffect(() => {
    if (!visionSession) return;
    const id = setInterval(() => {
      const { fps, avgInferenceMs } = visionSession.getStats();
      setDebug({
        fps,
        inferenceMs: avgInferenceMs,
        stats: visionSession.getDebugStats(),
      });
    }, 250);
    return () => clearInterval(id);
  }, [visionSession]);

  // Guitar level meter (created once audio is running).
  useEffect(() => {
    const graph = controller.audioGraph;
    if (!ui.audioReady || !graph) return;
    const meter = new LevelMeter(graph.ctx, graph.guitarBus);
    setGuitarMeter(meter);
    return () => {
      meter.disconnect();
      setGuitarMeter(null);
    };
  }, [controller, ui.audioReady]);

  // Recording timer display (1 Hz).
  useEffect(() => {
    if (!ui.recording || ui.recordStartWallTime === null) return;
    const timer = setInterval(() => {
      setRecordSeconds(Math.floor((Date.now() - ui.recordStartWallTime!) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [ui.recording, ui.recordStartWallTime]);

  const beat = ui.beatPulse;
  const strum = ui.lastStrum;

  return (
    <main className="screen perform" data-testid="perform-screen">
      <div className="perform-main">
        <section className="chord-display" aria-live="polite">
          <div className="chord-label">Current chord</div>
          <div className="chord-value" data-testid="current-chord">
            {ui.chord ?? "—"}
          </div>
          {ui.muteActive && <div className="mute-badge">MUTED</div>}
        </section>

        <section className="strum-display">
          {strum ? (
            <>
              <span className={`strum-arrow ${strum.direction}`} data-testid="strum-direction">
                {strum.direction === "down" ? "▼" : "▲"}
              </span>
              <span className="strum-intensity">
                {strum.intensity >= 0.7 ? "accent" : strum.intensity >= 0.4 ? "normal" : "soft"}
                {strum.articulation === "muted" ? " · muted" : ""}
              </span>
            </>
          ) : (
            <span className="strum-idle">strum to play</span>
          )}
        </section>

        <section className="beat-display" aria-hidden={!ui.metronomeRunning}>
          {ui.metronomeRunning && beat ? (
            <div className={`beat-dot ${beat.accent}`} data-testid="beat-dot">
              {beat.inCountIn ? "…" : beat.beatInBar + 1}
            </div>
          ) : (
            <div className="beat-dot off">·</div>
          )}
        </section>

        {ui.guided && (
          <section className="guided-display" data-testid="guided-display">
            {ui.guided.expectedChord && (
              <div className="guided-chords">
                <span>
                  Expected: <strong data-testid="expected-chord">{ui.guided.expectedChord}</strong>
                </span>
                <span className="guided-next">Next: {ui.guided.nextChord}</span>
              </div>
            )}
            {ui.guided.nextStrum && (
              <div className="guided-next-strum" data-testid="next-strum">
                Next strum:{" "}
                <span className={`strum-arrow ${ui.guided.nextStrum.direction}`}>
                  {ui.guided.nextStrum.direction === "down" ? "▼" : "▲"}
                </span>
              </div>
            )}
            <div className="guided-bar">
              Bar {ui.guided.bar + 1}
              {ui.guided.totalBars > 0 ? ` / ${ui.guided.totalBars}` : ""}
            </div>
          </section>
        )}

        {ui.micError && (
          <p className="mic-warning" role="alert">
            Microphone unavailable ({ui.micError}) — guitar performance still records.
          </p>
        )}
        {ui.exportState === "exporting" && (
          <p className="exporting-note">Rendering export locally…</p>
        )}
      </div>

      <div className="perform-side">
        {visionSession && (
          <section className="camera-panel" aria-label="Camera preview">
            <CameraView
              getFrame={() => visionSession.frame}
              getCorridor={() => visionSession.pipeline.getCalibration().strumCorridor}
              mirrored
              showOverlay
            />
            <details className="debug-panel">
              <summary>Debug</summary>
              {debug && (
                <dl>
                  <dt>FPS</dt>
                  <dd data-testid="debug-fps">{debug.fps}</dd>
                  <dt>Inference</dt>
                  <dd>{debug.inferenceMs.toFixed(1)} ms</dd>
                  <dt>Chord candidate</dt>
                  <dd>
                    {debug.stats.chordCandidate
                      ? `${debug.stats.chordCandidate.gestureId} (${debug.stats.chordCandidate.confidence.toFixed(2)})`
                      : "—"}
                  </dd>
                  <dt>Committed</dt>
                  <dd>{debug.stats.committedGesture ?? "—"}</dd>
                  <dt>Mute</dt>
                  <dd>{debug.stats.muteActive ? "active" : "off"}</dd>
                  <dt>Strum detector</dt>
                  <dd>{debug.stats.strumState}</dd>
                  <dt>Control hold</dt>
                  <dd>
                    {debug.stats.controlHold
                      ? `${debug.stats.controlHold.comboId} ${(debug.stats.controlHold.progress * 100).toFixed(0)}%`
                      : "—"}
                  </dd>
                </dl>
              )}
            </details>
            {onRecalibrate && (
              <button className="link" onClick={onRecalibrate}>
                Recalibrate
              </button>
            )}
          </section>
        )}

        <MeterBar meter={guitarMeter} label="Guitar" />

        <div className="record-row">
          {ui.recording ? (
            <>
              <span className="rec-indicator" data-testid="rec-indicator">
                ● REC {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
              </span>
              <button onClick={() => controller.stopRecording()} data-testid="stop-record-button">
                Stop
              </button>
            </>
          ) : (
            <button onClick={() => controller.startRecording()} data-testid="record-button">
              Record
            </button>
          )}
        </div>

        <div className="transport-row">
          {ui.metronomeRunning ? (
            <button onClick={() => controller.stopMetronome()}>Stop metronome</button>
          ) : (
            <button onClick={() => controller.startMetronome()} data-testid="metronome-button">
              Start metronome
            </button>
          )}
        </div>

        <details className="keyboard-hints">
          <summary>Keyboard controls</summary>
          <table>
            <tbody>
              {KEYBOARD_HINTS.map(([key, desc]) => (
                <tr key={key}>
                  <td>
                    <kbd>{key}</kbd>
                  </td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        <button className="exit-button" onClick={onExit}>
          Exit session
        </button>
      </div>
    </main>
  );
}
