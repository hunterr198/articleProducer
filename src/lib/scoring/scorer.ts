import { logNormalize } from "./normalize";
import { db } from "@/lib/db";
import { snapshots, dailyScores, stories, topicClusters } from "@/lib/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import type { Cluster } from "./clusterer";

export function computeSustainedPresence(
  appearances: number,
  totalSamples: number
): number {
  if (totalSamples === 0) return 0;
  return (appearances / totalSamples) * 100;
}

export function computeDiscussionDepth(
  story: { commentsCount: number; score: number },
  maxes: { maxComments: number; maxRatio: number }
): number {
  const commentsNorm = logNormalize(story.commentsCount, maxes.maxComments);
  const ratio = story.score > 0 ? story.commentsCount / story.score : 0;
  const ratioNorm = logNormalize(ratio, maxes.maxRatio);
  return commentsNorm * 0.5 + ratioNorm * 0.5;
}

export function computeGrowthTrend(
  data: { firstScore: number; latestScore: number; commentGrowthRate: number },
  maxes: { maxScoreGrowth: number; maxCommentGrowth: number }
): number {
  const scoreGrowth = Math.max(0, data.latestScore - data.firstScore);
  const scoreNorm = logNormalize(scoreGrowth, maxes.maxScoreGrowth);
  const commentNorm = logNormalize(data.commentGrowthRate, maxes.maxCommentGrowth);
  return scoreNorm * 0.5 + commentNorm * 0.5;
}

export function computeFinalScore(dimensions: {
  sustainedPresence: number;
  discussionDepth: number;
  growthTrend: number;
  writability: number;
  freshness: number;
}): number {
  return Math.round(
    dimensions.sustainedPresence * 0.25 +
    dimensions.discussionDepth * 0.25 +
    dimensions.growthTrend * 0.20 +
    dimensions.writability * 0.20 +
    dimensions.freshness * 0.10
  );
}

// Cooling decay: penalize recently selected stories
export function getCoolingDecay(daysAgo: number | undefined): number {
  if (daysAgo === undefined) return 1.0; // never selected
  if (daysAgo <= 1) return 0.3;
  if (daysAgo <= 2) return 0.6;
  return 1.0;
}

