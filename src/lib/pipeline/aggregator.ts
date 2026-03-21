/**
 * Daily Aggregation Pipeline — the core orchestrator
 *
 * Flow: filter -> cluster -> score -> auto-select
 *
 * Replaces the old per-story scoring with a full pipeline that:
 * 1. Collects all unique stories from today's snapshots
 * 2. Applies two-layer filtering (keyword + AI classification)
 * 3. Groups related stories into topic clusters via AI
 * 4. Scores each cluster on 5 dimensions
 * 5. Auto-selects top stories for deep dives and briefs
 */

import { db } from "@/lib/db";
import { stories, snapshots, dailyScores, topicClusters } from "@/lib/db/schema";
import { and, gte, lt, eq, sql } from "drizzle-orm";
import { filterTechStories } from "@/lib/hn/topic-filter";
import { clusterStories } from "@/lib/scoring/clusterer";
import { scoreClusters } from "@/lib/scoring/scorer";

export async function runDailyAggregation(dateStr: string): Promise<{
  totalStories: number;
  afterFilter: number;
  clusterCount: number;
  deepDives: number;
  briefs: number;
}> {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59+08:00`);

  // Step 1: Get all unique stories from today's snapshots
  const todaySnapshots = await db
    .select()
    .from(snapshots)
    .where(and(gte(snapshots.sampledAt, dayStart), lt(snapshots.sampledAt, dayEnd)));

  if (todaySnapshots.length === 0) {
    return { totalStories: 0, afterFilter: 0, clusterCount: 0, deepDives: 0, briefs: 0 };
  }

  // Aggregate per story: max score, max comments, appearance count, score trajectory
  const storyMap = new Map<
    number,
    {
      maxScore: number;
      maxComments: number;
      appearances: number;
      firstScore: number;
      latestScore: number;
    }
  >();

  for (const snap of todaySnapshots) {
    const existing = storyMap.get(snap.storyId);
    if (!existing) {
      storyMap.set(snap.storyId, {
        maxScore: snap.score,
        maxComments: snap.commentsCount,
        appearances: 1,
        firstScore: snap.score,
        latestScore: snap.score,
      });
    } else {
      existing.maxScore = Math.max(existing.maxScore, snap.score);
      existing.maxComments = Math.max(existing.maxComments, snap.commentsCount);
      existing.appearances++;
      existing.latestScore = snap.score; // last snapshot wins
    }
  }

  // Fetch story details for all unique stories
  const storyIds = Array.from(storyMap.keys());
  const storyDetails = [];
  for (const id of storyIds) {
    const s = await db.query.stories.findFirst({ where: eq(stories.id, id) });
    if (s) storyDetails.push(s);
  }

  const totalStories = storyDetails.length;

  // Step 2: Two-layer filter (keyword + AI classification)
  const filterInput = storyDetails.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url ?? undefined,
  }));
  const filterResult = await filterTechStories(filterInput);
  const passedIds = new Set(filterResult.passed);
  const filteredStories = storyDetails.filter((s) => passedIds.has(s.id));

  const afterFilter = filteredStories.length;
  if (afterFilter === 0) {
    return { totalStories, afterFilter: 0, clusterCount: 0, deepDives: 0, briefs: 0 };
  }

  // Step 3: Topic clustering (AI semantic grouping)
  const clusterInput = filteredStories.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    score: storyMap.get(s.id)!.maxScore,
    commentsCount: storyMap.get(s.id)!.maxComments,
  }));
  const clusters = await clusterStories(clusterInput, dateStr);

  // Step 4: Score each cluster
  const sampleTimes = new Set(
    todaySnapshots.map((s) =>
      s.sampledAt.toISOString?.() ?? String(s.sampledAt)
    )
  );
  const totalSamples = sampleTimes.size;

  await scoreClusters(clusters, storyMap, totalSamples, dateStr);

  // Step 5: Auto-select (Top 3 deep + rest as briefs)
  const allScored = await db
    .select()
    .from(dailyScores)
    .where(eq(dailyScores.date, dateStr))
    .orderBy(sql`final_score DESC`);

  let deepCount = 0;
  let briefCount = 0;
  const MAX_DEEP = 3;
  const MAX_BRIEF = 3;

  for (const scored of allScored) {
    if (deepCount < MAX_DEEP) {
      // Check if this cluster has enough depth for a deep dive
      const cluster = await db.query.topicClusters.findFirst({
        where: eq(topicClusters.id, scored.clusterId ?? 0),
      });
      const clusterStoryIds: number[] = cluster
        ? JSON.parse(cluster.storyIds)
        : [];
      const hasMultipleSources = clusterStoryIds.length > 1;
      const hasEnoughComments =
        (scored.discussionScore ?? 0) > 30 || hasMultipleSources;

      if (hasEnoughComments) {
        await db
          .update(dailyScores)
          .set({ status: "selected_deep" })
          .where(eq(dailyScores.id, scored.id));
        deepCount++;
      } else {
        // Not enough depth, make it a brief
        if (briefCount < MAX_BRIEF) {
          await db
            .update(dailyScores)
            .set({ status: "selected_brief" })
            .where(eq(dailyScores.id, scored.id));
          briefCount++;
        }
      }
    } else if (briefCount < MAX_BRIEF) {
      await db
        .update(dailyScores)
        .set({ status: "selected_brief" })
        .where(eq(dailyScores.id, scored.id));
      briefCount++;
    }
  }

  return {
    totalStories,
    afterFilter,
    clusterCount: clusters.length,
    deepDives: deepCount,
    briefs: briefCount,
  };
}
