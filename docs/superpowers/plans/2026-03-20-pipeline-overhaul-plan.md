# Pipeline Overhaul: Full-Volume Collection + Topic Clustering + Auto Daily Digest

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the data pipeline from "front-page sampling" to "24h full-volume collection + AI filtering + topic clustering + auto daily digest generation."

**Key Changes:**
1. Collection: 24h full-volume (points>=5) instead of front_page + keyword search
2. Filtering: moved from collection time to aggregation time
3. New: topic clustering (merge same-event stories)
4. Scoring: operates on clusters, not individual stories
5. Selection: fully automatic (Top 3 deep + rest as briefs)
6. Generation: multi-source research + auto daily digest assembly

---

## Task 1: Rewrite Data Collection

**Files:**
- Rewrite: `src/lib/hn/algolia-api.ts`
- Modify: `src/lib/hn/sampler.ts`
- Remove: keyword search logic, TECH_KEYWORDS, fetchTechStories

**What changes:**

The current `fetchTechStories()` does 15 API calls (1 front_page + 14 keyword searches). Replace with a single call that fetches ALL stories from the last 24 hours with points >= 5.

- [ ] **Step 1: Replace algolia-api.ts collection function**

```typescript
// New: single function replaces fetchTechStories
export async function fetchAllRecentStories(): Promise<HNStory[]> {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;

  // One API call: all stories from last 24h with points >= 5
  // sorted by relevance (which correlates with points)
  const res = await fetch(
    `${BASE_URL}/search?tags=story&numericFilters=points%3E5,created_at_i%3E${oneDayAgo}&hitsPerPage=500`
  );
  if (!res.ok) throw new Error(`Algolia API error: ${res.status}`);
  const data = await res.json();

  return data.hits.map(hitToStory);
}
```

Remove: `TECH_KEYWORDS`, `fetchTechStories()`, `fetchFrontPageStories()`.
Keep: `fetchStoryWithComments()` (used in research pipeline), `hitToStory()`, `detectType()`.

- [ ] **Step 2: Simplify sampler.ts**

The sampler now:
1. Calls `fetchAllRecentStories()` — gets ~200 stories
2. Filters out polls/jobs
3. Upserts all stories into DB + creates snapshots
4. Does NOT do topic filtering here (filtering moves to aggregation step)

Remove: import of `filterTechStories`, the filtering call.
Remove: import of `fetchTopStoryIds` from official-api (no longer needed for ranking).

The ranking field in snapshots: set to the story's position in the results (Algolia sorts by relevance).

- [ ] **Step 3: Update launchd schedule**

Change from every 3 hours (10800s) to every 4 hours (14400s) in `scripts/com.articleproducer.sample.plist`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "refactor: replace keyword search with 24h full-volume collection"
```

---

## Task 2: Add topic_clusters Table

**Files:**
- Modify: `src/lib/db/schema.ts`
- Run migration

- [ ] **Step 1: Add table and modify daily_scores**

```typescript
export const topicClusters = sqliteTable("topic_clusters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  label: text("label").notNull(),
  primaryStoryId: integer("primary_story_id").notNull().references(() => stories.id),
  storyIds: text("story_ids").notNull(), // JSON array
  mergedScore: integer("merged_score"),
  mergedComments: integer("merged_comments"),
  totalAppearances: integer("total_appearances"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_topic_clusters_date").on(table.date),
]);
```

Add `clusterId` field to `dailyScores` table:
```typescript
clusterId: integer("cluster_id").references(() => topicClusters.id),
```

- [ ] **Step 2: Run migration**

```bash
pnpm drizzle-kit generate && pnpm drizzle-kit push
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add topic_clusters table"
```

---

## Task 3: Aggregation Pipeline (Filter + Cluster + Score)

**Files:**
- Create: `src/lib/pipeline/aggregator.ts` — orchestrates the full aggregation
- Create: `src/lib/scoring/clusterer.ts` — AI topic clustering
- Modify: `src/lib/scoring/scorer.ts` — score clusters not stories
- Modify: `src/app/api/cron/score/route.ts` — call aggregator
- Keep: `src/lib/hn/topic-filter.ts` — reuse existing filter logic

This is the core change. The aggregation runs once daily at 20:00.

- [ ] **Step 1: Create aggregator.ts**

```typescript
// src/lib/pipeline/aggregator.ts
// Orchestrates: collect unique stories → filter → cluster → score → auto-select

