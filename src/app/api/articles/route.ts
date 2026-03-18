import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { articles, stories } from "@/lib/db/schema";
import { eq, desc, gte } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const dateStr =
    searchParams.get("date") ??
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
    }).format(new Date());

  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);

  const results = await db
    .select({
      id: articles.id,
      storyId: articles.storyId,
      type: articles.type,
      title: articles.title,
      status: articles.status,
      contentMd: articles.contentMd,
      contentReviewed: articles.contentReviewed,
      contentEdited: articles.contentEdited,
      createdAt: articles.createdAt,
      storyTitle: stories.title,
      storyUrl: stories.url,
    })
    .from(articles)
    .leftJoin(stories, eq(articles.storyId, stories.id))
    .where(gte(articles.createdAt, dayStart))
    .orderBy(desc(articles.createdAt));

  // Filter by status if provided
  const filtered = status
    ? results.filter((r) => r.status === status)
    : results;

  return NextResponse.json({
    date: dateStr,
    articles: filtered.map((a) => ({
      ...a,
      wordCount: (a.contentEdited || a.contentReviewed || a.contentMd || "").length,
    })),
  });
}
