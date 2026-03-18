import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { articles, research, stories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const article = await db.query.articles.findFirst({
    where: eq(articles.id, parseInt(id)),
  });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Get story info
  const story = article.storyId
    ? await db.query.stories.findFirst({
        where: eq(stories.id, article.storyId),
      })
    : null;

  // Get research materials
  const researchData = article.storyId
    ? await db.query.research.findFirst({
        where: eq(research.storyId, article.storyId),
      })
    : null;

  return NextResponse.json({
    article,
    story,
    research: researchData
      ? {
          originalContent: researchData.originalContent,
          hnComments: JSON.parse(researchData.hnComments ?? "[]"),
          webSearch: JSON.parse(researchData.webSearch ?? "[]"),
          aiSummary: JSON.parse(researchData.aiSummary ?? "{}"),
        }
      : null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.contentEdited !== undefined) {
    updates.contentEdited = body.contentEdited;
    updates.status = "edited";
  }
  if (body.status !== undefined) {
    updates.status = body.status;
  }

  await db
    .update(articles)
    .set(updates)
    .where(eq(articles.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