export async function runDailyAggregation(dateStr: string): Promise<{
  totalStories: number;
  afterFilter: number;
  clusters: number;
  deepDives: number;
  briefs: number;
}> {
  // Step 1: Get all unique stories from today's snapshots
  const allStories = await getUniqueStoriesFromSnapshots(dateStr);

  // Step 2: Two-layer filter (keyword + AI classification)
  const filtered = await filterTechStories(allStories);

  // Step 3: Topic clustering (AI semantic grouping)
  const clusters = await clusterStories(filtered, dateStr);

  // Step 4: Score each cluster
  const scored = await scoreClusters(clusters, dateStr);

  // Step 5: Auto-select (Top 3 deep + rest as briefs)
  const { deepDives, briefs } = await autoSelect(scored, dateStr);

  return {
    totalStories: allStories.length,
    afterFilter: filtered.length,
    clusters: clusters.length,
    deepDives: deepDives.length,
    briefs: briefs.length,
  };
}
```

- [ ] **Step 2: Create clusterer.ts**

AI-powered topic clustering. Sends all filtered story titles + URLs to Qwen, gets back semantic groups.

Prompt design:
- Input: list of story titles with IDs and domains
- Output: JSON array of clusters, each with a Chinese label and list of story IDs
- Few-shot examples of merging (e.g., "Astral joins OpenAI" + "OpenAI acquires Astral" → one cluster)
- Explicit rule: don't over-merge; only merge stories about the SAME event

Fallback: if AI fails, each story is its own cluster.

- [ ] **Step 3: Modify scorer.ts for cluster-based scoring**

Scoring dimensions now operate on clusters:
- **Sustained presence**: totalAppearances across all stories in cluster / total samples
- **Discussion depth**: max comments in cluster, comments-to-score ratio of primary story
- **Growth trend**: primary story's score change across snapshots
- **Writability**: AI evaluation of cluster (using primary story + cluster label)
- **Freshness**: Qwen search for cluster label in Chinese media

New: **Auto-selection logic**:
```typescript
function autoSelect(scored: ScoredCluster[]): { deepDives: Cluster[]; briefs: Cluster[] } {
  // Sort by final_score desc
  // Top 3 that have sufficient depth (comments >= 30 OR multiple sources) → deep_dive
  // If a top-3 cluster doesn't have enough depth, demote to brief, pull next one up
  // Remaining clusters with score above threshold → briefs (max 8)
}
```

- [ ] **Step 4: Update scoring route**

Replace current flow with single call to `runDailyAggregation(dateStr)`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: aggregation pipeline with filter, cluster, score, and auto-select"
```

---

## Task 4: Multi-Source Article Generation

**Files:**
- Modify: `src/lib/research/pipeline.ts` — multi-source research
- Modify: `src/lib/pipeline/generator.ts` — generate from clusters
- Modify: `src/lib/ai/prompts.ts` — multi-source prompts

- [ ] **Step 1: Add runClusterResearch()**

For each selected cluster:
1. Fetch all stories in the cluster from DB
2. Scrape ALL URLs in parallel (not just primary)
3. Fetch HN comments from ALL stories, merge & deduplicate
4. Collect images from all sources, pick best 5
5. GPT analysis with all source content (attributed per source)
6. Store research with primaryStoryId as key

- [ ] **Step 2: Update generator for auto daily digest**

```typescript
export async function generateDailyDigest(dateStr: string): Promise<{
  deepDiveIds: number[];
  briefIds: number[];
  digestMarkdown: string;
  errors: string[];
}> {
  // 1. Get auto-selected clusters from daily_scores
  const deepDiveClusters = await getSelectedClusters(dateStr, "selected_deep");
  const briefClusters = await getSelectedClusters(dateStr, "selected_brief");

  // 2. Generate deep dive articles (sequential for API rate limits)
  for (const cluster of deepDiveClusters) {
    await generateClusterDeepDive(cluster);
  }

  // 3. Generate briefs (parallel)
  await Promise.all(briefClusters.map(c => generateClusterBrief(c)));

  // 4. Assemble daily digest
  const digest = await assembleDailyDigest(dateStr);

  return { deepDiveIds, briefIds, digestMarkdown: digest, errors };
}
```

- [ ] **Step 3: Update prompts for multi-source**

