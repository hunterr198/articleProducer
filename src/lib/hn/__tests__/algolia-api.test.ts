import { describe, it, expect } from "vitest";
import { fetchFrontPageStories, fetchStoryWithComments } from "../algolia-api";

describe("Algolia HN API", () => {
  it("fetches front page stories", async () => {
    const stories = await fetchFrontPageStories();
    expect(stories.length).toBeGreaterThan(0);
    expect(stories[0].title).toBeTruthy();
    expect(typeof stories[0].score).toBe("number");
  }, 15000);

  it("fetches story with comments", async () => {
    const stories = await fetchFrontPageStories();
    const result = await fetchStoryWithComments(stories[0].id);
    expect(result).toBeDefined();
    expect(result!.comments.length).toBeGreaterThanOrEqual(0);
  }, 15000);
});
