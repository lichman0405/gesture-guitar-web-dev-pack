import { useEffect, useRef } from "react";
import type { VisionFrame } from "../../vision/types";

/** MediaPipe 21-point hand topology (landmark index pairs). */
const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm base
];

export interface StrumCorridorLines {
  topY: number;
  bottomY: number;
  neutralY: number;
}

export interface CameraViewProps {
  /** Called with the video element once mounted (null on unmount). */
  onVideoReady?: (el: HTMLVideoElement | null) => void;
  /** Latest vision frame source, polled from a rAF loop (never React state). */
  getFrame?: () => VisionFrame | null;
  /** Strum corridor debug lines (normalized image y), polled like getFrame. */
  getCorridor?: () => StrumCorridorLines | null;
  /** Mirror the preview (selfie view). Default true. */
  mirrored?: boolean;
  /** Draw the landmark overlay. Default true. */
  showOverlay?: boolean;
  className?: string;
}

/**
 * Mirrored camera preview with a landmark overlay canvas.
 *
 * Rendering is done in a requestAnimationFrame loop that polls getFrame();
 * no per-frame React state updates. The container is CSS-mirrored so video
 * and overlay flip together and landmarks can be drawn in raw coordinates.
 */
export function CameraView({
  onVideoReady,
  getFrame,
  getCorridor,
  mirrored = true,
  showOverlay = true,
  className,
}: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Refs so the rAF loop always sees the latest callbacks without re-subscribing.
  const getFrameRef = useRef(getFrame);
  const getCorridorRef = useRef(getCorridor);
  const showOverlayRef = useRef(showOverlay);
  getFrameRef.current = getFrame;
  getCorridorRef.current = getCorridor;
  showOverlayRef.current = showOverlay;

  useEffect(() => {
    onVideoReady?.(videoRef.current);
    return () => onVideoReady?.(null);
  }, [onVideoReady]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      if (!showOverlayRef.current) return;

      const corridor = getCorridorRef.current?.();
      if (corridor) {
        ctx.lineWidth = 1;
        for (const [y, color] of [
          [corridor.topY, "rgba(80,200,120,0.8)"],
          [corridor.bottomY, "rgba(80,200,120,0.8)"],
          [corridor.neutralY, "rgba(240,200,80,0.9)"],
        ] as const) {
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(0, y * h);
          ctx.lineTo(w, y * h);
          ctx.stroke();
        }
      }

      const frame = getFrameRef.current?.();
      if (!frame) return;
      for (const hand of frame.hands) {
        const color = hand.physical === "Right" ? "#4fc3f7" : "#aed581";
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        for (const [a, b] of HAND_CONNECTIONS) {
          const pa = hand.landmarks[a];
          const pb = hand.landmarks[b];
          if (!pa || !pb) continue;
          ctx.beginPath();
          ctx.moveTo(pa.x * w, pa.y * h);
          ctx.lineTo(pb.x * w, pb.y * h);
          ctx.stroke();
        }
        ctx.fillStyle = color;
        for (const p of hand.landmarks) {
          ctx.beginPath();
          ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className={className ? `camera-view ${className}` : "camera-view"}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "8px",
        background: "#000",
        transform: mirrored ? "scaleX(-1)" : undefined,
      }}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        style={{ display: "block", width: "100%", height: "auto" }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
