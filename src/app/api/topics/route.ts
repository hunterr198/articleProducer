import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyScores, stories, topicClusters } from "@/lib/db/schema";
import { eq, desc, inArray } from "drizzle-orm";

export async function GET() {
  const dateStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  // Join dailyScores -> topicClusters -> primary story
  const rows = await db
    .select({
      id: dailyScores.id,
      storyId: dailyScores.storyId,
      date: dailyScores.date,
      appearanceCount: dailyScores.appearanceCount,
      discussionScore: dailyScores.discussionScore,
      trendScore: dailyScores.trendScore,
      writabilityScore: dailyScores.writabilityScore,
      freshnessScore: dailyScores.freshnessScore,
      finalScore: dailyScores.finalScore,
      aiAnalysis: dailyScores.aiAnalysis,
      status: dailyScores.status,
      clusterId: dailyScores.clusterId,
      // cluster fields
      clusterLabel: topicClusters.label,
      clusterStoryIds: topicClusters.storyIds,
      clusterMergedScore: topicClusters.mergedScore,
      clusterMergedComments: topicClusters.mergedComments,
      // primary story fields
      title: stories.title,
      url: stories.url,
      storyType: stories.storyType,
      score: stories.score,
      commentsCount: stories.commentsCount,
    })
    .from(dailyScores)
    .leftJoin(topicClusters, eq(dailyScores.clusterId, topicClusters.id))
    .innerJoin(stories, eq(dailyScores.storyId, stories.id))
    .where(eq(dailyScores.date, dateStr))
    .orderBy(desc(dailyScores.finalScore));

  // Collect all unique story IDs referenced by clusters
  const allStoryIdSets: number[] = [];
  for (const row of rows) {
    if (row.clusterStoryIds) {
      try {
        const ids: number[] = JSON.parse(row.clusterStoryIds);
        for (const id of ids) {
          if (!allStoryIdSets.includes(id)) allStoryIdSets.push(id);
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // Fetch all cluster source stories in one query
  const sourceStoriesMap: Record<number, { id: number; title: string; url: string | null }> = {};
  if (allStoryIdSets.length > 0) {
    const sourceStories = await db
      .select({ id: stories.id, title: stories.title, url: stories.url })
      .from(stories)
      .where(inArray(stories.id, allStoryIdSets));
    for (const s of sourceStories) {
      sourceStoriesMap[s.id] = s;
    }
  }

  // Build enriched candidates
  const candidates = rows.map((row) => {
    let clusterSize = 1;
    let sourceStoryList: { id: number; title: string; url: string | null }[] = [];

    if (row.clusterStoryIds) {
      try {
        const ids: number[] = JSON.parse(row.clusterStoryIds);
        clusterSize = ids.length;
        sourceStoryList = ids
          .map((id) => sourceStoriesMap[id])
          .filter(Boolean) as { id: number; title: string; url: string | null }[];
      } catch {
        clusterSize = 1;
      }
    }

    return {
      id: row.id,
      storyId: row.storyId,
      date: row.date,
      appearanceCount: row.appearanceCount,
      discussionScore: row.discussionScore,
      trendScore: row.trendScore,
      writabilityScore: row.writabilityScore,
      freshnessScore: row.freshnessScore,
      finalScore: row.finalScore,
      aiAnalysis: row.aiAnalysis,
      status: row.status,
      clusterId: row.clusterId,
      clusterLabel: row.clusterLabel ?? null,
      clusterSize,
      sourceStories: sourceStoryList,
      title: row.title,
      url: row.url,
      storyType: row.storyType,
      score: row.score,
      commentsCount: row.commentsCount,
    };
  });

  return NextResponse.json({ date: dateStr, candidates });
}
