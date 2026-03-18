import { describe, it, expect } from "vitest";
import {
  computeSustainedPresence,
  computeDiscussionDepth,
  computeGrowthTrend,
  computeFinalScore,
  getCoolingDecay,
} from "../scorer";

describe("Scoring Algorithm", () => {
  it("sustained presence: 8/8 appearances = 100", () => {
    expect(computeSustainedPresence(8, 8)).toBe(100);
  });

  it("sustained presence: 4/8 = 50", () => {
    expect(computeSustainedPresence(4, 8)).toBe(50);
  });

  it("discussion depth: high comments + high ratio scores high", () => {
    const score = computeDiscussionDepth(
      { commentsCount: 500, score: 200 },
      { maxComments: 500, maxRatio: 5 }
    );
    expect(score).toBeGreaterThan(80);
  });

  it("growth trend: large score increase scores high", () => {
    const score = computeGrowthTrend(
      { firstScore: 10, latestScore: 500, commentGrowthRate: 50 },
      { maxScoreGrowth: 500, maxCommentGrowth: 50 }
    );
    expect(score).toBeCloseTo(100, 0);
  });

  it("final score: weighted combination", () => {
    const score = computeFinalScore({
      sustainedPresence: 100,
      discussionDepth: 80,
      growthTrend: 60,
      writability: 90,
      freshness: 70,
    });
    // 100*0.25 + 80*0.25 + 60*0.20 + 90*0.20 + 70*0.10 = 82
    expect(score).toBe(82);
  });

  it("cooling decay: 1 day ago = 0.3", () => {
    expect(getCoolingDecay(1)).toBe(0.3);
  });

  it("cooling decay: 2 days ago = 0.6", () => {
    expect(getCoolingDecay(2)).toBe(0.6);
  });

  it("cooling decay: 3+ days ago = 1.0", () => {
    expect(getCoolingDecay(3)).toBe(1.0);
    expect(getCoolingDecay(10)).toBe(1.0);
  });

  it("cooling decay: never selected = 1.0", () => {
    expect(getCoolingDecay(undefined)).toBe(1.0);
  });
});
