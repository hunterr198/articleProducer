# Topic Clustering Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge multiple HN stories about the same topic into clusters before scoring, so one article can reference multiple sources.

**Architecture:** Add a clustering step (Qwen AI) between data collection and scoring. Modify article generation to research all sources in a cluster and include multiple reference links.

**Spec:** Based on discussion in main session. Related: `docs/superpowers/specs/2026-03-18-hn-article-producer-design.md`

---

## Task 1: Database Schema — Add topic_clusters Table

**Files:**
- Modify: `src/lib/db/schema.ts`
- Run: `drizzle-kit generate && drizzle-kit push`

- [ ] **Step 1: Add topic_clusters table**

```typescript
export const topicClusters = sqliteTable("topic_clusters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(), // YYYY-MM-DD
  label: text("label").notNull(), // AI-generated cluster label, e.g. "OpenAI acquires Astral"
  primaryStoryId: integer("primary_story_id").notNull().references(() => stories.id), // highest-scoring story
  storyIds: text("story_ids").notNull(), // JSON array of all story IDs in this cluster
  mergedScore: integer("merged_score"), // max score across cluster
  mergedComments: integer("merged_comments"), // max comments across cluster
  totalAppearances: integer("total_appearances"), // sum of appearances across cluster
  imageUrls: text("image_urls"), // JSON array of selected image URLs
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_topic_clusters_date").on(table.date),
]);
```

- [ ] **Step 2: Add clusterId to daily_scores**

Add to `dailyScores` table:
```typescript
clusterId: integer("cluster_id").references(() => topicClusters.id),
```

- [ ] **Step 3: Run migration**

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit push
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: add topic_clusters table and cluster_id to daily_scores"
```

---

## Task 2: Topic Clustering Logic

**Files:**
- Create: `src/lib/scoring/clusterer.ts`

- [ ] **Step 1: Implement clustering function**

Create `src/lib/scoring/clusterer.ts`:

```typescript
import { db } from "@/lib/db";
import { stories, snapshots, topicClusters } from "@/lib/db/schema";
import { eq, and, gte, lt } from "drizzle-orm";

interface StoryForClustering {
  id: number;
  title: string;
  url?: string | null;
  score: number;
  commentsCount: number;
  appearances: number;
}

interface Cluster {
  label: string;
  storyIds: number[];
  primaryStoryId: number;
  mergedScore: number;
  mergedComments: number;
  totalAppearances: number;
}

/**
 * Cluster today's stories by topic similarity using Qwen AI.
 *
 * Flow:
 * 1. Collect all unique stories from today's snapshots
 * 2. Send titles + URLs to Qwen for semantic grouping
 * 3. Save clusters to topic_clusters table
 * 4. Return clusters for scoring
 */
