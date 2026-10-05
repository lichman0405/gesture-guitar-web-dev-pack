import { useCallback, useEffect, useRef, useState } from "react";
import type { VisionSession } from "../../app/visionSession";
import { CameraView } from "../camera/CameraView";
import { DEFAULT_CALIBRATION } from "../../motion/calibrationTypes";

interface CalibrateScreenProps {
  session: VisionSession;
  sensitivity: number;
  /** Calibration succeeded (or user skipped with defaults) → enter performance. */
  onComplete: () => void;
  /** Continue without camera (keyboard mode). */
  onSkipCamera: () => void;
  onCancel: () => void;
}

type Phase = "starting" | "collecting" | "done" | "failed" | "camera-error";

/** User-actionable message for a vision startup failure. */
function visionErrorMessage(session: VisionSession): string {
  const err = session.visionError;
  switch (err?.kind) {
    case "denied":
      return "Camera permission was denied. Allow camera access in your browser settings and try again.";
    case "no-device":
      return "No camera was found. Connect a camera and try again.";
    case "worker-error":
    case "timeout":
      return "The hand-tracking engine failed to start. Reload the page and try again.";
    case "unsupported":
      return "This browser does not support the camera features required. Try a recent Chrome or Edge.";
    default:
      return "Camera could not be started. Check permission and that no other app is using it.";
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
            "Could not calibrate. Make sure both hands are visible and hold still.",
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
      <h2>Calibration</h2>
      <p className="hint">
        Show <strong>both hands</strong> to the camera and settle into a comfortable
        playing position. Hold still for a moment.
      </p>

      <div className="calibrate-camera">
        <CameraView
          onVideoReady={handleVideoReady}
          getFrame={() => session.frame}
          mirrored
          showOverlay
        />
      </div>

      {phase === "starting" && <p>Starting camera…</p>}

      {phase === "collecting" && (
        <div className="calibrate-progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p>Calibrating… {Math.round(progress * 100)}%</p>
        </div>
      )}

      {phase === "done" && <p className="calibrate-done">Ready! Entering performance…</p>}

      {phase === "failed" && (
        <div className="calibrate-failed">
          <p role="alert">{failureReason}</p>
          <div className="row">
            <button onClick={beginCalibration}>Retry calibration</button>
            <button onClick={() => {
              session.pipeline.setCalibration({ ...DEFAULT_CALIBRATION, sensitivity });
              onComplete();
            }}>Use defaults &amp; continue</button>
            <button onClick={onSkipCamera}>Continue without camera</button>
          </div>
        </div>
      )}

      {phase === "camera-error" && (
        <div className="calibrate-failed">
          <p role="alert">{visionError}</p>
          <div className="row">
            <button onClick={onSkipCamera}>Continue in keyboard mode</button>
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
          Back
        </button>
      </div>
    </main>
  );
}
