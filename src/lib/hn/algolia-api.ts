import type { HNStory, HNComment } from "./types";

const BASE_URL = "https://hn.algolia.com/api/v1";

interface AlgoliaHit {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  story_text: string | null;
  created_at_i: number;
  _tags: string[];
}

export async function fetchFrontPageStories(): Promise<HNStory[]> {
  const res = await fetch(
    `${BASE_URL}/search?tags=front_page&hitsPerPage=30`
  );
  if (!res.ok) throw new Error(`Algolia API error: ${res.status}`);
  const data = await res.json();

  return data.hits.map((hit: AlgoliaHit) => ({
    id: parseInt(hit.objectID),
    title: hit.title,
    url: hit.url ?? undefined,
    author: hit.author,
    score: hit.points,
    commentsCount: hit.num_comments,
    storyText: hit.story_text ?? undefined,
    storyType: detectType(hit),
    createdAt: new Date(hit.created_at_i * 1000),
  }));
}

interface AlgoliaItem {
  id: number;
  author: string | null;
  text: string | null;
  points: number | null;
  created_at_i: number;
  children: AlgoliaItem[];
}

export async function fetchStoryWithComments(
  storyId: number
): Promise<{ story: HNStory; comments: HNComment[] } | null> {
  const res = await fetch(`${BASE_URL}/items/${storyId}`);
  if (!res.ok) return null;
  const data: AlgoliaItem & { title?: string; url?: string } = await res.json();

  const comments = flattenComments(data.children ?? []);
  return {
    story: {
      id: data.id,
      title: (data as any).title ?? "",
      url: (data as any).url ?? undefined,
      author: data.author ?? "unknown",
      score: data.points ?? 0,
      commentsCount: comments.length,
      storyType: "story",
      createdAt: new Date(data.created_at_i * 1000),
    },
    comments: comments
      .filter((c) => c.text && c.text.length > 20) // filter out one-liners
      .slice(0, 20), // top 20
  };
}

function flattenComments(items: AlgoliaItem[]): HNComment[] {
  const result: HNComment[] = [];
  for (const item of items) {
    if (item.text && item.author) {
      result.push({
        id: item.id,
        author: item.author,
        text: item.text,
        points: item.points,
        createdAt: new Date(item.created_at_i * 1000),
        children: [],
      });
    }
    if (item.children) {
      result.push(...flattenComments(item.children));
    }
  }
  return result;
}

function detectType(hit: AlgoliaHit): HNStory["storyType"] {
  if (hit._tags.includes("ask_hn")) return "ask_hn";
  if (hit._tags.includes("show_hn")) return "show_hn";
  if (hit._tags.includes("poll")) return "poll";
  return "story";
}