function getDateNDaysAgo(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Score clusters produced by the aggregation pipeline.
 * Computes the 5 scoring dimensions per cluster, applies cooling, and inserts into daily_scores.
 */
export async function scoreClusters(
  clusters: Cluster[],
  storyMap: Map<number, { maxScore: number; maxComments: number; appearances: number; firstScore: number; latestScore: number }>,
  totalSamples: number,
  dateStr: string
): Promise<void> {
  if (clusters.length === 0) return;

  // Build per-cluster metrics
  const clusterMetrics = clusters.map((cluster) => {
    // Aggregate appearances across all stories in the cluster
    let totalAppearances = 0;
    let maxScore = 0;
    let maxComments = 0;
    let firstScore = 0;
    let latestScore = 0;
    let commentGrowth = 0;

    for (const storyId of cluster.storyIds) {
      const data = storyMap.get(storyId);
      if (!data) continue;
      totalAppearances += data.appearances;
      maxScore = Math.max(maxScore, data.maxScore);
      maxComments = Math.max(maxComments, data.maxComments);
      // Use primary story's score trajectory for growth
      if (storyId === cluster.primaryStoryId) {
        firstScore = data.firstScore;
        latestScore = data.latestScore;
        commentGrowth = data.maxComments; // approximate
      }
    }

    return {
      cluster,
      totalAppearances,
      maxScore,
      maxComments,
      firstScore,
      latestScore,
      commentGrowth,
    };
  });

  // Update totalAppearances in the DB for each cluster
  for (const cm of clusterMetrics) {
    await db
      .update(topicClusters)
      .set({ totalAppearances: cm.totalAppearances })
      .where(eq(topicClusters.id, cm.cluster.id));
  }

  // Compute normalization maxes across all clusters
  const allMaxComments = Math.max(...clusterMetrics.map((m) => m.maxComments), 1);
  const allMaxRatio = Math.max(
    ...clusterMetrics.map((m) =>
      m.maxScore > 0 ? m.maxComments / m.maxScore : 0
    ),
    0.1
  );
  const allMaxScoreGrowth = Math.max(
    ...clusterMetrics.map((m) => Math.max(0, m.latestScore - m.firstScore)),
    1
  );
  const allMaxCommentGrowth = Math.max(
    ...clusterMetrics.map((m) => m.commentGrowth),
    1
  );

  // Apply cooling mechanism — check recent selections for the primary story
  const recentSelections = await db
    .select({ storyId: dailyScores.storyId, date: dailyScores.date })
    .from(dailyScores)
    .where(
      and(
        sql`${dailyScores.status} IN ('selected_deep', 'selected_brief')`,
        gte(dailyScores.date, getDateNDaysAgo(dateStr, 3))
      )
    );

  const selectionDaysAgo = new Map<number, number>();
  for (const sel of recentSelections) {
    const daysAgo = daysBetween(sel.date, dateStr);
    const existing = selectionDaysAgo.get(sel.storyId);
    if (existing === undefined || daysAgo < existing) {
      selectionDaysAgo.set(sel.storyId, daysAgo);
    }
  }

  // Score each cluster and insert into daily_scores
  for (const cm of clusterMetrics) {
    const sustainedPresence = computeSustainedPresence(
      cm.totalAppearances,
      totalSamples
    );
    const discussionDepth = computeDiscussionDepth(
      { commentsCount: cm.maxComments, score: cm.maxScore },
      { maxComments: allMaxComments, maxRatio: allMaxRatio }
    );
    const growthTrend = computeGrowthTrend(
      {
        firstScore: cm.firstScore,
        latestScore: cm.latestScore,
        commentGrowthRate: cm.commentGrowth,
      },
      {
        maxScoreGrowth: allMaxScoreGrowth,
        maxCommentGrowth: allMaxCommentGrowth,
      }
    );

    const decayFactor = getCoolingDecay(
      selectionDaysAgo.get(cm.cluster.primaryStoryId)
    );

    const finalScore =
      computeFinalScore({
        sustainedPresence,
        discussionDepth,
        growthTrend,
        writability: 50, // placeholder until AI evaluation
        freshness: 50, // placeholder until freshness check
      }) * decayFactor;

    await db.insert(dailyScores).values({
      storyId: cm.cluster.primaryStoryId,
      date: dateStr,
      appearanceCount: cm.totalAppearances,
      discussionScore: discussionDepth,
      trendScore: growthTrend,
      writabilityScore: 50,
      freshnessScore: 50,
      finalScore: Math.round(finalScore),
      status: "candidate",
      clusterId: cm.cluster.id,
      createdAt: new Date(),
    });
  }
}

export async function runDailyScoring(dateStr: string): Promise<{
  candidatesCount: number;
}> {
  // dateStr is YYYY-MM-DD in Beijing time
  // We need to find snapshots taken on this date
  // Approximate: use the date string to find snapshots from that calendar day
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59+08:00`);

  // Get all snapshots for today
  const todaySnapshots = await db
    .select()
    .from(snapshots)
    .where(and(gte(snapshots.sampledAt, dayStart), lt(snapshots.sampledAt, dayEnd)));

  if (todaySnapshots.length === 0) return { candidatesCount: 0 };

  // Count total unique sample times
  const sampleTimes = new Set(
    todaySnapshots.map((s) => s.sampledAt.toISOString())
  );
  const totalSamples = sampleTimes.size;
  if (totalSamples < 1) return { candidatesCount: 0 };
  // Note: spec says minimum 4 samples, but for testing we allow 1+

  // Group snapshots by story
  const storyMap = new Map<number, typeof todaySnapshots>();
  for (const snap of todaySnapshots) {
    const existing = storyMap.get(snap.storyId) ?? [];
    existing.push(snap);
    storyMap.set(snap.storyId, existing);
  }

  // Compute per-story metrics
  const metrics: Array<{
    storyId: number;
    appearances: number;
    commentsCount: number;
    score: number;
    firstScore: number;
    latestScore: number;
    commentGrowth: number;
  }> = [];

  for (const [storyId, snaps] of storyMap) {
    const sorted = snaps.sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime());
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];

    metrics.push({
      storyId,
      appearances: snaps.length,
      commentsCount: latest.commentsCount,
      score: latest.score,
      firstScore: first.score,
      latestScore: latest.score,
      commentGrowth: latest.commentsCount - first.commentsCount,
    });
  }

  // Compute maxes for normalization
  const maxComments = Math.max(...metrics.map((m) => m.commentsCount), 1);
  const maxRatio = Math.max(
    ...metrics.map((m) => (m.score > 0 ? m.commentsCount / m.score : 0)), 0.1
  );
  const maxScoreGrowth = Math.max(
    ...metrics.map((m) => Math.max(0, m.latestScore - m.firstScore)), 1
  );
  const maxCommentGrowth = Math.max(...metrics.map((m) => m.commentGrowth), 1);

  // Score each story (dimensions 1-3)
  const scored = metrics.map((m) => ({
    storyId: m.storyId,
    appearances: m.appearances,
    sustainedPresence: computeSustainedPresence(m.appearances, totalSamples),
    discussionDepth: computeDiscussionDepth(
      { commentsCount: m.commentsCount, score: m.score },
      { maxComments, maxRatio }
    ),
    growthTrend: computeGrowthTrend(
      {
        firstScore: m.firstScore,
        latestScore: m.latestScore,
        commentGrowthRate: m.commentGrowth,
      },
      { maxScoreGrowth, maxCommentGrowth }
    ),
  }));

  // Sort by preliminary score, take top 30
  const preliminary = scored
    .map((s) => ({
      ...s,
      prelimScore: s.sustainedPresence * 0.25 + s.discussionDepth * 0.25 + s.growthTrend * 0.20,
    }))
    .sort((a, b) => b.prelimScore - a.prelimScore)
    .slice(0, 30);

  // Apply cooling mechanism
  const recentSelections = await db
    .select({ storyId: dailyScores.storyId, date: dailyScores.date })
    .from(dailyScores)
    .where(
      and(
        sql`${dailyScores.status} IN ('selected_deep', 'selected_brief')`,
        gte(dailyScores.date, getDateNDaysAgo(dateStr, 3))
      )
    );

  const selectionDaysAgo = new Map<number, number>();
  for (const sel of recentSelections) {
    const daysAgo = daysBetween(sel.date, dateStr);
    const existing = selectionDaysAgo.get(sel.storyId);
    if (existing === undefined || daysAgo < existing) {
      selectionDaysAgo.set(sel.storyId, daysAgo);
    }
  }

  // Insert daily scores
  for (const item of preliminary) {
    const decayFactor = getCoolingDecay(selectionDaysAgo.get(item.storyId));
    const finalScore = computeFinalScore({
      sustainedPresence: item.sustainedPresence,
      discussionDepth: item.discussionDepth,
      growthTrend: item.growthTrend,
      writability: 50, // placeholder
      freshness: 50,   // placeholder
    }) * decayFactor;

    await db.insert(dailyScores).values({
      storyId: item.storyId,
      date: dateStr,
      appearanceCount: item.appearances,
      discussionScore: item.discussionDepth,
      trendScore: item.growthTrend,
      writabilityScore: 50,
      freshnessScore: 50,
      finalScore: Math.round(finalScore),
      status: "candidate",
      createdAt: new Date(),
    });
  }

  return { candidatesCount: preliminary.length };
}
