import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { snapshots, dailyScores, articles, systemLogs, topicClusters } from "@/lib/db/schema";
import { desc, eq, gte, count, and, inArray } from "drizzle-orm";

export async function GET() {
  const dateStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);

  // Sample count today
  const todaySnapshots = await db
    .selectDistinct({ sampledAt: snapshots.sampledAt })
    .from(snapshots)
    .where(gte(snapshots.sampledAt, dayStart));

  // Cluster count for today
  const [clusterCount] = await db
    .select({ value: count() })
    .from(topicClusters)
    .where(eq(topicClusters.date, dateStr));

  // Auto-selected count (selected_deep + selected_brief) for today
  const [autoSelectedCount] = await db
    .select({ value: count() })
    .from(dailyScores)
    .where(
      and(
        eq(dailyScores.date, dateStr),
        inArray(dailyScores.status, ["selected_deep", "selected_brief"])
      )
    );

  // Article count today
  const [articleCount] = await db
    .select({ value: count() })
    .from(articles)
    .where(gte(articles.createdAt, dayStart));

  // Recent logs
  const recentLogs = await db
    .select()
    .from(systemLogs)
    .orderBy(desc(systemLogs.createdAt))
    .limit(10);

  // Last sample time
  const lastSnapshot = await db
    .select({ sampledAt: snapshots.sampledAt })
    .from(snapshots)
    .orderBy(desc(snapshots.sampledAt))
    .limit(1);

  return NextResponse.json({
    samplesCollected: todaySnapshots.length,
    samplesTotal: 8,
    clusterCount: clusterCount?.value ?? 0,
    autoSelectedCount: autoSelectedCount?.value ?? 0,
    articlesCount: articleCount?.value ?? 0,
    lastSampleAt: lastSnapshot[0]?.sampledAt ?? null,
    recentLogs: recentLogs.map((l) => ({
      level: l.level,
      source: l.source,
      message: l.message,
      createdAt: l.createdAt,
    })),
  });
}
