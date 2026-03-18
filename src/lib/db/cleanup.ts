import { db } from "@/lib/db";
import { snapshots, research } from "@/lib/db/schema";
import { lt } from "drizzle-orm";

export async function runCleanup(): Promise<{
  deletedSnapshots: number;
  deletedResearch: number;
}> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // Delete snapshots older than 30 days
  const snapshotResult = await db
    .delete(snapshots)
    .where(lt(snapshots.sampledAt, thirtyDaysAgo));

  // Delete research older than 90 days
  const researchResult = await db
    .delete(research)
    .where(lt(research.createdAt, ninetyDaysAgo));

  return {
    deletedSnapshots: snapshotResult.changes ?? 0,
    deletedResearch: researchResult.changes ?? 0,
  };
}
