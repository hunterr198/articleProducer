import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { snapshots, dailyScores, articles, systemLogs } from "@/lib/db/schema";
import { desc, eq, gte, count } from "drizzle-orm";

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

  // Candidate count
  const [candidates] = await db
    .select({ value: count() })
    .from(dailyScores)
    .where(eq(dailyScores.date, dateStr));

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
    candidatesCount: candidates?.value ?? 0,
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
