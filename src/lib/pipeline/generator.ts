import { db } from "@/lib/db";
import { articles, dailyScores, stories, topicClusters } from "@/lib/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { runClusterResearch } from "@/lib/research/pipeline";
import { generateOutline, generateBriefSummary } from "@/lib/ai/gpt";
import {
  generateArticle as qwenGenerateArticle,
  generateBrief as qwenGenerateBrief,
} from "@/lib/ai/qwen";
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

  const deepDives = selections.filter((s) => s.type === "deep_dive");
  const briefs = selections.filter((s) => s.type === "brief");

  for (const sel of deepDives) {
    try {
      const id = await generateClusterDeepDive(sel.dailyScoreId);
      articleIds.push(id);
    } catch (err) {
      errors.push(`Deep dive for score ${sel.dailyScoreId}: ${String(err)}`);
    }
  }

  for (const sel of briefs) {
    try {
      const id = await generateClusterBrief(sel.dailyScoreId);
      articleIds.push(id);
    } catch (err) {
      errors.push(`Brief for score ${sel.dailyScoreId}: ${String(err)}`);
    }
  }

  return { articleIds, errors };
}

async function generateClusterDeepDive(dailyScoreId: number): Promise<number> {
  const now = new Date();

  // 1. Get daily_score → get clusterId → get cluster from topic_clusters
  const score = await db.query.dailyScores.findFirst({
    where: eq(dailyScores.id, dailyScoreId),
  });
  if (!score) throw new Error(`Daily score ${dailyScoreId} not found`);

  const cluster = score.clusterId
    ? await db.query.topicClusters.findFirst({
        where: eq(topicClusters.id, score.clusterId),
      })
    : null;

  // Fall back to single-story behaviour if no cluster
  const primaryStoryId = cluster?.primaryStoryId ?? score.storyId;
  const storyIdsRaw: number[] = cluster
    ? JSON.parse(cluster.storyIds)
    : [score.storyId];
  const clusterLabel = cluster?.label ?? "";

  // 2. Fetch all stories in cluster from DB
  const clusterStories = await db
    .select()
    .from(stories)
    .where(inArray(stories.id, storyIdsRaw));

  if (clusterStories.length === 0) {
    throw new Error(`No stories found for cluster (score ${dailyScoreId})`);
  }

  const primaryStory = clusterStories.find((s) => s.id === primaryStoryId) ?? clusterStories[0];

  // Create article record (generating status)
  const [articleRecord] = await db
    .insert(articles)
    .values({
      storyId: primaryStory.id,
      dailyScoreId,
      type: "deep_dive",
      status: "generating",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  try {
    // 4. Call runClusterResearch
    const researchResult = await runClusterResearch({
      storyIds: storyIdsRaw,
      primaryStoryId: primaryStory.id,
      label: clusterLabel,
    });

    // 5. Generate outline (GPT)
    const materialPackStr = JSON.stringify(researchResult.materialPack);
    const outline = await generateOutline(materialPackStr);
    const outlineStr = JSON.stringify(outline);

    // 6. Build sources array for article prompt
    const sources = clusterStories.map((s) => ({
      title: s.title,
      url: s.url ?? `https://news.ycombinator.com/item?id=${s.id}`,
      hnUrl: `https://news.ycombinator.com/item?id=${s.id}`,
      score: s.score ?? 0,
    }));
    const images = researchResult.images ?? [];

    // 7. Generate article (Qwen) with multi-source meta
    const draft = await qwenGenerateArticle(outlineStr, materialPackStr, {
      sources,
      images,
    });

    // 8. Build sources section programmatically (don't rely on AI to preserve it)
    const sourcesMarkdown = buildSourcesSection(sources);

    // 9. Strip AI-generated sources before review (review passes tend to drop them)
    const draftBody = stripSourcesSection(draft);

    // 10. 3-pass review (on body only, without sources)
    const reviewed = await reviewArticle(draftBody, materialPackStr, "deep_dive");
    const reviewedBody = stripSourcesSection(reviewed.revised);

    // 11. Save with guaranteed sources appended
    await db
      .update(articles)
      .set({
        title: outline.title,
        contentMd: draftBody + sourcesMarkdown,
        contentReviewed: reviewedBody + sourcesMarkdown,
        outline: outlineStr,
        reviewLog: JSON.stringify(reviewed.log),
        status: "reviewed",
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleRecord.id));

    return articleRecord.id;
  } catch (err) {
    await db
      .update(articles)
      .set({
        status: "failed",
        reviewLog: JSON.stringify({ error: String(err) }),
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleRecord.id));
    throw err;
  }
}

async function generateClusterBrief(dailyScoreId: number): Promise<number> {
  const now = new Date();

  const score = await db.query.dailyScores.findFirst({
    where: eq(dailyScores.id, dailyScoreId),
  });
  if (!score) throw new Error(`Daily score ${dailyScoreId} not found`);

  const cluster = score.clusterId
    ? await db.query.topicClusters.findFirst({
        where: eq(topicClusters.id, score.clusterId),
      })
    : null;

  const primaryStoryId = cluster?.primaryStoryId ?? score.storyId;
  const clusterLabel = cluster?.label ?? "";

  const primaryStory = await db.query.stories.findFirst({
    where: eq(stories.id, primaryStoryId),
  });
  if (!primaryStory) throw new Error(`Story ${primaryStoryId} not found`);

  const [articleRecord] = await db
    .insert(articles)
    .values({
      storyId: primaryStory.id,
      dailyScoreId,
      type: "brief",
      status: "generating",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  try {
    // Use cluster label if available, otherwise fall back to story title
    const briefTitle = clusterLabel || primaryStory.title;
    const summary = await generateBriefSummary(briefTitle, primaryStory.url ?? undefined);

    const hnUrl = `https://news.ycombinator.com/item?id=${primaryStory.id}`;
    const draft = await qwenGenerateBrief(
      briefTitle,
      primaryStory.score ?? 0,
      primaryStory.commentsCount ?? 0,
      summary,
      primaryStory.url ?? undefined,
      hnUrl
    );

    const reviewed = await reviewArticle(draft, "", "brief");

    await db
      .update(articles)
      .set({
        title: briefTitle,
        contentMd: draft,
        contentReviewed: reviewed.revised,
        reviewLog: JSON.stringify(reviewed.log),
        status: "reviewed",
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleRecord.id));

    return articleRecord.id;
  } catch (err) {
    await db
      .update(articles)
      .set({
        status: "failed",
        reviewLog: JSON.stringify({ error: String(err) }),
        updatedAt: new Date(),
      })
      .where(eq(articles.id, articleRecord.id));
    throw err;
  }
}

export async function generateDailyDigest(dateStr: string): Promise<{
  deepDiveIds: number[];
  briefIds: number[];
  errors: string[];
}> {
  // 1. Get all auto-selected clusters: selected_deep and selected_brief
  const deepScores = await db
    .select()
    .from(dailyScores)
    .where(and(eq(dailyScores.date, dateStr), eq(dailyScores.status, "selected_deep")))
    .orderBy(desc(dailyScores.finalScore));

  const briefScores = await db
    .select()
    .from(dailyScores)
    .where(and(eq(dailyScores.date, dateStr), eq(dailyScores.status, "selected_brief")))
    .orderBy(desc(dailyScores.finalScore));

  // Skip scores that already have non-failed articles (idempotency guard)
  const existingArticles = await db
    .select({ dailyScoreId: articles.dailyScoreId })
    .from(articles)
    .where(
      and(
        inArray(articles.dailyScoreId, [...deepScores, ...briefScores].map((s) => s.id)),
        sql`${articles.status} != 'failed'`
      )
    );
  const alreadyGenerated = new Set(existingArticles.map((a) => a.dailyScoreId));

  // 2. Generate deep dive articles (sequential)
  const deepDiveIds: number[] = [];
  const errors: string[] = [];

  for (const score of deepScores) {
    if (alreadyGenerated.has(score.id)) continue;
    try {
      const id = await generateClusterDeepDive(score.id);
      deepDiveIds.push(id);
    } catch (err) {
      errors.push(`Deep dive ${score.id}: ${String(err)}`);
    }
  }

  // 3. Generate briefs (sequential)
  const briefIds: number[] = [];

  for (const score of briefScores) {
    if (alreadyGenerated.has(score.id)) continue;
    try {
      const id = await generateClusterBrief(score.id);
      briefIds.push(id);
    } catch (err) {
      errors.push(`Brief ${score.id}: ${String(err)}`);
    }
  }

  return { deepDiveIds, briefIds, errors };
}

// --- Helpers: guarantee sources section survives review passes ---

function buildSourcesSection(
  sources: Array<{ title: string; url: string; hnUrl: string; score: number }>
): string {
  if (sources.length === 0) return "";
  const lines = sources
    .map((s) => `- [${s.title}](${s.url})（HN ${s.score} 分）[讨论](${s.hnUrl})`)
    .join("\n");
  return `\n\n---\n\n**来源与参考**\n${lines}`;
}

function stripSourcesSection(text: string): string {
  // Remove AI-generated sources block at the end of the article
  return text.replace(/\n*---\n+\*\*来源与参考\*\*[\s\S]*$/, "").trimEnd();
}
