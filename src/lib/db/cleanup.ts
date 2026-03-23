import { db } from "@/lib/db";
import { articles, snapshots, research, stories, dailyScores, topicClusters } from "@/lib/db/schema";
import { lt, sql } from "drizzle-orm";
import { join } from "path";
import { readdir, rm } from "fs/promises";

const IMAGE_DIR = join(process.cwd(), "data", "images");

export async function runCleanup(): Promise<{
  deletedSnapshots: number;
  deletedResearch: number;
  deletedStories: number;
  deletedScores: number;
  deletedClusters: number;
  deletedArticles: number;
  deletedImageDirs: number;
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

  // Articles: delete after 30 days
  const articleResult = await db
    .delete(articles)
    .where(lt(articles.createdAt, thirtyDaysAgo));

  // Images: delete directories whose storyId has no remaining articles
  const deletedImageDirs = await cleanupOrphanedImages();

  // VACUUM to reclaim disk space after bulk deletes
  await db.run(sql`VACUUM`);

  return {
    deletedSnapshots: snapshotResult.changes ?? 0,
    deletedResearch: researchResult.changes ?? 0,
    deletedStories: (storyResult as { changes?: number }).changes ?? 0,
    deletedScores: scoreResult.changes ?? 0,
    deletedClusters: (clusterResult as { changes?: number }).changes ?? 0,
    deletedArticles: articleResult.changes ?? 0,
    deletedImageDirs,
    vacuumed: true,
  };
}

/**
 * 删除没有对应文章的图片目录。
 * 图片目录以 storyId 命名，如果该 storyId 在 articles 表中已无记录则删除。
 */
async function cleanupOrphanedImages(): Promise<number> {
  let dirs: string[];
  try {
    dirs = await readdir(IMAGE_DIR);
  } catch {
    return 0; // data/images 不存在则跳过
  }

  // 获取所有还有文章的 storyId
  const activeStoryIds = new Set(
    (await db.select({ storyId: articles.storyId }).from(articles))
      .map((r) => String(r.storyId))
  );

  let deleted = 0;
  for (const dir of dirs) {
    if (!activeStoryIds.has(dir)) {
      await rm(join(IMAGE_DIR, dir), { recursive: true, force: true });
      deleted++;
    }
  }
  return deleted;
}
