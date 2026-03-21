import { db } from "@/lib/db";
import { snapshots, research, stories, dailyScores, topicClusters } from "@/lib/db/schema";
import { lt, sql } from "drizzle-orm";

export async function runCleanup(): Promise<{
  deletedSnapshots: number;
  deletedResearch: number;
  deletedStories: number;
  deletedScores: number;
  deletedClusters: number;
  vacuumed: boolean;
}> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

  // Snapshots: only needed for trend scoring on the day — keep 3 days for safety
  const snapshotResult = await db
    .delete(snapshots)
    .where(lt(snapshots.sampledAt, threeDaysAgo));

  // Research: intermediate data, keep 30 days
  const researchResult = await db
    .delete(research)
    .where(lt(research.createdAt, thirtyDaysAgo));

  // Stories not referenced by any article: delete after 7 days
  const storyResult = await db.run(sql`
    DELETE FROM stories WHERE created_at < ${sevenDaysAgo.getTime() / 1000}
    AND id NOT IN (SELECT DISTINCT story_id FROM articles WHERE story_id IS NOT NULL)
  `);

  // Daily scores: delete after 7 days (articles are already generated)
  const scoreResult = await db
    .delete(dailyScores)
    .where(lt(dailyScores.date, sevenDaysAgoStr));

  // Topic clusters: delete after 7 days
  const clusterResult = await db.run(sql`
    DELETE FROM topic_clusters WHERE created_at < ${sevenDaysAgo.getTime() / 1000}
  `);

  // VACUUM to reclaim disk space after bulk deletes
  await db.run(sql`VACUUM`);

  return {
    deletedSnapshots: snapshotResult.changes ?? 0,
    deletedResearch: researchResult.changes ?? 0,
    deletedStories: (storyResult as { changes?: number }).changes ?? 0,
    deletedScores: scoreResult.changes ?? 0,
    deletedClusters: (clusterResult as { changes?: number }).changes ?? 0,
    vacuumed: true,
  };
}
