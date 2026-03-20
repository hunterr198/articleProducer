import { db } from "@/lib/db";
import { articles, dailyScores, stories, topicClusters } from "@/lib/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
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

    // 8. 3-pass review
    const reviewed = await reviewArticle(draft, materialPackStr, "deep_dive");

    // 9. Save to articles table
    await db
      .update(articles)
      .set({
        title: outline.title,
        contentMd: draft,
        contentReviewed: reviewed.revised,
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

    const draft = await qwenGenerateBrief(
      briefTitle,
      primaryStory.score ?? 0,
      primaryStory.commentsCount ?? 0,
      summary
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

  // 2. Generate deep dive articles (sequential)
  const deepDiveIds: number[] = [];
  const errors: string[] = [];

  for (const score of deepScores) {
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
    try {
      const id = await generateClusterBrief(score.id);
      briefIds.push(id);
    } catch (err) {
      errors.push(`Brief ${score.id}: ${String(err)}`);
    }
  }

  return { deepDiveIds, briefIds, errors };
}
