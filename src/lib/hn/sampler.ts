import { db } from "@/lib/db";
import { stories, snapshots, systemLogs } from "@/lib/db/schema";
import { fetchAllRecentStories } from "./algolia-api";
import type { HNStory } from "./types";
import { eq, gte } from "drizzle-orm";

const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

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

  // Fetch all recent stories from Algolia
  let storyList: HNStory[] = [];

  try {
    storyList = await fetchAllRecentStories();
  } catch (err) {
    await log("error", "sampler", "API fetch failed", { error: String(err) });
    throw err;
  }

  // Filter out job posts and polls
  storyList = storyList.filter(
    (s) => s.storyType !== "poll" && s.title !== ""
  );

  // Upsert stories and create snapshots
  let newCount = 0;
  // 存全部帖子（过滤在汇总阶段做，不在采样时做）
  for (const [index, story] of storyList.entries()) {
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
      rank: index + 1,
      score: story.score,
      commentsCount: story.commentsCount,
      createdAt: now,
    });
  }

  await log("info", "sampler", `Sample complete: ${storyList.length} stories, ${newCount} new`);

  return {
    storiesCount: storyList.length,
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