The `materialAnalysisPrompt` now receives multiple source articles:
```
## Source 1: [Title] (domain.com)
[content...]

## Source 2: [Title] (domain.com)
[content...]

## HN Discussion Thread 1 (316 points, 141 comments)
[comments...]

## HN Discussion Thread 2 (115 points, 61 comments)
[comments...]
```

The `articlePrompt` meta changes:
```typescript
meta: {
  sources: Array<{ title: string; url: string; hnUrl: string; score: number }>;
  images: string[];
}
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: multi-source article generation and auto daily digest"
```

---

## Task 5: Auto Daily Digest API + Trigger

**Files:**
- Create: `src/app/api/cron/aggregate/route.ts` — daily aggregation trigger
- Modify: `src/app/api/articles/generate/route.ts` — support auto-generate mode
- Modify: `src/app/api/articles/digest/route.ts` — return complete digest

- [ ] **Step 1: Create aggregation API route**

```typescript
// GET /api/cron/aggregate
// Called daily at 20:00 by launchd
// Runs: filter → cluster → score → auto-select → generate articles → assemble digest
export async function GET() {
  const dateStr = getBejingDateStr();
  const aggResult = await runDailyAggregation(dateStr);
  const genResult = await generateDailyDigest(dateStr);
  return NextResponse.json({ success: true, aggregation: aggResult, generation: genResult });
}
```

- [ ] **Step 2: Update launchd**

Add a third plist: `com.articleproducer.aggregate.plist` — runs at 20:00 Beijing time daily.
Or combine scoring + generation into one trigger.

The daily workflow becomes:
```
Every 4 hours: /api/cron/sample (collect data)
20:00 daily:   /api/cron/aggregate (filter + cluster + score + select + generate)
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: auto daily digest generation triggered by cron"
```

---

## Task 6: Update UI for New Flow

**Files:**
- Modify: `src/app/api/topics/route.ts` — return clusters with sources
- Modify: `src/components/topic-card.tsx` — show cluster info
- Modify: `src/app/articles/page.tsx` — show full digest view
- Modify: `src/app/page.tsx` — dashboard stats

- [ ] **Step 1: Topics API returns clusters**

Each candidate now includes:
- Cluster label, cluster size (number of stories)
- All source titles + URLs
- Auto-selected type (deep_dive / brief / not selected)
- User can override auto-selection if needed

- [ ] **Step 2: TopicCard shows cluster info**

When a cluster has multiple stories:
- Main title = cluster label
- Badge: "2 篇来源" / "3 篇来源"
- Expandable list of all source titles with links
- Combined stats (highest score, sum of comments)
- Auto-selection badge (already marked as 深度/快讯)

- [ ] **Step 3: Articles page shows digest**

Add a "查看今日日报" button that opens the full assembled digest (3 deep + N briefs) in preview mode.

- [ ] **Step 4: Dashboard updates**

Show: today's aggregation status, cluster count, auto-selected articles, digest generation status.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: UI updates for cluster-based topics and daily digest"
```

---

## Task 7: Cleanup Old Code

**Files:**
- Remove: `src/lib/hn/official-api.ts` (no longer used for ranking)
- Simplify: `src/lib/hn/topic-filter.ts` (remove TIER1_KEYWORDS, keep AI classification)
- Remove: old tests that reference removed functions

Actually — keep `official-api.ts` as a fallback. Only remove the import from sampler.

- [ ] **Step 1: Clean up imports and dead code**
- [ ] **Step 2: Update tests**
- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "chore: clean up old keyword search and sampling code"
```

---

## Summary

| Task | What | Impact |
|------|------|--------|
| 1 | Rewrite data collection | 15 API calls → 1 call, full coverage |
| 2 | Database schema | New topic_clusters table |
| 3 | Aggregation pipeline | Filter → Cluster → Score → Auto-select |
| 4 | Multi-source generation | Articles reference all stories in cluster |
| 5 | Auto digest API | One cron trigger generates full daily digest |
| 6 | UI updates | Show clusters, sources, digest preview |
| 7 | Cleanup | Remove dead code |

**Total: 7 tasks. The daily workflow becomes:**

```
Every 4 hours (auto):  /api/cron/sample      → collect 24h full-volume data
20:00 daily (auto):    /api/cron/aggregate    → filter + cluster + score + auto-select + generate 3 deep + N briefs + assemble digest
20:15 (you):           Open Web → review digest → edit if needed → export to WeChat
```
