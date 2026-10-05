import { describe, expect, it } from "vitest";
import { loadStoredCalibration, storeCalibration } from "./visionSession";
import { DEFAULT_CALIBRATION } from "../motion/calibrationTypes";
import { MemoryAdapter } from "../storage/adapters";

describe("motion-point calibration compatibility", () => {
  it("round-trips a calibration for the current tracking point", () => {
    const storage = new MemoryAdapter();
    storeCalibration(DEFAULT_CALIBRATION, storage);
    expect(loadStoredCalibration(storage)).toEqual(DEFAULT_CALIBRATION);
  });
  it("ignores old wrist-centered calibration instead of applying it to knuckles", () => {
    const storage = new MemoryAdapter();
    const legacy = { ...DEFAULT_CALIBRATION };
    delete legacy.motionPoint;
    storage.set("ggw.calibration.v1", legacy);
    expect(loadStoredCalibration(storage)).toBeNull();
  });
});
