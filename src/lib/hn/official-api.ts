import type { HNStory } from "./types";

const BASE_URL = "https://hacker-news.firebaseio.com/v0";

export async function fetchTopStoryIds(): Promise<number[]> {
  const res = await fetch(`${BASE_URL}/topstories.json`);
  if (!res.ok) throw new Error(`HN API error: ${res.status}`);
  return res.json();
}

interface HNItem {
  id: number;
  type: string;
  by?: string;
  time?: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  text?: string;
  kids?: number[];
  dead?: boolean;
  deleted?: boolean;
}

export async function fetchStoryById(id: number): Promise<HNStory | null> {
  const res = await fetch(`${BASE_URL}/item/${id}.json`);
  if (!res.ok) return null;
  const item: HNItem = await res.json();
  if (!item || item.dead || item.deleted) return null;

  return {
    id: item.id,
    title: item.title ?? "",
    url: item.url,
    author: item.by ?? "unknown",
    score: item.score ?? 0,
    commentsCount: item.descendants ?? 0,
    storyText: item.text,
    storyType: detectStoryType(item),
    createdAt: new Date((item.time ?? 0) * 1000),
  };
}

function detectStoryType(item: HNItem): HNStory["storyType"] {
  const title = item.title ?? "";
  if (title.startsWith("Ask HN:")) return "ask_hn";
  if (title.startsWith("Show HN:")) return "show_hn";
  if (item.type === "poll") return "poll";
  return "story";
}

export async function fetchStoriesByIds(
  ids: number[],
  concurrency = 10
): Promise<(HNStory | null)[]> {
  const results: (HNStory | null)[] = [];
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fetchStoryById));
    results.push(...batchResults);
  }
  return results;
}
