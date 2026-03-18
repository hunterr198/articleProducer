import { describe, it, expect } from "vitest";
import { fetchTopStoryIds, fetchStoryById } from "../official-api";

describe("HN Official API", () => {
  it("fetches top story IDs", async () => {
    const ids = await fetchTopStoryIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(500);
    expect(typeof ids[0]).toBe("number");
  }, 10000);

  it("fetches a story by ID", async () => {
    const ids = await fetchTopStoryIds();
    const story = await fetchStoryById(ids[0]);
    expect(story).toBeDefined();
    expect(story!.title).toBeTruthy();
    expect(typeof story!.score).toBe("number");
  }, 10000);
});
