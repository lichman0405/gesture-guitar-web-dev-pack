import { useCallback, useEffect, useRef, useState } from "react";
import { PerformanceController } from "./performanceController";
import { KeyboardSimulator } from "../debug/keyboardSimulator";
import { SettingsStore } from "../storage/settingsStore";
import type { AppSettings } from "../storage/settingsStore";
import { VisionSession } from "./visionSession";
import { LandingScreen } from "../ui/screens/LandingScreen";
import { SetupScreen } from "../ui/screens/SetupScreen";
import { CalibrateScreen } from "../ui/screens/CalibrateScreen";
import { PerformScreen } from "../ui/screens/PerformScreen";
import { ResultsScreen } from "../ui/screens/ResultsScreen";

type Screen = "landing" | "setup" | "calibrate" | "perform" | "results";

const settingsStore = new SettingsStore();

export function App() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [settings, setSettings] = useState<AppSettings>(() => settingsStore.load());
  const [fatalError, setFatalError] = useState<string | null>(null);
  const controllerRef = useRef<PerformanceController | null>(null);
  const keyboardRef = useRef<KeyboardSimulator | null>(null);
  const visionRef = useRef<VisionSession | null>(null);

  const getController = useCallback((): PerformanceController => {
    if (!controllerRef.current) {
      controllerRef.current = new PerformanceController({
        onResultsReady: () => setScreen("results"),
      });
    }
    return controllerRef.current;
  }, []);

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    const next = settingsStore.update(patch);
    controllerRef.current?.updateSettings(next);
    visionRef.current?.setHandedness(next.handedness);
    if (visionRef.current && patch.sensitivity !== undefined) {
      const pipeline = visionRef.current.pipeline;
      pipeline.setCalibration({ ...pipeline.getCalibration(), sensitivity: next.sensitivity });
    }
    setSettings(next);
  }, []);

  /** Audio + keyboard simulator: needed on every path into performance. */
  const preparePerformance = useCallback(async (): Promise<boolean> => {
    const controller = getController();
    try {
      await controller.startAudio(settingsStore.load());
      controller.updateSettings(settingsStore.load());
      // Keyboard simulation is always available (mandatory debug path).
      if (!keyboardRef.current) {
        keyboardRef.current = new KeyboardSimulator(controller.bus, {
          resolveSlot: (slot) => controller.resolveSlot(slot),
          isRecording: () => controller.store.getSnapshot().recording,
        });
      }
      return true;
    } catch (err) {
      console.error("Audio startup failed", err);
      setFatalError(
        "无法启动音频。请检查浏览器是否允许播放声音，关闭其他占用音频设备的应用后重试。",
      );
      return false;
    }
  }, [getController]);

  const enterKeyboardMode = useCallback(async () => {
    if (await preparePerformance()) setScreen("perform");
  }, [preparePerformance]);

  /** Main path: setup → camera calibration → performance. */
  const enterCameraFlow = useCallback(async () => {
    if (!(await preparePerformance())) return;
    const controller = getController();
    const current = settingsStore.load();
    if (!visionRef.current) {
      visionRef.current = new VisionSession({
        bus: controller.bus,
        handedness: current.handedness,
        resolveSlotChord: (slot) => controller.resolveSlot(slot),
        isRecording: () => controller.store.getSnapshot().recording,
      });
    }
    setScreen("calibrate");
  }, [getController, preparePerformance]);

  const finishCalibration = useCallback(() => {
    setScreen("perform");
  }, []);

  const skipCamera = useCallback(() => {
    visionRef.current?.stop();
    visionRef.current = null;
    setScreen("perform");
  }, []);

  const recalibrate = useCallback(() => {
    visionRef.current?.stop();
    setScreen("calibrate");
  }, []);

  const exitSession = useCallback(() => {
    keyboardRef.current?.detach();
    keyboardRef.current = null;
    visionRef.current?.stop();
    visionRef.current = null;
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setScreen("landing");
  }, []);

  // Only the performance screen may emit musical/recording controls.
  useEffect(() => {
    visionRef.current?.pipeline.setEnabled(screen === "perform");
    if (screen === "perform") keyboardRef.current?.attach(window);
    else keyboardRef.current?.detach();
    return () => {
      keyboardRef.current?.detach();
    };
  }, [screen]);

  useEffect(() => () => {
    visionRef.current?.stop();
    controllerRef.current?.dispose();
  }, []);

  // Dev/test introspection hook: lets E2E verify the REAL audio graph,
  // vision session stats and export artifacts from the page context.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const w = window as unknown as Record<string, unknown>;
    w.__ggw = {
      controller: () => controllerRef.current,
      vision: () => visionRef.current,
    };
    return () => {
      delete w.__ggw;
    };
  }, []);

  if (fatalError) {
    return (
      <main className="screen error-screen">
        <h2>启动遇到问题</h2>
        <p>{fatalError}</p>
        <button
          onClick={() => {
            setFatalError(null);
            setScreen("landing");
          }}
        >
          返回首页
        </button>
      </main>
    );
  }

  switch (screen) {
    case "landing":
      return (
        <LandingScreen
          onStart={() => setScreen("setup")}
          onKeyboardMode={() => void enterKeyboardMode()}
          onSettings={() => setScreen("setup")}
        />
      );
    case "setup":
      return (
        <SetupScreen
          settings={settings}
          onChange={patchSettings}
          onContinue={() => void enterCameraFlow()}
          onBack={() => setScreen("landing")}
          onKeyboardMode={() => void enterKeyboardMode()}
        />
      );
    case "calibrate":
      return visionRef.current ? (
        <CalibrateScreen
          session={visionRef.current}
          sensitivity={settings.sensitivity}
          onComplete={finishCalibration}
          onSkipCamera={skipCamera}
          onCancel={() => setScreen("setup")}
        />
      ) : (
        <SetupScreen
          settings={settings}
          onChange={patchSettings}
          onContinue={() => void enterCameraFlow()}
          onBack={() => setScreen("landing")}
        />
      );
    case "perform":
      return (
        <PerformScreen
          controller={getController()}
          visionSession={visionRef.current}
          onRecalibrate={visionRef.current ? recalibrate : undefined}
          onExit={exitSession}
          handedness={settings.handedness}
          sensitivity={settings.sensitivity}
          onSensitivityChange={(sensitivity) => patchSettings({ sensitivity })}
        />
      );
    case "results":
      return (
        <ResultsScreen
          controller={getController()}
          onReRecord={() => setScreen("perform")}
          onNewSession={exitSession}
        />
      );
  }
}
