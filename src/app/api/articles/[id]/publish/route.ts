import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { articles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { markdownToWechat } from "@/lib/publish/markdown-to-wechat";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const articleId = parseInt(id);

  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const markdown =
    article.contentEdited ??
    article.contentReviewed ??
    article.contentMd ??
    "";

  const html = await markdownToWechat(markdown);

  await db
    .update(articles)
    .set({
      status: "published",
      publishedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(articles.id, articleId));

  return NextResponse.json({ success: true, html });
}
