import type { HNStory, HNComment } from "./types";

const BASE_URL = "https://hn.algolia.com/api/v1";

// 聚焦科技/AI 的搜索关键词
const TECH_KEYWORDS = [
  "AI",
  "LLM",
  "machine learning",
  "deep learning",
  "GPT",
  "Claude",
  "open source",
  "programming",
  "startup",
  "cybersecurity",
  "blockchain",
  "robotics",
  "API",
  "developer tools",
];

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

function hitToStory(hit: AlgoliaHit): HNStory {
  return {
    id: parseInt(hit.objectID),
    title: hit.title,
    url: hit.url ?? undefined,
    author: hit.author,
    score: hit.points,
    commentsCount: hit.num_comments,
    storyText: hit.story_text ?? undefined,
    storyType: detectType(hit),
    createdAt: new Date(hit.created_at_i * 1000),
  };
}

/**
 * 双策略采集：front_page + 关键词搜索，合并去重，按分数排序
 *
 * 策略 A：抓 front_page 上的科技相关帖子
 * 策略 B：用关键词并行搜索最近 24 小时的高分帖子
 * 合并去重后取 Top N
 */
export async function fetchTechStories(limit = 30): Promise<HNStory[]> {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

  // 策略 A：front_page 帖子
  const frontPagePromise = fetch(
    `${BASE_URL}/search?tags=front_page&hitsPerPage=50`
  )
    .then((r) => (r.ok ? r.json() : { hits: [] }))
    .then((data) => (data.hits as AlgoliaHit[]).map(hitToStory))
    .catch(() => [] as HNStory[]);

  // 策略 B：关键词并行搜索（最近 24 小时，高分优先）
  const keywordPromises = TECH_KEYWORDS.map((keyword) =>
    fetch(
      `${BASE_URL}/search?query=${encodeURIComponent(keyword)}&tags=story&numericFilters=points>20,created_at_i>${oneDayAgo}&hitsPerPage=10`
    )
      .then((r) => (r.ok ? r.json() : { hits: [] }))
      .then((data) => (data.hits as AlgoliaHit[]).map(hitToStory))
      .catch(() => [] as HNStory[])
  );

  // 并行执行所有请求
  const [frontPageStories, ...keywordResults] = await Promise.all([
    frontPagePromise,
    ...keywordPromises,
  ]);

  // 合并去重（以 story ID 为 key，保留分数最高的版本）
  const storyMap = new Map<number, HNStory>();

  for (const story of [...frontPageStories, ...keywordResults.flat()]) {
    const existing = storyMap.get(story.id);
    if (!existing || story.score > existing.score) {
      storyMap.set(story.id, story);
    }
  }

  // 按分数排序，取 Top N
  const allStories = Array.from(storyMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return allStories;
}

// 保留原有的 fetchFrontPageStories 作为兼容
export async function fetchFrontPageStories(): Promise<HNStory[]> {
  return fetchTechStories(30);
}

// --- 以下为评论获取，保持不变 ---

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
      .filter((c) => c.text && c.text.length > 20)
      .slice(0, 20),
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