export async function clusterTodayStories(dateStr: string): Promise<Cluster[]> {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59+08:00`);

  // Get all unique stories with their appearance counts
  const todaySnapshots = await db
    .select()
    .from(snapshots)
    .where(and(gte(snapshots.sampledAt, dayStart), lt(snapshots.sampledAt, dayEnd)));

  if (todaySnapshots.length === 0) return [];

  // Aggregate per story: max score, max comments, appearance count
  const storyMap = new Map<number, { score: number; comments: number; appearances: number }>();
  for (const snap of todaySnapshots) {
    const existing = storyMap.get(snap.storyId);
    if (!existing) {
      storyMap.set(snap.storyId, {
        score: snap.score,
        comments: snap.commentsCount,
        appearances: 1,
      });
    } else {
      existing.score = Math.max(existing.score, snap.score);
      existing.comments = Math.max(existing.comments, snap.commentsCount);
      existing.appearances++;
    }
  }

  // Fetch story details
  const storyIds = Array.from(storyMap.keys());
  const storyDetails = await db
    .select()
    .from(stories)
    .where(/* id in storyIds — use sql`id IN (${storyIds.join(",")})` */);
  // Note: implementer should use proper Drizzle "in" operator

  const storiesForClustering: StoryForClustering[] = storyDetails
    .filter((s) => storyMap.has(s.id))
    .map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      score: storyMap.get(s.id)!.score,
      commentsCount: storyMap.get(s.id)!.comments,
      appearances: storyMap.get(s.id)!.appearances,
    }));

  // Call AI for semantic clustering
  const aiClusters = await aiClusterStories(storiesForClustering);

  // Save to database
  const now = new Date();
  const results: Cluster[] = [];

  for (const cluster of aiClusters) {
    const clusterStories = storiesForClustering.filter((s) => cluster.storyIds.includes(s.id));
    const primaryStory = clusterStories.reduce((a, b) => (a.score > b.score ? a : b));

    const clusterData: Cluster = {
      label: cluster.label,
      storyIds: cluster.storyIds,
      primaryStoryId: primaryStory.id,
      mergedScore: Math.max(...clusterStories.map((s) => s.score)),
      mergedComments: Math.max(...clusterStories.map((s) => s.commentsCount)),
      totalAppearances: clusterStories.reduce((sum, s) => sum + s.appearances, 0),
    };

    await db.insert(topicClusters).values({
      date: dateStr,
      label: clusterData.label,
      primaryStoryId: clusterData.primaryStoryId,
      storyIds: JSON.stringify(clusterData.storyIds),
      mergedScore: clusterData.mergedScore,
      mergedComments: clusterData.mergedComments,
      totalAppearances: clusterData.totalAppearances,
      createdAt: now,
    });

    results.push(clusterData);
  }

  return results;
}
```

- [ ] **Step 2: Implement AI clustering prompt**

In the same file, add `aiClusterStories()`:

```typescript
const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

async function aiClusterStories(
  stories: StoryForClustering[]
): Promise<Array<{ label: string; storyIds: number[] }>> {
  const storyList = stories
    .map((s) => `[ID:${s.id}] ${s.title} (${s.url ? extractDomain(s.url) : "no url"})`)
    .join("\n");

  const systemPrompt = `你是一个话题分析专家。你的任务是将 Hacker News 上的帖子按话题分组。

规则：
- 如果两个帖子讲的是同一件事（同一个产品发布、同一个事件、同一篇论文），合并为一个话题簇
- 不同角度报道同一事件的帖子也要合并（如 "X acquires Y" 和 "Y joins X"）
- 如果一个帖子讲的是独立话题，它自己就是一个单独的簇
- 不要过度合并——"AI coding" 和 "AI safety" 虽然都跟 AI 有关，但是不同话题
- 每个簇给一个简短的中文标签（如"OpenAI 收购 Astral"）`;

  const userPrompt = `请将以下帖子按话题分组：

${storyList}

输出 JSON（直接输出，不要代码块）：
[{"label": "话题中文标签", "story_ids": [ID1, ID2, ...]}, ...]

注意：大部分帖子都是独立话题（只包含自己一个 ID）。只有真正讲同一件事的才合并。`;

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen3.5-plus",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        enable_thinking: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) throw new Error(`Qwen API error: ${res.status}`);
    const data = await res.json();
    const content = data.choices[0]?.message?.content ?? "[]";
    const parsed = JSON.parse(content);

    // Handle both array and object-wrapped-array responses
    const clusters = Array.isArray(parsed) ? parsed : (parsed.clusters ?? parsed.results ?? []);

    return clusters.map((c: any) => ({
      label: c.label ?? "Unknown",
      storyIds: c.story_ids ?? c.storyIds ?? [],
    }));
  } catch (err) {
    console.error("AI clustering failed:", err);
    // Fallback: each story is its own cluster
    return stories.map((s) => ({
      label: s.title,
      storyIds: [s.id],
    }));
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "";
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add AI-powered topic clustering for same-event story merging"
```

---

## Task 3: Integrate Clustering into Scoring Pipeline

**Files:**
- Modify: `src/lib/scoring/scorer.ts`
- Modify: `src/app/api/cron/score/route.ts`

- [ ] **Step 1: Modify runDailyScoring to use clusters**

The current `runDailyScoring` works on individual stories. Change it to:
1. First call `clusterTodayStories(dateStr)` to get clusters
2. Score each cluster (instead of each story):
   - `sustainedPresence`: use `cluster.totalAppearances / (totalSamples * cluster.storyIds.length)` — normalized by how many stories are in the cluster
   - `discussionDepth`: use `cluster.mergedComments` and `cluster.mergedScore`
   - `growthTrend`: compute from primary story's snapshot history
3. Insert one `daily_scores` row per cluster, with `clusterId` set
4. The `storyId` in `daily_scores` should be the `primaryStoryId` of the cluster

- [ ] **Step 2: Update scoring route**

In `src/app/api/cron/score/route.ts`, the flow becomes:
```
1. clusterTodayStories(dateStr)  — new step
2. runDailyScoring(dateStr)      — now uses clusters
3. evaluateTopCandidates(dateStr) — unchanged (evaluates top 30 clusters)
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: scoring now operates on topic clusters instead of individual stories"
```

---

## Task 4: Multi-Source Research Pipeline

**Files:**
- Modify: `src/lib/research/pipeline.ts`
- Modify: `src/lib/research/scraper.ts` (minor: add batch scrape)

- [ ] **Step 1: Add runClusterResearch function**

In `src/lib/research/pipeline.ts`, add a new function:

```typescript
export async function runClusterResearch(cluster: {
  storyIds: number[];
  primaryStoryId: number;
  label: string;
}): Promise<ResearchResult> {
  // 1. Fetch all stories in the cluster from DB
  // 2. For each story: scrape URL + collect images (in parallel)
  // 3. Fetch HN comments for ALL stories (merge & deduplicate)
  // 4. Merge all images, select best 5
  // 5. Web search using cluster label
  // 6. GPT analysis with ALL sources combined
  // 7. Store research with primaryStoryId as key
}
```

Key changes from single-source `runResearch`:
- Scrapes multiple URLs (one per story in cluster)
- Merges HN comments from all stories (deduplicate by author+content)
- Image pool comes from all sources, then filtered to best 5
- GPT material analysis receives ALL source content, with source attribution

- [ ] **Step 2: Smart image selection**

When collecting images from multiple sources, add logic to:
- Deduplicate by URL
- Filter out badges/icons (already implemented)
- Prefer larger images (if width/height available)
- Limit to 5 best images
- Fall back to Qwen search if no images found (already implemented)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: multi-source research pipeline for topic clusters"
```

---

## Task 5: Update Article Generation for Multi-Source

**Files:**
- Modify: `src/lib/pipeline/generator.ts`
- Modify: `src/lib/ai/prompts.ts`

- [ ] **Step 1: Update generator to use cluster data**

In `generateDeepDive()`:
- Fetch cluster info from `topic_clusters` table using `daily_scores.clusterId`
- Call `runClusterResearch(cluster)` instead of `runResearch(story)`
- Pass all source URLs and HN links to the article prompt

- [ ] **Step 2: Update article prompt for multi-source references**

Change the "来源与参考" section in `articlePrompt()` to accept an array of sources:

```typescript
export function articlePrompt(
  outline: string,
  materialPack: string,
  meta: {
    sources: Array<{ title: string; url: string; hnUrl: string; score: number }>;
    images: string[];
  }
)
```

The prompt's reference section becomes:
```
## 文章末尾（必须包含）

---

**来源与参考**
${meta.sources.map(s => `- [${s.title}](${s.url})（HN ${s.score} 分） [讨论](${s.hnUrl})`).join("\n")}
```

- [ ] **Step 3: Update GPT material analysis for multi-source**

The `materialAnalysisPrompt` should now indicate which facts come from which source:
```
## Source Article 1: [Title] (domain.com)
[content...]

## Source Article 2: [Title] (domain.com)
[content...]
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: article generation supports multi-source clusters with combined references"
```

---

## Task 6: Update UI for Topic Clusters

**Files:**
- Modify: `src/app/api/topics/route.ts`
- Modify: `src/components/topic-card.tsx`

- [ ] **Step 1: Update topics API**

The API should return cluster info with each candidate:
```typescript
{
  id: dailyScore.id,
  clusterId: dailyScore.clusterId,
  clusterLabel: topicClusters.label,
  clusterSize: JSON.parse(topicClusters.storyIds).length,
  sources: [
    { title: "Astral to Join OpenAI", url: "...", score: 316 },
    { title: "OpenAI to Acquire Astral", url: "...", score: 115 },
  ],
  // ... existing fields
}
```

- [ ] **Step 2: Update TopicCard to show multiple sources**

When a topic cluster has multiple stories, the card should show:
- Cluster label as the main title (e.g. "OpenAI 收购 Astral")
- Badge showing "2 sources" or "3 sources"
- Expandable section listing all source titles with links
- Combined HN stats (highest score, total comments)

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: topic selection UI shows cluster info and multiple sources"
```

---

## Summary

| Task | What | Changes |
|------|------|---------|
| 1 | Database schema | New `topic_clusters` table, `cluster_id` on `daily_scores` |
| 2 | Clustering logic | AI groups same-topic stories, saves clusters |
| 3 | Scoring integration | Score clusters instead of individual stories |
| 4 | Multi-source research | Scrape + comment-fetch for all stories in cluster |
| 5 | Article generation | Multi-source references, images from all sources |
| 6 | UI updates | Show cluster info, multiple source links |

**Total: 6 tasks. Each produces a working, testable increment.**
