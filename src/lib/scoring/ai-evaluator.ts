import { db } from "@/lib/db";
import { dailyScores, stories } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { evaluateWritability } from "@/lib/ai/gpt";
import { searchChineseMedia } from "@/lib/research/search";
import { fetchStoryWithComments } from "@/lib/hn/algolia-api";
import { computeFinalScore } from "./scorer";

export async function evaluateTopCandidates(dateStr: string): Promise<{
  evaluated: number;
  errors: string[];
}> {
  // Get top 30 candidates by preliminary score
  const candidates = await db
    .select({
      id: dailyScores.id,
      storyId: dailyScores.storyId,
      appearanceCount: dailyScores.appearanceCount,
      discussionScore: dailyScores.discussionScore,
      trendScore: dailyScores.trendScore,
      finalScore: dailyScores.finalScore,
    })
    .from(dailyScores)
    .where(eq(dailyScores.date, dateStr))
    .orderBy(desc(dailyScores.finalScore))
    .limit(30);

  let evaluated = 0;
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      // Get story details
      const story = await db.query.stories.findFirst({
        where: eq(stories.id, candidate.storyId),
      });
      if (!story) continue;

      // Fetch top HN comments for evaluation
      let topCommentsText = "";
      try {
        const commentsData = await fetchStoryWithComments(story.id);
        if (commentsData) {
          topCommentsText = commentsData.comments
            .slice(0, 10)
            .map((c) => `@${c.author}: ${c.text.replace(/<[^>]*>/g, "").slice(0, 300)}`)
            .join("\n");
        }
      } catch {
        // Comments fetch failed, proceed without
      }

      // GPT writability evaluation
      const evaluation = await evaluateWritability(
        {
          title: story.title,
          url: story.url ?? undefined,
          score: story.score ?? 0,
          commentsCount: story.commentsCount ?? 0,
          time: story.hnCreatedAt?.toISOString() ?? "",
        },
        topCommentsText
      );

      // Freshness: check Chinese media coverage
      const coverageScore = await searchChineseMedia(story.title);
      const freshnessScore = 100 - coverageScore;

      // Recompute final score with real writability + freshness
      const writabilityScore = evaluation.scores.writability;
      const newFinalScore = computeFinalScore({
        sustainedPresence: (candidate.appearanceCount / 8) * 100,
        discussionDepth: candidate.discussionScore ?? 50,
        growthTrend: candidate.trendScore ?? 50,
        writability: writabilityScore,
        freshness: freshnessScore,
      });

      // Update daily score
      await db.update(dailyScores).set({
        writabilityScore,
        freshnessScore,
        finalScore: Math.round(newFinalScore),
        aiAnalysis: JSON.stringify(evaluation),
      }).where(eq(dailyScores.id, candidate.id));

      evaluated++;
    } catch (err) {
      errors.push(`Story ${candidate.storyId}: ${String(err)}`);
    }
  }

  return { evaluated, errors };
}
