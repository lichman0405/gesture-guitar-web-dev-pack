import { useCallback, useEffect, useRef, useState } from "react";
import type { PerformanceController } from "../../app/performanceController";
import type { VisionSession } from "../../app/visionSession";
import type { PipelineDebugStats } from "../../app/visionPipeline";
import { useAppStore } from "../hooks";
import { LevelMeter } from "../../audio/meters";
import { CameraView } from "../camera/CameraView";
import { GestureHelp } from "../GestureHelp";
import { GESTURE_LABELS } from "../../gesture/gestureTypes";
import { L_THUMB_SPREAD_MIN } from "../../gesture/gestureVocabulary";

interface Props {
  controller: PerformanceController;
  visionSession?: VisionSession | null;
  onRecalibrate?: () => void;
  onExit: () => void;
  handedness?: "right" | "left";
  sensitivity?: number;
  onSensitivityChange?: (sensitivity: number) => void;
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
  ["1–9 / 0", "选择第 1–10 个手势和弦"],
  ["C D E F G A B (+Shift)", "直接选择和弦（加 Shift 选小和弦）"],
  ["↓ / ↑", "向下 / 向上扫弦"],
  ["Shift / Ctrl＋↓ / ↑", "重扫 / 轻扫"],
  ["空格", "切换闷音"],
  ["R", "开始 / 停止录音"],
  ["P", "暂停 / 恢复节拍"],
  ["Esc", "停止录音"],
];

const DISPLAY_MODE_LABELS = { normal: "普通", performance: "表演", debug: "调试" };
const TIER_LABELS: Record<string, string> = { high: "高", medium: "中", low: "低" };
const CONTROL_LABELS: Record<string, string> = {
  ready: "准备就绪",
  "toggle-pause": "暂停 / 恢复",
  "toggle-record": "开始 / 停止录音",
  stop: "停止",
};

