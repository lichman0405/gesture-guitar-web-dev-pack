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
        });
      }
      keyboardRef.current.attach(window);
      return true;
    } catch (err) {
      setFatalError(
        `Audio could not start: ${err instanceof Error ? err.message : String(err)}. ` +
          "Check that your browser allows audio output and try again.",
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
    visionRef.current?.stop();
    visionRef.current = null;
    controllerRef.current?.dispose();
    controllerRef.current = null;
    setScreen("landing");
  }, []);

  // Detach keyboard when leaving perform screen via unmount.
  useEffect(() => {
    return () => {
      keyboardRef.current?.detach();
    };
  }, []);

  if (fatalError) {
    return (
      <main className="screen error-screen">
        <h2>Something went wrong</h2>
        <p>{fatalError}</p>
        <button
          onClick={() => {
            setFatalError(null);
            setScreen("landing");
          }}
        >
          Back to start
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
