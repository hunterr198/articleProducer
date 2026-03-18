import { db } from "@/lib/db";
import { articles, dailyScores, stories } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { runResearch } from "@/lib/research/pipeline";
import { generateOutline, generateBriefSummary } from "@/lib/ai/gpt";
import { generateArticle as qwenGenerateArticle, generateBrief as qwenGenerateBrief } from "@/lib/ai/qwen";
import { reviewArticle } from "@/lib/review/reviewer";

interface Selection {
  dailyScoreId: number;
  type: "deep_dive" | "brief";
}

interface GenerationResult {
  articleIds: number[];
  errors: string[];
}

export async function generateArticlesForSelection(
  selections: Selection[]
): Promise<GenerationResult> {
  const articleIds: number[] = [];
  const errors: string[] = [];

  // Process deep dives first (sequentially for API rate limits)
  const deepDives = selections.filter((s) => s.type === "deep_dive");
  const briefs = selections.filter((s) => s.type === "brief");

  for (const sel of deepDives) {
    try {
      const id = await generateDeepDive(sel.dailyScoreId);
      articleIds.push(id);
    } catch (err) {
      errors.push(`Deep dive for score ${sel.dailyScoreId}: ${String(err)}`);
    }
  }

  // Process briefs (can be done faster)
  for (const sel of briefs) {
    try {
      const id = await generateBriefArticle(sel.dailyScoreId);
      articleIds.push(id);
    } catch (err) {
      errors.push(`Brief for score ${sel.dailyScoreId}: ${String(err)}`);
    }
  }

  return { articleIds, errors };
}

async function generateDeepDive(dailyScoreId: number): Promise<number> {
  const now = new Date();

  // Get the story data
  const score = await db.query.dailyScores.findFirst({
    where: eq(dailyScores.id, dailyScoreId),
  });
  if (!score) throw new Error(`Daily score ${dailyScoreId} not found`);

  const story = await db.query.stories.findFirst({
    where: eq(stories.id, score.storyId),
  });
  if (!story) throw new Error(`Story ${score.storyId} not found`);

  // Create article record (generating status)
  const [articleRecord] = await db.insert(articles).values({
    storyId: story.id,
    dailyScoreId,
    type: "deep_dive",
    status: "generating",
    createdAt: now,
    updatedAt: now,
  }).returning();

  try {
    // Step 1: Research
    const researchResult = await runResearch({
      id: story.id,
      title: story.title,
      url: story.url,
      storyType: story.storyType,
    });

    // Step 2: Generate outline (GPT)
    const materialPackStr = JSON.stringify(researchResult.materialPack);
    const outline = await generateOutline(materialPackStr);

    // Step 3: Generate article (Qwen)
    const outlineStr = JSON.stringify(outline);
    const draft = await qwenGenerateArticle(outlineStr, materialPackStr);

    // Step 4: 3-pass review (Qwen)
    const reviewed = await reviewArticle(draft, materialPackStr, "deep_dive");

    // Update article record
    await db.update(articles).set({
      title: outline.title,
      contentMd: draft,
      contentReviewed: reviewed.revised,
      outline: outlineStr,
      reviewLog: JSON.stringify(reviewed.log),
      status: "reviewed",
      updatedAt: new Date(),
    }).where(eq(articles.id, articleRecord.id));

    // Update daily score status
    await db.update(dailyScores).set({ status: "selected_deep" }).where(eq(dailyScores.id, dailyScoreId));

    return articleRecord.id;
  } catch (err) {
    // Mark as failed
    await db.update(articles).set({
      status: "failed",
      reviewLog: JSON.stringify({ error: String(err) }),
      updatedAt: new Date(),
    }).where(eq(articles.id, articleRecord.id));
    throw err;
  }
}

async function generateBriefArticle(dailyScoreId: number): Promise<number> {
  const now = new Date();

  const score = await db.query.dailyScores.findFirst({
    where: eq(dailyScores.id, dailyScoreId),
  });
  if (!score) throw new Error(`Daily score ${dailyScoreId} not found`);

  const story = await db.query.stories.findFirst({
    where: eq(stories.id, score.storyId),
  });
  if (!story) throw new Error(`Story ${score.storyId} not found`);

  const [articleRecord] = await db.insert(articles).values({
    storyId: story.id,
    dailyScoreId,
    type: "brief",
    status: "generating",
    createdAt: now,
    updatedAt: now,
  }).returning();

  try {
    // Get brief summary from GPT
    const summary = await generateBriefSummary(story.title, story.url ?? undefined);

    // Generate brief (Qwen)
    const draft = await qwenGenerateBrief(
      story.title,
      story.score ?? 0,
      story.commentsCount ?? 0,
      summary
    );

    // De-AI review only
    const reviewed = await reviewArticle(draft, "", "brief");

    await db.update(articles).set({
      title: story.title,
      contentMd: draft,
      contentReviewed: reviewed.revised,
      reviewLog: JSON.stringify(reviewed.log),
      status: "reviewed",
      updatedAt: new Date(),
    }).where(eq(articles.id, articleRecord.id));

    await db.update(dailyScores).set({ status: "selected_brief" }).where(eq(dailyScores.id, dailyScoreId));

    return articleRecord.id;
  } catch (err) {
    await db.update(articles).set({
      status: "failed",
      reviewLog: JSON.stringify({ error: String(err) }),
      updatedAt: new Date(),
    }).where(eq(articles.id, articleRecord.id));
    throw err;
  }
}
