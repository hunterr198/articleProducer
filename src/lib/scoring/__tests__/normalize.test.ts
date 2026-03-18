import { describe, it, expect } from "vitest";
import { logNormalize } from "../normalize";

describe("logNormalize", () => {
  it("returns 0 for value 0", () => {
    expect(logNormalize(0, 1000)).toBe(0);
  });

  it("returns 100 for max value", () => {
    expect(logNormalize(1000, 1000)).toBe(100);
  });

  it("returns ~50 for sqrt of max (log scale)", () => {
    const result = logNormalize(31, 1000);
    expect(result).toBeGreaterThan(45);
    expect(result).toBeLessThan(55);
  });

  it("handles max=0 gracefully", () => {
    expect(logNormalize(0, 0)).toBe(0);
  });
});
