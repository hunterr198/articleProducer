import { db } from "@/lib/db";
import { stories, snapshots, systemLogs } from "@/lib/db/schema";
import { fetchTopStoryIds } from "./official-api";
import { fetchTechStories } from "./algolia-api";
import type { HNStory } from "./types";
import { eq, gte } from "drizzle-orm";
import { filterTechStories } from "./topic-filter";

const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const TOP_N = 30; // Only track top 30

interface SampleResult {
  storiesCount: number;
  newStories: number;
  sampledAt: Date;
}

export async function runSample(): Promise<SampleResult> {
  const now = new Date();

  // Deduplication: skip if sampled within 2 hours
  const recentSnapshot = await db.query.snapshots.findFirst({
    where: gte(snapshots.sampledAt, new Date(now.getTime() - DEDUP_WINDOW_MS)),
    orderBy: (s, { desc }) => [desc(s.sampledAt)],
  });
  if (recentSnapshot) {
    await log("info", "sampler", "Skipped: recent sample exists", {
      lastSample: recentSnapshot.sampledAt,
    });
    return { storiesCount: 0, newStories: 0, sampledAt: now };
  }

  // Fetch data from both APIs with fallback
  let storyList: HNStory[] = [];
  let rankings = new Map<number, number>();

  try {
    // Official API for rankings
    const topIds = await fetchTopStoryIds();
    topIds.slice(0, TOP_N).forEach((id, i) => rankings.set(id, i + 1));

    // Algolia for details (dual strategy: front_page + keyword search)
    const algoliaStories = await fetchTechStories(60); // 多取一些，过滤后保留 top 30
    storyList = algoliaStories;
  } catch (err) {
    await log("error", "sampler", "API fetch failed", { error: String(err) });
    throw err;
  }

  // Filter out job posts and polls
  storyList = storyList.filter(
    (s) => s.storyType !== "poll" && s.title !== ""
  );

  // 两层过滤：关键词预筛 + AI 精筛，只保留科技/AI 相关内容
  const filterResult = await filterTechStories(
    storyList.map((s) => ({ id: s.id, title: s.title }))
  );
  const passedIds = new Set(filterResult.passed);
  storyList = storyList.filter((s) => passedIds.has(s.id));

  await log("info", "sampler", `Topic filter: ${filterResult.stats.tier1Pass} keyword pass, ${filterResult.stats.aiPass} AI pass, ${filterResult.stats.rejected} rejected`);

  // Upsert stories and create snapshots
  let newCount = 0;
  for (const story of storyList.slice(0, TOP_N)) {
    const existing = await db.query.stories.findFirst({
      where: eq(stories.id, story.id),
    });

    if (existing) {
      await db
        .update(stories)
        .set({
          score: story.score,
          commentsCount: story.commentsCount,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(stories.id, story.id));
    } else {
      await db.insert(stories).values({
        id: story.id,
        title: story.title,
        url: story.url,
        author: story.author,
        storyType: story.storyType,
        score: story.score,
        commentsCount: story.commentsCount,
        storyText: story.storyText,
        hnCreatedAt: story.createdAt,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      newCount++;
    }

    await db.insert(snapshots).values({
      storyId: story.id,
      sampledAt: now,
      rank: rankings.get(story.id) ?? 99,
      score: story.score,
      commentsCount: story.commentsCount,
      createdAt: now,
    });
  }

  await log("info", "sampler", `Sample complete: ${storyList.length} stories, ${newCount} new`);

  return {
    storiesCount: Math.min(storyList.length, TOP_N),
    newStories: newCount,
    sampledAt: now,
  };
}

async function log(level: "info" | "warn" | "error", source: string, message: string, details?: any) {
  await db.insert(systemLogs).values({
    level,
    source,
    message,
    details: details ? JSON.stringify(details) : null,
    createdAt: new Date(),
  });
}
