import { useCallback, useEffect, useRef, useState } from "react";
import type { VisionSession } from "../../app/visionSession";
import { CameraView } from "../camera/CameraView";
import { DEFAULT_CALIBRATION } from "../../motion/calibrationTypes";

interface CalibrateScreenProps {
  session: VisionSession;
  sensitivity: number;
  /** Calibration succeeded (or user skipped with defaults) → enter performance. */
  onComplete: () => void;
  /** 切换到键盘演奏 (keyboard mode). */
  onSkipCamera: () => void;
  onCancel: () => void;
}

type Phase = "starting" | "collecting" | "done" | "failed" | "camera-error";

/** User-actionable message for a vision startup failure. */
function visionErrorMessage(session: VisionSession): string {
  const err = session.visionError;
  switch (err?.kind) {
    case "denied":
      return "摄像头权限被拒绝。请在浏览器的网站权限设置中允许摄像头访问，再重试。";
    case "no-device":
      return "未找到摄像头。请连接摄像头后重试。";
    case "worker-error":
    case "timeout":
      return "手部识别引擎启动失败。请刷新页面后重试。";
    case "unsupported":
      return "当前浏览器不支持所需的摄像头功能。请使用较新版本的 Chrome 或 Edge。";
    default:
      return "无法启动摄像头。请检查访问权限，并关闭其他正在使用摄像头的应用。";
  }
}

/**
 * 2–3 second calibration flow (UX_FLOW §4): show both hands, settle,
 * capture scale/noise/corridor, then enter Ready. Failures get actionable
 * hints and a fallback to keyboard mode.
 */
export function CalibrateScreen({
  session,
  sensitivity,
  onComplete,
  onSkipCamera,
  onCancel,
}: CalibrateScreenProps) {
  const [phase, setPhase] = useState<Phase>("starting");
  const [progress, setProgress] = useState(0);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const [visionError, setVisionError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const beginCalibration = useCallback(() => {
    setFailureReason(null);
    setProgress(0);
    session.pipeline.beginCalibration(sensitivity);
    setPhase("collecting");
  }, [session, sensitivity]);

  // Start the camera once the video element is mounted.
  const handleVideoReady = useCallback(
    (el: HTMLVideoElement | null) => {
      if (!el) { session.setPreview(null); return; }
      session.setPreview(el); // Reattach after React StrictMode's effect replay.
      if (startedRef.current) return;
      startedRef.current = true;
      void session.start(el).then(() => {
        if (!mountedRef.current) return;
        if (session.currentState !== "running") {
          setPhase("camera-error");
          setVisionError(visionErrorMessage(session));
          return;
        }
        beginCalibration();
      });
    },
    [session, beginCalibration],
  );

  // Poll calibrator progress while collecting.
  useEffect(() => {
    if (phase !== "collecting") return;
    const id = setInterval(() => {
      const cal = session.pipeline.calibrator;
      setProgress(cal.progress);
      if (cal.state === "done") {
        setPhase("done");
      } else if (cal.state === "failed") {
        setFailureReason(
          cal.failureReason ??
            "校准失败。请让双手完整出现在画面里，并保持静止。",
        );
        setPhase("failed");
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase, session]);

  // Auto-advance shortly after success.
  useEffect(() => {
    if (phase !== "done") return;
    const id = setTimeout(onComplete, 700);
    return () => clearTimeout(id);
  }, [phase, onComplete]);

  return (
    <main className="screen calibrate-screen">
      <h2>手势校准</h2>
      <p className="hint">
        请让<strong>双手</strong>完整出现在摄像头画面里，摆好舒适的演奏姿势，并保持静止片刻。
        扫弦手放在准备弹的位置，拇指和食指可以像捏拨片一样轻捏；校准后用手腕连续上下扫。
      </p>

      <div className="calibrate-camera">
        <CameraView
          onVideoReady={handleVideoReady}
          getFrame={() => session.frame}
          mirrored
          showOverlay
        />
      </div>

      {phase === "starting" && <p>正在启动摄像头…</p>}

      {phase === "collecting" && (
        <div className="calibrate-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p>正在校准… {Math.round(progress * 100)}%</p>
        </div>
      )}

      {phase === "done" && <p className="calibrate-done">校准完成！正在进入演奏…</p>}

      {phase === "failed" && (
        <div className="calibrate-failed">
          <p role="alert">{failureReason}</p>
          <div className="row">
            <button onClick={beginCalibration}>重新校准</button>
            <button onClick={() => {
              session.pipeline.setCalibration({ ...DEFAULT_CALIBRATION, sensitivity });
              onComplete();
            }}>使用默认参数继续</button>
            <button onClick={onSkipCamera}>切换到键盘演奏</button>
          </div>
        </div>
      )}

      {phase === "camera-error" && (
        <div className="calibrate-failed">
          <p role="alert">{visionError}</p>
          <div className="row">
            <button onClick={onSkipCamera}>切换到键盘演奏</button>
          </div>
        </div>
      )}

      <div className="row">
        <button
          className="link"
          onClick={() => {
            session.stop();
            onCancel();
          }}
        >
          返回
        </button>
      </div>
    </main>
  );
}