export function PerformScreen({ controller, visionSession, onRecalibrate, onExit,
  handedness = "right", sensitivity = 1, onSensitivityChange }: Props) {
  const bindPreview = useCallback((el: HTMLVideoElement | null) => {
    visionSession?.setPreview(el);
  }, [visionSession]);
  const ui = useAppStore(controller.store);
  const [guitarMeter, setGuitarMeter] = useState<LevelMeter | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [displayMode, setDisplayMode] = useState<"normal" | "performance" | "debug">("normal");
  const [debug, setDebug] = useState<{
    fps: number;
    inferenceMs: number;
    delegate: string;
    tier: string;
    benchmark: string;
    stats: PipelineDebugStats;
  } | null>(null);

  // Debug stats poll (4 Hz) — only in debug mode with a vision session.
  useEffect(() => {
    if (!visionSession || displayMode !== "debug") return;
    const id = setInterval(() => {
      const s = visionSession.getStats();
      setDebug({
        fps: s.fps,
        inferenceMs: s.avgInferenceMs,
        delegate: s.delegate ?? "—",
        tier: s.tier,
        benchmark:
          s.benchmark === null
            ? "—"
            : `图形处理器 ${s.benchmark.gpuMs?.toFixed(0) ?? "失败"} 毫秒 / 中央处理器 ${s.benchmark.cpuMs?.toFixed(0) ?? "失败"} 毫秒`,
        stats: visionSession.getDebugStats(),
      });
    }, 250);
    return () => clearInterval(id);
  }, [visionSession, displayMode]);

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
    <main className={`screen perform mode-${displayMode}`} data-testid="perform-screen">
      <div className="display-mode-switch" role="group" aria-label="显示模式">
        {(["normal", "performance", "debug"] as const).map((mode) => (
          <button
            key={mode}
            className={displayMode === mode ? "active" : ""}
            onClick={() => setDisplayMode(mode)}
            data-testid={`display-mode-${mode}`}
          >
            {DISPLAY_MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      <div className="perform-main">
        <section className="chord-display" aria-live="polite">
          <div className="chord-label">当前和弦</div>
          <div
            className={`chord-value${displayMode === "performance" ? " performance-big" : ""}`}
            data-testid="current-chord"
          >
            {ui.chord ?? "—"}
          </div>
          {ui.muteActive && <div className="mute-badge">闷音中</div>}
        </section>

        <section className="strum-display">
          {strum ? (
            <>
              <span className={`strum-arrow ${strum.direction}`} data-testid="strum-direction">
                {strum.direction === "down" ? "▼" : "▲"}
              </span>
              <span className="strum-intensity">
                {strum.intensity >= 0.7 ? "重扫" : strum.intensity >= 0.4 ? "正常" : "轻扫"}
                {strum.articulation === "muted" ? " · 闷音" : ""}
              </span>
            </>
          ) : (
            <span className="strum-idle">选好和弦，扫弦开始演奏</span>
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
                  目标和弦： <strong data-testid="expected-chord">{ui.guided.expectedChord}</strong>
                </span>
                <span className="guided-next">下一和弦： {ui.guided.nextChord}</span>
              </div>
            )}
            {ui.guided.nextStrum && (
              <div className="guided-next-strum" data-testid="next-strum">
                下一次扫弦：{" "}
                <span className={`strum-arrow ${ui.guided.nextStrum.direction}`}>
                  {ui.guided.nextStrum.direction === "down" ? "▼" : "▲"}
                </span>
              </div>
            )}
            <div className="guided-bar">
              第 {ui.guided.bar + 1} 小节
              {ui.guided.totalBars > 0 ? ` / ${ui.guided.totalBars}` : ""}
            </div>
          </section>
        )}

        {ui.micError && (
          <p className="mic-warning" role="alert">
            麦克风不可用（{ui.micError}），仍可录制吉他演奏。
          </p>
        )}
        {ui.exportState === "exporting" && (
          <p className="exporting-note">正在本机生成导出文件…</p>
        )}
      </div>

      <div className="perform-side">
        {visionSession && displayMode !== "performance" && (
          <section className="camera-panel" aria-label="摄像头预览">
            <CameraView
              onVideoReady={bindPreview}
              getFrame={() => visionSession.frame}
              getCorridor={() => visionSession.pipeline.getCalibration().strumCorridor}
              mirrored
              showOverlay
            />
            <details className="debug-panel" open={displayMode === "debug"}>
              <summary>调试信息</summary>
              {debug ? (
                <dl>
                  <dt>每秒帧数</dt>
                  <dd data-testid="debug-fps">{debug.fps}</dd>
                  <dt>识别耗时</dt>
                  <dd>{debug.inferenceMs.toFixed(1)} 毫秒</dd>
                  <dt>运算设备</dt>
                  <dd data-testid="debug-delegate">{debug.delegate === "GPU" ? "图形处理器" : debug.delegate === "CPU" ? "中央处理器" : "—"}</dd>
                  <dt>画质档位</dt>
                  <dd>{TIER_LABELS[debug.tier] ?? "—"}</dd>
                  <dt>启动性能测试</dt>
                  <dd>{debug.benchmark}</dd>
                  <dt>候选和弦手势</dt>
                  <dd>
                    {debug.stats.chordCandidate
                      ? `${GESTURE_LABELS[debug.stats.chordCandidate.gestureId]} (${debug.stats.chordCandidate.confidence.toFixed(2)})`
                      : "—"}
                  </dd>
                  <dt>已确认手势</dt>
                  <dd>{debug.stats.committedGesture ? GESTURE_LABELS[debug.stats.committedGesture] : "—"}</dd>
                  <dt>和弦手 · 拇/食/中/无名/小指</dt>
                  <dd data-testid="chord-fingers">{debug.stats.chordFingers
                    ? Object.values(debug.stats.chordFingers).map((v) => `${Math.round(v * 100)}%`).join(" / ") : "未检测到"}</dd>
                  <dt>L 拇指外展 · ≥ {L_THUMB_SPREAD_MIN}</dt>
                  <dd>{debug.stats.chordThumbSpread?.toFixed(2) ?? "未检测到"}</dd>
                  <dt>扫弦手 · 拇/食/中/无名/小指</dt>
                  <dd>{debug.stats.performanceFingers
                    ? Object.values(debug.stats.performanceFingers).map((v) => `${Math.round(v * 100)}%`).join(" / ") : "未检测到"}</dd>
                  <dt>闷音状态</dt>
                  <dd>{debug.stats.muteActive ? "开启" : "关闭"}</dd>
                  <dt>扫弦检测状态</dt>
                  <dd>{debug.stats.strumState === "tracking" ? "扫弦跟踪中" : "待机"}</dd>
                  <dt>扫弦速度 / 位移 / 门槛</dt>
                  <dd>{debug.stats.strumMotion.velocity.toFixed(1)} / {Math.abs(debug.stats.strumMotion.displacement).toFixed(2)} / {debug.stats.strumMotion.minimumDisplacement.toFixed(2)}</dd>
                  <dt>双手控制保持进度</dt>
                  <dd>
                    {debug.stats.controlHold
                      ? `${CONTROL_LABELS[debug.stats.controlHold.comboId] ?? "控制手势"} ${(debug.stats.controlHold.progress * 100).toFixed(0)}%`
                      : "—"}
                  </dd>
                </dl>
              ) : (
                <p className="hint">切换到「调试」显示模式，即可查看实时识别状态。</p>
              )}
            </details>
            {onRecalibrate && (
              <button disabled={ui.recording || ui.exportState === "exporting"} className="link" onClick={onRecalibrate}>
                重新校准
              </button>
            )}
            <GestureHelp controller={controller} handedness={handedness} />
            {onSensitivityChange && <label className="field" htmlFor="live-sensitivity">
              扫弦灵敏度：{sensitivity.toFixed(2)}
              <input id="live-sensitivity" type="range" min={0.25} max={3} step={0.25}
                value={sensitivity} onChange={(e) => onSensitivityChange(Number(e.target.value))} />
            </label>}
          </section>
        )}

        {displayMode !== "performance" && <MeterBar meter={guitarMeter} label="吉他音量" />}

        <div className="record-row">
          {ui.recording ? (
            <>
              <span className="rec-indicator" data-testid="rec-indicator">
                ● 录音中 {Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, "0")}
              </span>
              <button onClick={() => controller.stopRecording()} data-testid="stop-record-button">
                停止录音
              </button>
            </>
          ) : (
            <button disabled={ui.exportState === "exporting"} onClick={() => controller.startRecording()} data-testid="record-button">
              开始录音
            </button>
          )}
        </div>

        {ui.recording && (
          <p className="hint" role="status" data-testid="mic-status">
            {ui.micStatus === "recording" ? "正在录制麦克风 · 人声不从扬声器实时播放" :
              ui.micStatus === "requesting" ? "请允许麦克风访问，以录下你的歌声" :
                "仅录制吉他 · 麦克风不可用"}
          </p>
        )}

        {displayMode !== "performance" && (
          <>
            <div className="transport-row">
              {ui.metronomeRunning ? (
                <button onClick={() => controller.stopMetronome()}>停止节拍器</button>
              ) : (
                <button onClick={() => controller.startMetronome()} data-testid="metronome-button">
                  启动节拍器
                </button>
              )}
            </div>

            <details className="keyboard-hints">
              <summary>键盘操作</summary>
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
          </>
        )}

        <button className="exit-button" onClick={onExit}>
          结束演奏
        </button>
      </div>
    </main>
  );
}
