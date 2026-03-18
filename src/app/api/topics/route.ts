import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailyScores, stories } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const dateStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
  }).format(new Date());

  const candidates = await db
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
      title: stories.title,
      url: stories.url,
      storyType: stories.storyType,
      score: stories.score,
      commentsCount: stories.commentsCount,
    })
    .from(dailyScores)
    .innerJoin(stories, eq(dailyScores.storyId, stories.id))
    .where(eq(dailyScores.date, dateStr))
    .orderBy(desc(dailyScores.finalScore));

  return NextResponse.json({ date: dateStr, candidates });
}
