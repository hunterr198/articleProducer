import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { articles, stories } from "@/lib/db/schema";
import { eq, desc, gte, and } from "drizzle-orm";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const dateStr = searchParams.get("date"); // 可选，不传则查所有

  // 构建查询条件
  const conditions = [];
  if (dateStr) {
    conditions.push(gte(articles.createdAt, new Date(`${dateStr}T00:00:00+08:00`)));
  }

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
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(articles.createdAt))
    .limit(50);

  // Filter by status if provided
  const filtered = status
    ? results.filter((r) => r.status === status)
    : results;

  return NextResponse.json({
    date: dateStr ?? "all",
    articles: filtered.map((a) => ({
      ...a,
      wordCount: (a.contentEdited || a.contentReviewed || a.contentMd || "").length,
    })),
  });
}
