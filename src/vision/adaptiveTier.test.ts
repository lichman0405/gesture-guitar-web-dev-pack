import { describe, it, expect } from "vitest";
import { AdaptiveTierController, movingAverage } from "./adaptiveTier";

describe("movingAverage", () => {
  it("returns 0 for empty array", () => {
    expect(movingAverage([])).toBe(0);
  });

  it("computes average correctly", () => {
    expect(movingAverage([10, 20, 30])).toBe(20);
  });
});

describe("AdaptiveTierController", () => {
  it("starts at medium tier", () => {
    const c = new AdaptiveTierController();
    expect(c.currentTier).toBe("medium");
  });

  it("steps down on sustained overload", () => {
    const c = new AdaptiveTierController({ windowSize: 3, overloadMs: 50, cooldownSeconds: 0 });
    for (let i = 0; i < 3; i++) {
      c.addSample(100, i);
    }
    expect(c.currentTier).toBe("low");
  });

  it("does not flap within cooldown", () => {
    const c = new AdaptiveTierController({ windowSize: 3, overloadMs: 50, cooldownSeconds: 10 });
    for (let i = 0; i < 3; i++) {
      c.addSample(100, i);
    }
    expect(c.currentTier).toBe("low");
    for (let i = 3; i < 12; i++) {
      c.addSample(10, i);
    }
    expect(c.currentTier).toBe("low");
  });

  it("steps up on sustained fast samples", () => {
    const c = new AdaptiveTierController({ windowSize: 3, overloadMs: 50, cooldownSeconds: 0 });
    // Step down first
    for (let i = 0; i < 3; i++) {
      c.addSample(100, i);
    }
    expect(c.currentTier).toBe("low");
    // Step up: need enough fast samples to clear window + windowSize consecutive
    for (let i = 3; i < 8; i++) {
      c.addSample(10, i);
    }
    expect(c.currentTier).toBe("medium");
  });

  it("is capped at high", () => {
    const c = new AdaptiveTierController({ windowSize: 3, overloadMs: 50, cooldownSeconds: 0 });
    for (let i = 0; i < 5; i++) {
      c.addSample(10, i);
    }
    expect(c.currentTier).toBe("high");
    for (let i = 5; i < 10; i++) {
      c.addSample(10, i);
    }
    expect(c.currentTier).toBe("high");
  });

  it("is capped at low", () => {
    const c = new AdaptiveTierController({ windowSize: 3, overloadMs: 50, cooldownSeconds: 0 });
    for (let i = 0; i < 3; i++) {
      c.addSample(100, i);
    }
    expect(c.currentTier).toBe("low");
    for (let i = 3; i < 6; i++) {
      c.addSample(100, i);
    }
    expect(c.currentTier).toBe("low");
  });

  it("reset restores medium", () => {
    const c = new AdaptiveTierController({ windowSize: 3, overloadMs: 50, cooldownSeconds: 0 });
    for (let i = 0; i < 3; i++) {
      c.addSample(100, i);
    }
    expect(c.currentTier).toBe("low");
    c.reset();
    expect(c.currentTier).toBe("medium");
  });
});
