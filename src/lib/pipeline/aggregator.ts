/**
 * Daily Aggregation Pipeline — the core orchestrator
 *
 * Flow: filter -> cluster -> score -> auto-select
 *
 * Replaces the old per-story scoring with a full pipeline that:
 * 1. Collects all unique stories from today's snapshots
 * 2. Applies two-layer filtering (keyword + AI classification)
 * 3. Groups related stories into topic clusters via AI
 * 4. Scores each cluster on 5 dimensions
 * 5. Auto-selects top stories for deep dives and briefs
 */

import { db } from "@/lib/db";
import { stories, snapshots, dailyScores, topicClusters, articles } from "@/lib/db/schema";
import { and, gte, lt, eq, sql, inArray } from "drizzle-orm";
import { filterTechStories } from "@/lib/hn/topic-filter";
import { clusterStories } from "@/lib/scoring/clusterer";
import { scoreClusters } from "@/lib/scoring/scorer";

const DASHSCOPE_URL =
  "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

export async function runDailyAggregation(dateStr: string): Promise<{
  totalStories: number;
  afterFilter: number;
  clusterCount: number;
  deepDives: number;
  briefs: number;
}> {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59+08:00`);

  // Step 1: Get all unique stories from today's snapshots
  const todaySnapshots = await db
    .select()
    .from(snapshots)
    .where(and(gte(snapshots.sampledAt, dayStart), lt(snapshots.sampledAt, dayEnd)));

  if (todaySnapshots.length === 0) {
    return { totalStories: 0, afterFilter: 0, clusterCount: 0, deepDives: 0, briefs: 0 };
  }

  // Aggregate per story: max score, max comments, appearance count, score trajectory
  const storyMap = new Map<
    number,
    {
      maxScore: number;
      maxComments: number;
      appearances: number;
      firstScore: number;
      latestScore: number;
    }
  >();

  for (const snap of todaySnapshots) {
    const existing = storyMap.get(snap.storyId);
    if (!existing) {
      storyMap.set(snap.storyId, {
        maxScore: snap.score,
        maxComments: snap.commentsCount,
        appearances: 1,
        firstScore: snap.score,
        latestScore: snap.score,
      });
    } else {
      existing.maxScore = Math.max(existing.maxScore, snap.score);
      existing.maxComments = Math.max(existing.maxComments, snap.commentsCount);
      existing.appearances++;
      existing.latestScore = snap.score; // last snapshot wins
    }
  }

  // Fetch story details for all unique stories
  const storyIds = Array.from(storyMap.keys());
  const storyDetails = [];
  for (const id of storyIds) {
    const s = await db.query.stories.findFirst({ where: eq(stories.id, id) });
    if (s) storyDetails.push(s);
  }

  const totalStories = storyDetails.length;

  // Step 2: Two-layer filter (keyword + AI classification)
  const filterInput = storyDetails.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url ?? undefined,
  }));
  const filterResult = await filterTechStories(filterInput);
  const passedIds = new Set(filterResult.passed);
  const filteredStories = storyDetails.filter((s) => passedIds.has(s.id));

  const afterFilter = filteredStories.length;
  if (afterFilter === 0) {
    return { totalStories, afterFilter: 0, clusterCount: 0, deepDives: 0, briefs: 0 };
  }

  // Step 3: Topic clustering (AI semantic grouping)
  const clusterInput = filteredStories.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    score: storyMap.get(s.id)!.maxScore,
    commentsCount: storyMap.get(s.id)!.maxComments,
  }));
  const clusters = await clusterStories(clusterInput, dateStr);

  // Step 4: Score each cluster
  const sampleTimes = new Set(
    todaySnapshots.map((s) =>
      s.sampledAt.toISOString?.() ?? String(s.sampledAt)
    )
  );
  const totalSamples = sampleTimes.size;

  await scoreClusters(clusters, storyMap, totalSamples, dateStr);

  // Step 4.5: Penalize topics that overlap with recently published articles
  await penalizeDuplicateTopics(dateStr);

  // Step 5: Auto-select — Top 6 by finalScore, first 3 deep, next 3 brief
  const allScored = await db
    .select()
    .from(dailyScores)
    .where(eq(dailyScores.date, dateStr))
    .orderBy(sql`final_score DESC`);

  const MAX_DEEP = 3;
  const MAX_BRIEF = 3;
  const top6 = allScored.slice(0, MAX_DEEP + MAX_BRIEF);

  for (let i = 0; i < top6.length; i++) {
    const status = i < MAX_DEEP ? "selected_deep" : "selected_brief";
    await db
      .update(dailyScores)
      .set({ status })
      .where(eq(dailyScores.id, top6[i].id));
  }

  const deepCount = Math.min(MAX_DEEP, top6.length);
  const briefCount = Math.max(0, top6.length - MAX_DEEP);

  return {
    totalStories,
    afterFilter,
    clusterCount: clusters.length,
    deepDives: deepCount,
    briefs: briefCount,
  };
}

/**
 * Topic-level dedup: penalize clusters whose topic overlaps with
 * articles published in the past 7 days.
 *
 * The existing cooling mechanism only checks by storyId (same HN post).
 * This catches different HN posts that cover the same underlying topic,
 * e.g. two different AI supply-chain security stories on consecutive days.
 */
async function penalizeDuplicateTopics(dateStr: string): Promise<void> {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const lookback = new Date(dayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

  // 1. Fetch recent article titles (past 7 days, excluding today)
  const recentArticles = await db
    .select({ title: articles.title })
    .from(articles)
    .where(
      and(
        gte(articles.createdAt, lookback),
        lt(articles.createdAt, dayStart),
        sql`${articles.status} NOT IN ('failed', 'generating')`
      )
    );

  const recentTitles = recentArticles
    .map((a) => a.title)
    .filter((t): t is string => !!t);

  if (recentTitles.length === 0) return;

  // 2. Get today's scored clusters with labels
  const todayScores = await db
    .select({
      id: dailyScores.id,
      clusterId: dailyScores.clusterId,
      finalScore: dailyScores.finalScore,
    })
    .from(dailyScores)
    .where(eq(dailyScores.date, dateStr));

  const clusterIds = todayScores
    .map((s) => s.clusterId)
    .filter((id): id is number => id !== null);

  if (clusterIds.length === 0) return;

  const clusterRows = await db
    .select({ id: topicClusters.id, label: topicClusters.label })
    .from(topicClusters)
    .where(inArray(topicClusters.id, clusterIds));

  const candidates = todayScores
    .map((s) => {
      const cluster = clusterRows.find((c) => c.id === s.clusterId);
      return cluster
        ? { scoreId: s.id, label: cluster.label, finalScore: s.finalScore }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  if (candidates.length === 0) return;

  // 3. Ask AI to identify topic-level duplicates
  const systemPrompt = `你是一个话题去重助手。判断候选话题是否与近期已发表文章在核心话题上重复。

规则：
1. "重复"指讨论同一个核心事件/问题/趋势，换了角度写但本质是同一个话题。
2. 例如"AI 供应链安全漏洞"和"一个 .pth 文件偷空整个云"是同一话题（AI 基础设施安全），标记为重复。
3. 例如"AI 导致裁员"和"技术中产最后窗口期"是同一话题（AI 对就业的冲击），标记为重复。
4. 宽泛的"都和 AI 相关"不算重复。必须是核心话题实质重叠。`;

  const userPrompt = `近期已发表文章：
${recentTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}

今天候选话题：
${candidates.map((c, i) => `[${i}] ${c.label}`).join("\n")}

输出 JSON：{"duplicate_indices": [0, 2]}
只列出与已发表文章话题重复的候选编号。没有重复则返回 {"duplicate_indices": []}`;

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen3.5-plus-2026-02-15",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        enable_thinking: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      console.error(`Topic dedup API failed: ${res.status}`);
      return;
    }

    const data = await res.json();
    const content = data.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    const duplicateIndices: number[] = parsed.duplicate_indices ?? [];

    // 4. Apply heavy penalty (0.1×) to duplicate topics
    for (const idx of duplicateIndices) {
      if (idx >= 0 && idx < candidates.length) {
        const candidate = candidates[idx];
        const penalized = Math.round((candidate.finalScore ?? 0) * 0.1);
        await db
          .update(dailyScores)
          .set({ finalScore: penalized })
          .where(eq(dailyScores.id, candidate.scoreId));
        console.log(
          `Topic dedup: penalized "${candidate.label}" (score ${candidate.finalScore} → ${penalized})`
        );
      }
    }
  } catch (err) {
    console.error("Topic dedup failed:", err);
    // Non-fatal: if dedup fails, proceed without it
  }
}
