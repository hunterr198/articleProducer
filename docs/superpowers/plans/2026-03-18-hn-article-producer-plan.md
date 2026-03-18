# HN Article Producer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a semi-automated system that tracks HN hot topics via multi-sample weighted scoring and generates Chinese tech articles for WeChat publishing.

**Architecture:** Next.js 15 full-stack app with SQLite/Drizzle for persistence, dual HN API strategy (Official + Algolia), GPT for analysis, Qwen for Chinese writing, shadcn/ui admin dashboard.

**Tech Stack:** Next.js 15, TypeScript, Drizzle ORM, SQLite, shadcn/ui, Tailwind CSS, OpenAI SDK, Alibaba DashScope SDK, cheerio, puppeteer

**Spec:** `docs/superpowers/specs/2026-03-18-hn-article-producer-design.md`

---

## Phase 1: Foundation (Project Setup + Data Collection)

Deliverable: A running Next.js app that can sample HN data and store snapshots in SQLite.

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `.env.local.example`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/lib/utils.ts`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd /Users/songping/AI/project/articleProducer
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

- [ ] **Step 2: Install core dependencies**

```bash
pnpm add drizzle-orm better-sqlite3 dotenv swr
pnpm add -D drizzle-kit @types/better-sqlite3
```

- [ ] **Step 3: Install shadcn/ui**

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add button card badge input textarea table tabs separator scroll-area progress dialog dropdown-menu toast
```

- [ ] **Step 4: Create .env.local.example**

```bash
# .env.local.example
OPENAI_API_KEY=sk-xxx
DASHSCOPE_API_KEY=sk-xxx
GOOGLE_CUSTOM_SEARCH_API_KEY=xxx
GOOGLE_CUSTOM_SEARCH_CX=xxx
```

- [ ] **Step 5: Verify dev server starts**

Run: `pnpm dev`
Expected: Next.js dev server at http://localhost:3000

- [ ] **Step 6: Commit**

```bash
git init
printf "node_modules\n.next\n.env.local\n.env\ndata/\n*.db\n.DS_Store\n" > .gitignore
git add -A
git commit -m "feat: scaffold Next.js project with shadcn/ui and Drizzle"
```

---

### Task 2: Database Schema

**Files:**
- Create: `src/lib/db/schema.ts`
- Create: `src/lib/db/index.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Create Drizzle config**

Create `drizzle.config.ts`:
```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: "./data/articleproducer.db",
  },
});
```

- [ ] **Step 2: Define database schema**

Create `src/lib/db/schema.ts`:
```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const stories = sqliteTable("stories", {
  id: integer("id").primaryKey(), // HN original ID
  title: text("title").notNull(),
  url: text("url"),
  author: text("author"),
  storyType: text("story_type").$type<"story" | "ask_hn" | "show_hn" | "poll">().default("story"),
  score: integer("score"),
  commentsCount: integer("comments_count"),
  storyText: text("story_text"),
  hnCreatedAt: integer("hn_created_at", { mode: "timestamp" }),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const snapshots = sqliteTable("snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storyId: integer("story_id").notNull().references(() => stories.id),
  sampledAt: integer("sampled_at", { mode: "timestamp" }).notNull(),
  rank: integer("rank").notNull(),
  score: integer("score").notNull(),
  commentsCount: integer("comments_count").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const dailyScores = sqliteTable("daily_scores", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storyId: integer("story_id").notNull().references(() => stories.id),
  date: text("date").notNull(), // YYYY-MM-DD
  appearanceCount: integer("appearance_count").notNull(),
  discussionScore: real("discussion_score"),
  trendScore: real("trend_score"),
  writabilityScore: real("writability_score"),
  freshnessScore: real("freshness_score"),
  finalScore: real("final_score"),
  aiAnalysis: text("ai_analysis"), // JSON
  status: text("status").$type<"candidate" | "selected_deep" | "selected_brief" | "skipped">().default("candidate"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storyId: integer("story_id").references(() => stories.id),
  dailyScoreId: integer("daily_score_id").references(() => dailyScores.id),
  type: text("type").$type<"deep_dive" | "brief">().notNull(),
  title: text("title"),
  contentMd: text("content_md"),
  contentReviewed: text("content_reviewed"),
  contentEdited: text("content_edited"),
  outline: text("outline"), // JSON
  status: text("status").$type<"generating" | "draft" | "reviewed" | "edited" | "published" | "failed">().default("generating"),
  reviewLog: text("review_log"), // JSON
  publishedAt: integer("published_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const research = sqliteTable("research", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  storyId: integer("story_id").notNull().references(() => stories.id),
  originalContent: text("original_content"),
  hnComments: text("hn_comments"), // JSON
  webSearch: text("web_search"), // JSON
  aiSummary: text("ai_summary"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const systemLogs = sqliteTable("system_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  level: text("level").$type<"info" | "warn" | "error">().notNull(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  details: text("details"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Indexes
import { index } from "drizzle-orm/sqlite-core";

export const snapshotsStoryIdx = index("idx_snapshots_story_sampled").on(
  snapshots.storyId, snapshots.sampledAt
);
export const snapshotsSampledIdx = index("idx_snapshots_sampled").on(
  snapshots.sampledAt
);
export const dailyScoresDateIdx = index("idx_daily_scores_date_status").on(
  dailyScores.date, dailyScores.status
);
export const dailyScoresStoryIdx = index("idx_daily_scores_story_date").on(
  dailyScores.storyId, dailyScores.date
);
export const articlesStatusIdx = index("idx_articles_status").on(
  articles.status
);
```

> **Note:** Drizzle ORM indexes are declared separately from table definitions. The `index()` function is imported from `drizzle-orm/sqlite-core`. The indexes will be applied when running `drizzle-kit push`.

- [ ] **Step 3: Create database connection module**

Create `src/lib/db/index.ts`:
```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { join } from "path";
import { mkdirSync } from "fs";

const dbPath = join(process.cwd(), "data", "articleproducer.db");
mkdirSync(join(process.cwd(), "data"), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
```

- [ ] **Step 4: Generate and run migration**

```bash
mkdir -p data
pnpm drizzle-kit generate
pnpm drizzle-kit push
```

- [ ] **Step 5: Verify database created**

```bash
ls -la data/articleproducer.db
```
Expected: Database file exists

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add database schema with Drizzle ORM"
```

---

### Task 3: HN API Clients

**Files:**
- Create: `src/lib/hn/official-api.ts`
- Create: `src/lib/hn/algolia-api.ts`
- Create: `src/lib/hn/types.ts`
- Test: `src/lib/hn/__tests__/official-api.test.ts`
- Test: `src/lib/hn/__tests__/algolia-api.test.ts`

- [ ] **Step 1: Install test dependencies**

```bash
pnpm add -D vitest @vitest/coverage-v8
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Define shared types**

Create `src/lib/hn/types.ts`:
```typescript
export interface HNStory {
  id: number;
  title: string;
  url?: string;
  author: string;
  score: number;
  commentsCount: number;
  storyText?: string;
  storyType: "story" | "ask_hn" | "show_hn" | "poll";
  createdAt: Date;
}

export interface HNComment {
  id: number;
  author: string;
  text: string;
  points: number | null;
  createdAt: Date;
  children: HNComment[];
}

export interface SampleResult {
  stories: HNStory[];
  rankings: Map<number, number>; // storyId -> rank
  sampledAt: Date;
}
```

- [ ] **Step 3: Write test for Official API client**

Create `src/lib/hn/__tests__/official-api.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fetchTopStoryIds, fetchStoryById } from "../official-api";

describe("HN Official API", () => {
  it("fetches top story IDs", async () => {
    const ids = await fetchTopStoryIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.length).toBeLessThanOrEqual(500);
    expect(typeof ids[0]).toBe("number");
  }, 10000);

  it("fetches a story by ID", async () => {
    const ids = await fetchTopStoryIds();
    const story = await fetchStoryById(ids[0]);
    expect(story).toBeDefined();
    expect(story!.title).toBeTruthy();
    expect(typeof story!.score).toBe("number");
  }, 10000);
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm test src/lib/hn/__tests__/official-api.test.ts`
Expected: FAIL — module not found

- [ ] **Step 5: Implement Official API client**

Create `src/lib/hn/official-api.ts`:
```typescript
import type { HNStory } from "./types";

const BASE_URL = "https://hacker-news.firebaseio.com/v0";

export async function fetchTopStoryIds(): Promise<number[]> {
  const res = await fetch(`${BASE_URL}/topstories.json`);
  if (!res.ok) throw new Error(`HN API error: ${res.status}`);
  return res.json();
}

interface HNItem {
  id: number;
  type: string;
  by?: string;
  time?: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  text?: string;
  kids?: number[];
  dead?: boolean;
  deleted?: boolean;
}

export async function fetchStoryById(id: number): Promise<HNStory | null> {
  const res = await fetch(`${BASE_URL}/item/${id}.json`);
  if (!res.ok) return null;
  const item: HNItem = await res.json();
  if (!item || item.dead || item.deleted) return null;

  return {
    id: item.id,
    title: item.title ?? "",
    url: item.url,
    author: item.by ?? "unknown",
    score: item.score ?? 0,
    commentsCount: item.descendants ?? 0,
    storyText: item.text,
    storyType: detectStoryType(item),
    createdAt: new Date((item.time ?? 0) * 1000),
  };
}

function detectStoryType(item: HNItem): HNStory["storyType"] {
  const title = item.title ?? "";
  if (title.startsWith("Ask HN:")) return "ask_hn";
  if (title.startsWith("Show HN:")) return "show_hn";
  if (item.type === "poll") return "poll";
  return "story";
}

export async function fetchStoriesByIds(
  ids: number[],
  concurrency = 10
): Promise<(HNStory | null)[]> {
  const results: (HNStory | null)[] = [];
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fetchStoryById));
    results.push(...batchResults);
  }
  return results;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm test src/lib/hn/__tests__/official-api.test.ts`
Expected: PASS

- [ ] **Step 7: Write test for Algolia API client**

Create `src/lib/hn/__tests__/algolia-api.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { fetchFrontPageStories, fetchStoryWithComments } from "../algolia-api";

describe("Algolia HN API", () => {
  it("fetches front page stories", async () => {
    const stories = await fetchFrontPageStories();
    expect(stories.length).toBeGreaterThan(0);
    expect(stories[0].title).toBeTruthy();
    expect(typeof stories[0].score).toBe("number");
  }, 15000);

  it("fetches story with comments", async () => {
    const stories = await fetchFrontPageStories();
    const result = await fetchStoryWithComments(stories[0].id);
    expect(result).toBeDefined();
    expect(result!.comments.length).toBeGreaterThanOrEqual(0);
  }, 15000);
});
```

- [ ] **Step 8: Implement Algolia API client**

Create `src/lib/hn/algolia-api.ts`:
```typescript
import type { HNStory, HNComment } from "./types";

const BASE_URL = "https://hn.algolia.com/api/v1";

interface AlgoliaHit {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  points: number;
  num_comments: number;
  story_text: string | null;
  created_at_i: number;
  _tags: string[];
}

export async function fetchFrontPageStories(): Promise<HNStory[]> {
  const res = await fetch(
    `${BASE_URL}/search?tags=front_page&hitsPerPage=30`
  );
  if (!res.ok) throw new Error(`Algolia API error: ${res.status}`);
  const data = await res.json();

  return data.hits.map((hit: AlgoliaHit) => ({
    id: parseInt(hit.objectID),
    title: hit.title,
    url: hit.url ?? undefined,
    author: hit.author,
    score: hit.points,
    commentsCount: hit.num_comments,
    storyText: hit.story_text ?? undefined,
    storyType: detectType(hit),
    createdAt: new Date(hit.created_at_i * 1000),
  }));
}

interface AlgoliaItem {
  id: number;
  author: string | null;
  text: string | null;
  points: number | null;
  created_at_i: number;
  children: AlgoliaItem[];
}

export async function fetchStoryWithComments(
  storyId: number
): Promise<{ story: HNStory; comments: HNComment[] } | null> {
  const res = await fetch(`${BASE_URL}/items/${storyId}`);
  if (!res.ok) return null;
  const data: AlgoliaItem & { title?: string; url?: string } = await res.json();

  const comments = flattenComments(data.children ?? []);
  return {
    story: {
      id: data.id,
      title: (data as any).title ?? "",
      url: (data as any).url ?? undefined,
      author: data.author ?? "unknown",
      score: data.points ?? 0,
      commentsCount: comments.length,
      storyType: "story",
      createdAt: new Date(data.created_at_i * 1000),
    },
    comments: comments
      .filter((c) => c.text && c.text.length > 20) // filter out one-liners
      .slice(0, 20), // top 20
  };
}

function flattenComments(items: AlgoliaItem[]): HNComment[] {
  const result: HNComment[] = [];
  for (const item of items) {
    if (item.text && item.author) {
      result.push({
        id: item.id,
        author: item.author,
        text: item.text,
        points: item.points,
        createdAt: new Date(item.created_at_i * 1000),
        children: [],
      });
    }
    if (item.children) {
      result.push(...flattenComments(item.children));
    }
  }
  return result;
}

function detectType(hit: AlgoliaHit): HNStory["storyType"] {
  if (hit._tags.includes("ask_hn")) return "ask_hn";
  if (hit._tags.includes("show_hn")) return "show_hn";
  if (hit._tags.includes("poll")) return "poll";
  return "story";
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm test src/lib/hn/__tests__/algolia-api.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add HN Official + Algolia API clients with tests"
```

---

### Task 4: Sampling Service + API Route

**Files:**
- Create: `src/lib/hn/sampler.ts`
- Create: `src/app/api/cron/sample/route.ts`
- Test: `src/lib/hn/__tests__/sampler.test.ts`

- [ ] **Step 1: Write test for sampler**

Create `src/lib/hn/__tests__/sampler.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { runSample } from "../sampler";
import { db } from "@/lib/db";
import { stories, snapshots } from "@/lib/db/schema";
import { count } from "drizzle-orm";

describe("Sampler", () => {
  beforeEach(async () => {
    // Clean test data
    await db.delete(snapshots);
    await db.delete(stories);
  });

  it("samples HN data and stores in database", async () => {
    const result = await runSample();

    expect(result.storiesCount).toBeGreaterThan(0);
    expect(result.newStories).toBeGreaterThanOrEqual(0);

    const [storyCount] = await db.select({ value: count() }).from(stories);
    expect(storyCount.value).toBeGreaterThan(0);

    const [snapshotCount] = await db.select({ value: count() }).from(snapshots);
    expect(snapshotCount.value).toBeGreaterThan(0);
  }, 30000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/hn/__tests__/sampler.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement sampler service**

Create `src/lib/hn/sampler.ts`:
```typescript
import { db } from "@/lib/db";
import { stories, snapshots, systemLogs } from "@/lib/db/schema";
import { fetchTopStoryIds } from "./official-api";
import { fetchFrontPageStories } from "./algolia-api";
import type { HNStory } from "./types";
import { eq, and, gte } from "drizzle-orm";

const DEDUP_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours
const TOP_N = 30; // Only track top 30

interface SampleResult {
  storiesCount: number;
  newStories: number;
  sampledAt: Date;
}

export async function runSample(): Promise<SampleResult> {
  const now = new Date();

  // Deduplication: skip if sampled within 2 hours
  const recentSnapshot = await db.query.snapshots.findFirst({
    where: gte(snapshots.sampledAt, new Date(now.getTime() - DEDUP_WINDOW_MS)),
    orderBy: (s, { desc }) => [desc(s.sampledAt)],
  });
  if (recentSnapshot) {
    await log("info", "sampler", "Skipped: recent sample exists", {
      lastSample: recentSnapshot.sampledAt,
    });
    return { storiesCount: 0, newStories: 0, sampledAt: now };
  }

  // Fetch data from both APIs with fallback
  let storyList: HNStory[] = [];
  let rankings = new Map<number, number>();

  try {
    // Official API for rankings
    const topIds = await fetchTopStoryIds();
    topIds.slice(0, TOP_N).forEach((id, i) => rankings.set(id, i + 1));

    // Algolia for details
    const algoliaStories = await fetchFrontPageStories();
    storyList = algoliaStories;

    // Merge: ensure all top-ranked stories are included
    const algoliaIds = new Set(algoliaStories.map((s) => s.id));
    for (const id of topIds.slice(0, TOP_N)) {
      if (!algoliaIds.has(id)) {
        // Story in official ranking but not in Algolia — skip detail for now
      }
    }
  } catch (err) {
    await log("error", "sampler", "API fetch failed", { error: String(err) });
    throw err;
  }

  // Filter out job posts and polls (not article-worthy per spec)
  storyList = storyList.filter(
    (s) => s.storyType !== "poll" && s.storyType !== ("job" as any) && s.title !== ""
  );

  // Upsert stories and create snapshots
  let newCount = 0;
  for (const story of storyList.slice(0, TOP_N)) {
    const existing = await db.query.stories.findFirst({
      where: eq(stories.id, story.id),
    });

    if (existing) {
      await db
        .update(stories)
        .set({
          score: story.score,
          commentsCount: story.commentsCount,
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(stories.id, story.id));
    } else {
      await db.insert(stories).values({
        id: story.id,
        title: story.title,
        url: story.url,
        author: story.author,
        storyType: story.storyType,
        score: story.score,
        commentsCount: story.commentsCount,
        storyText: story.storyText,
        hnCreatedAt: story.createdAt,
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      });
      newCount++;
    }

    await db.insert(snapshots).values({
      storyId: story.id,
      sampledAt: now,
      rank: rankings.get(story.id) ?? 99,
      score: story.score,
      commentsCount: story.commentsCount,
      createdAt: now,
    });
  }

  await log("info", "sampler", `Sample complete: ${storyList.length} stories, ${newCount} new`);

  return {
    storiesCount: storyList.length,
    newStories: newCount,
    sampledAt: now,
  };
}

async function log(level: "info" | "warn" | "error", source: string, message: string, details?: any) {
  await db.insert(systemLogs).values({
    level,
    source,
    message,
    details: details ? JSON.stringify(details) : null,
    createdAt: new Date(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/hn/__tests__/sampler.test.ts`
Expected: PASS

- [ ] **Step 5: Create API route for cron trigger**

Create `src/app/api/cron/sample/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { runSample } from "@/lib/hn/sampler";

export async function GET() {
  try {
    const result = await runSample();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 6: Manual test via curl**

Run: `curl http://localhost:3000/api/cron/sample`
Expected: `{"success":true,"storiesCount":30,...}`

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add HN sampling service with API route and deduplication"
```

---

## Phase 2: Scoring Algorithm + Topic Selection UI

Deliverable: Weighted scoring runs daily, candidates visible in a Web UI where user can select topics.

---

### Task 5: Weighted Scoring Algorithm

**Files:**
- Create: `src/lib/scoring/scorer.ts`
- Create: `src/lib/scoring/normalize.ts`
- Create: `src/app/api/cron/score/route.ts`
- Test: `src/lib/scoring/__tests__/scorer.test.ts`
- Test: `src/lib/scoring/__tests__/normalize.test.ts`

- [ ] **Step 1: Write test for normalization**

Create `src/lib/scoring/__tests__/normalize.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { logNormalize } from "../normalize";

describe("logNormalize", () => {
  it("returns 0 for value 0", () => {
    expect(logNormalize(0, 1000)).toBe(0);
  });

  it("returns 100 for max value", () => {
    expect(logNormalize(1000, 1000)).toBe(100);
  });

  it("returns ~50 for sqrt of max (log scale)", () => {
    const result = logNormalize(31, 1000);
    // log(32)/log(1001) ≈ 0.502
    expect(result).toBeGreaterThan(45);
    expect(result).toBeLessThan(55);
  });

  it("handles max=0 gracefully", () => {
    expect(logNormalize(0, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Implement normalization**

Create `src/lib/scoring/normalize.ts`:
```typescript
export function logNormalize(value: number, maxValue: number): number {
  if (maxValue <= 0) return 0;
  if (value <= 0) return 0;
  return (Math.log(1 + value) / Math.log(1 + maxValue)) * 100;
}
```

- [ ] **Step 3: Run normalization test**

Run: `pnpm test src/lib/scoring/__tests__/normalize.test.ts`
Expected: PASS

- [ ] **Step 4: Write test for scoring algorithm**

Create `src/lib/scoring/__tests__/scorer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import {
  computeSustainedPresence,
  computeDiscussionDepth,
  computeGrowthTrend,
  computeFinalScore,
} from "../scorer";

describe("Scoring Algorithm", () => {
  it("sustained presence: 8/8 appearances = 100", () => {
    expect(computeSustainedPresence(8, 8)).toBe(100);
  });

  it("sustained presence: 4/8 = 50", () => {
    expect(computeSustainedPresence(4, 8)).toBe(50);
  });

  it("discussion depth: high comments + high ratio scores high", () => {
    const score = computeDiscussionDepth(
      { commentsCount: 500, score: 200 },
      { maxComments: 500, maxRatio: 5 }
    );
    expect(score).toBeGreaterThan(80);
  });

  it("growth trend: large score increase scores high", () => {
    const score = computeGrowthTrend(
      { firstScore: 10, latestScore: 500, commentGrowthRate: 50 },
      { maxScoreGrowth: 500, maxCommentGrowth: 50 }
    );
    expect(score).toBe(100);
  });

  it("final score: weighted combination", () => {
    const score = computeFinalScore({
      sustainedPresence: 100,
      discussionDepth: 80,
      growthTrend: 60,
      writability: 90,
      freshness: 70,
    });
    // 100*0.25 + 80*0.25 + 60*0.20 + 90*0.20 + 70*0.10 = 82
    expect(score).toBe(82);
  });
});
```

- [ ] **Step 5: Implement scoring algorithm**

Create `src/lib/scoring/scorer.ts`:
```typescript
import { logNormalize } from "./normalize";
import { db } from "@/lib/db";
import { snapshots, dailyScores, stories } from "@/lib/db/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";

export function computeSustainedPresence(
  appearances: number,
  totalSamples: number
): number {
  if (totalSamples === 0) return 0;
  return (appearances / totalSamples) * 100;
}

export function computeDiscussionDepth(
  story: { commentsCount: number; score: number },
  maxes: { maxComments: number; maxRatio: number }
): number {
  const commentsNorm = logNormalize(story.commentsCount, maxes.maxComments);
  const ratio = story.score > 0 ? story.commentsCount / story.score : 0;
  const ratioNorm = logNormalize(ratio, maxes.maxRatio);
  return commentsNorm * 0.5 + ratioNorm * 0.5;
}

export function computeGrowthTrend(
  data: { firstScore: number; latestScore: number; commentGrowthRate: number },
  maxes: { maxScoreGrowth: number; maxCommentGrowth: number }
): number {
  const scoreGrowth = Math.max(0, data.latestScore - data.firstScore);
  const scoreNorm = logNormalize(scoreGrowth, maxes.maxScoreGrowth);
  const commentNorm = logNormalize(data.commentGrowthRate, maxes.maxCommentGrowth);
  return scoreNorm * 0.5 + commentNorm * 0.5;
}

export function computeFinalScore(dimensions: {
  sustainedPresence: number;
  discussionDepth: number;
  growthTrend: number;
  writability: number;
  freshness: number;
}): number {
  return Math.round(
    dimensions.sustainedPresence * 0.25 +
    dimensions.discussionDepth * 0.25 +
    dimensions.growthTrend * 0.20 +
    dimensions.writability * 0.20 +
    dimensions.freshness * 0.10
  );
}

export async function runDailyScoring(dateStr: string): Promise<{
  candidatesCount: number;
}> {
  const dayStart = new Date(`${dateStr}T00:00:00+08:00`);
  const dayEnd = new Date(`${dateStr}T23:59:59+08:00`);

  // Get all snapshots for today
  const todaySnapshots = await db
    .select()
    .from(snapshots)
    .where(and(gte(snapshots.sampledAt, dayStart), lt(snapshots.sampledAt, dayEnd)));

  if (todaySnapshots.length === 0) return { candidatesCount: 0 };

  // Count total unique sample times
  const sampleTimes = new Set(
    todaySnapshots.map((s) => s.sampledAt.toISOString())
  );
  const totalSamples = sampleTimes.size;
  if (totalSamples < 4) return { candidatesCount: 0 }; // Not enough data

  // Group snapshots by story
  const storyMap = new Map<number, typeof todaySnapshots>();
  for (const snap of todaySnapshots) {
    const existing = storyMap.get(snap.storyId) ?? [];
    existing.push(snap);
    storyMap.set(snap.storyId, existing);
  }

  // Compute per-story metrics
  const metrics: Array<{
    storyId: number;
    appearances: number;
    commentsCount: number;
    score: number;
    firstScore: number;
    latestScore: number;
    commentGrowth: number;
  }> = [];

  for (const [storyId, snaps] of storyMap) {
    const sorted = snaps.sort((a, b) => a.sampledAt.getTime() - b.sampledAt.getTime());
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];

    metrics.push({
      storyId,
      appearances: snaps.length,
      commentsCount: latest.commentsCount,
      score: latest.score,
      firstScore: first.score,
      latestScore: latest.score,
      commentGrowth: latest.commentsCount - first.commentsCount,
    });
  }

  // Compute maxes for normalization
  const maxComments = Math.max(...metrics.map((m) => m.commentsCount));
  const maxRatio = Math.max(
    ...metrics.map((m) => (m.score > 0 ? m.commentsCount / m.score : 0))
  );
  const maxScoreGrowth = Math.max(
    ...metrics.map((m) => Math.max(0, m.latestScore - m.firstScore))
  );
  const maxCommentGrowth = Math.max(...metrics.map((m) => m.commentGrowth));

  // Score each story (dimensions 1-3 only, writability + freshness added later)
  const scored = metrics.map((m) => ({
    storyId: m.storyId,
    appearances: m.appearances,
    sustainedPresence: computeSustainedPresence(m.appearances, totalSamples),
    discussionDepth: computeDiscussionDepth(
      { commentsCount: m.commentsCount, score: m.score },
      { maxComments, maxRatio }
    ),
    growthTrend: computeGrowthTrend(
      {
        firstScore: m.firstScore,
        latestScore: m.latestScore,
        commentGrowthRate: m.commentGrowth,
      },
      { maxScoreGrowth, maxCommentGrowth }
    ),
  }));

  // Sort by preliminary score (dim 1-3 only), take top 30 for AI evaluation
  const preliminary = scored
    .map((s) => ({
      ...s,
      prelimScore: s.sustainedPresence * 0.25 + s.discussionDepth * 0.25 + s.growthTrend * 0.20,
    }))
    .sort((a, b) => b.prelimScore - a.prelimScore)
    .slice(0, 30);

  // Apply cooling mechanism: penalize stories selected in previous days
  const recentSelections = await db
    .select({ storyId: dailyScores.storyId, date: dailyScores.date })
    .from(dailyScores)
    .where(
      and(
        sql`${dailyScores.status} IN ('selected_deep', 'selected_brief')`,
        gte(dailyScores.date, getDateNDaysAgo(dateStr, 3))
      )
    );

  const selectionDaysAgo = new Map<number, number>();
  for (const sel of recentSelections) {
    const daysAgo = daysBetween(sel.date, dateStr);
    const existing = selectionDaysAgo.get(sel.storyId);
    if (existing === undefined || daysAgo < existing) {
      selectionDaysAgo.set(sel.storyId, daysAgo);
    }
  }

  // Insert daily scores
  for (const item of preliminary) {
    const decayFactor = getCoolingDecay(selectionDaysAgo.get(item.storyId));
    const finalScore = computeFinalScore({
      sustainedPresence: item.sustainedPresence,
      discussionDepth: item.discussionDepth,
      growthTrend: item.growthTrend,
      writability: 50,
      freshness: 50,
    }) * decayFactor;

    await db.insert(dailyScores).values({
      storyId: item.storyId,
      date: dateStr,
      appearanceCount: item.appearances,
      discussionScore: item.discussionDepth,
      trendScore: item.growthTrend,
      writabilityScore: 50,
      freshnessScore: 50,
      finalScore: Math.round(finalScore),
      status: "candidate",
      createdAt: new Date(),
    });
  }

  return { candidatesCount: preliminary.length };
}

// Cooling decay: penalize recently selected stories
export function getCoolingDecay(daysAgo: number | undefined): number {
  if (daysAgo === undefined) return 1.0; // never selected
  if (daysAgo <= 1) return 0.3;
  if (daysAgo <= 2) return 0.6;
  return 1.0;
}

function getDateNDaysAgo(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}
```

- [ ] **Step 6: Run scoring tests**

Run: `pnpm test src/lib/scoring/`
Expected: All PASS

- [ ] **Step 7: Create scoring API route**

Create `src/app/api/cron/score/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { runDailyScoring } from "@/lib/scoring/scorer";

export async function GET() {
  try {
    // Use Beijing time for date
    const dateStr = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
    }).format(new Date()); // sv-SE locale gives YYYY-MM-DD format

    const result = await runDailyScoring(dateStr);
    return NextResponse.json({ success: true, date: dateStr, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add 5-dimension weighted scoring algorithm with daily scoring"
```

---

### Task 6: Dashboard Page

**Files:**
- Create: `src/app/page.tsx` (replace default)
- Create: `src/app/layout.tsx` (update with nav)
- Create: `src/components/nav.tsx`
- Create: `src/app/api/dashboard/route.ts`

- [ ] **Step 1: Create navigation component**

Create `src/components/nav.tsx`:
```typescript
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/topics", label: "Topic Selection" },
  { href: "/articles", label: "Articles" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 flex items-center h-14 gap-6">
        <span className="font-semibold text-lg">ArticleProducer</span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "text-sm transition-colors hover:text-foreground",
              pathname === link.href
                ? "text-foreground font-medium"
                : "text-muted-foreground"
            )}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Create dashboard API route**

Create `src/app/api/dashboard/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { snapshots, dailyScores, articles, systemLogs } from "@/lib/db/schema";
import { desc, eq, sql, gte, count } from "drizzle-orm";

export async function GET() {
  const now = new Date();
  const todayStart = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const dateStr = todayStart.toISOString().split("T")[0];

  // Sample count today
  const sampleTimes = await db
    .selectDistinct({ sampledAt: snapshots.sampledAt })
    .from(snapshots)
    .where(gte(snapshots.sampledAt, new Date(`${dateStr}T00:00:00+08:00`)));

  // Candidate count
  const [candidates] = await db
    .select({ value: count() })
    .from(dailyScores)
    .where(eq(dailyScores.date, dateStr));

  // Article count today
  const [articleCount] = await db
    .select({ value: count() })
    .from(articles)
    .where(gte(articles.createdAt, new Date(`${dateStr}T00:00:00+08:00`)));

  // Recent logs
  const recentLogs = await db
    .select()
    .from(systemLogs)
    .orderBy(desc(systemLogs.createdAt))
    .limit(10);

  // Last sample time
  const lastSnapshot = await db
    .select({ sampledAt: snapshots.sampledAt })
    .from(snapshots)
    .orderBy(desc(snapshots.sampledAt))
    .limit(1);

  return NextResponse.json({
    samplesCollected: sampleTimes.length,
    samplesTotal: 8,
    candidatesCount: candidates.value,
    articlesCount: articleCount.value,
    lastSampleAt: lastSnapshot[0]?.sampledAt ?? null,
    recentLogs: recentLogs.map((l) => ({
      level: l.level,
      source: l.source,
      message: l.message,
      createdAt: l.createdAt,
    })),
  });
}
```

- [ ] **Step 3: Create SWR provider**

Create `src/components/swr-provider.tsx`:
```typescript
"use client";
import { SWRConfig } from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, refreshInterval: 30000 }}>
      {children}
    </SWRConfig>
  );
}
```

Wrap `{children}` in `src/app/layout.tsx` with `<SWRProvider>`.

- [ ] **Step 4: Create dashboard page**

Replace `src/app/page.tsx`:
```typescript
"use client";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data, error } = useSWR("/api/dashboard");

  if (!data) return <div className="p-8">Loading...</div>;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today's Samples</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{data.samplesCollected}/{data.samplesTotal}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Candidates</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{data.candidatesCount}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Articles</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{data.articlesCount}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Logs</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.recentLogs.map((log: any, i: number) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <Badge variant={log.level === "error" ? "destructive" : "secondary"}>
                  {log.level}
                </Badge>
                <span className="text-muted-foreground">{new Date(log.createdAt).toLocaleString("zh-CN")}</span>
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Update layout with navigation**

Update `src/app/layout.tsx` to include the `<Nav />` component.

- [ ] **Step 5: Verify dashboard renders**

Run: `pnpm dev`, open http://localhost:3000
Expected: Dashboard with stats cards and log table

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add dashboard page with stats and sample logs"
```

---

### Task 7: Topic Selection Page

**Files:**
- Create: `src/app/topics/page.tsx`
- Create: `src/components/topic-card.tsx`
- Create: `src/app/api/topics/route.ts`
- Create: `src/app/api/topics/[id]/select/route.ts`

- [ ] **Step 1: Create topics API route**

Create `src/app/api/topics/route.ts` — returns today's daily_scores joined with stories, sorted by final_score desc.

- [ ] **Step 2: Create topic selection API**

Create `src/app/api/topics/[id]/select/route.ts` — PATCH endpoint that updates `daily_scores.status` to `selected_deep` | `selected_brief` | `skipped`.

- [ ] **Step 3: Create TopicCard component**

Create `src/components/topic-card.tsx` — displays story title, HN stats (score, comments, appearances), 5-dimension score bars (using shadcn Progress), AI recommendation reason, and action buttons (Deep Dive / Brief / Skip).

- [ ] **Step 4: Create topics page**

Create `src/app/topics/page.tsx` — fetches candidates, renders TopicCard list, has a "Generate Articles" button that triggers article generation for all selected topics.

- [ ] **Step 5: Verify topic selection flow**

1. Run sample: `curl http://localhost:3000/api/cron/sample`
2. Run scoring: `curl http://localhost:3000/api/cron/score`
3. Open http://localhost:3000/topics
4. Verify candidates display with scores
5. Select a topic as "Deep Dive"

Expected: Topic cards render, selection updates status

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add topic selection page with scoring display"
```

---

## Phase 3: AI Pipeline (Research + Generation + Review)

Deliverable: User can select topics and trigger article generation, producing reviewed Markdown articles.

---

### Task 8: AI Client Modules (GPT + Qwen)

**Files:**
- Create: `src/lib/ai/gpt.ts`
- Create: `src/lib/ai/qwen.ts`
- Create: `src/lib/ai/types.ts`
- Create: `src/lib/ai/prompts.ts`
- Create: `src/lib/ai/retry.ts`

- [ ] **Step 1: Install AI SDKs**

```bash
pnpm add openai
# DashScope uses HTTP API directly — no SDK needed, use native fetch
```

- [ ] **Step 2: Create AI types**

Create `src/lib/ai/types.ts`:
```typescript
export interface MaterialPack {
  coreFacts: string;
  keyInsights: string[];
  controversy: string;
  context: string;
  suggestedAngle: string;
  discussionQuestion: string;
}

export interface ArticleOutline {
  title: string;
  hook: string;
  sections: Array<{
    heading?: string;
    keyPoints: string[];
    sourceRefs: string[];
    wordTarget: number;
  }>;
  closingQuestion: string;
}

export interface WritabilityEvaluation {
  topicCategory: string;
  coreNovelty: string;
  devilAdvocateConcerns: string[];
  recommendedAngle: string;
  discussionQuestion: string;
  scores: {
    writability: number;
    audienceFit: number;
    freshness: number;
  };
  verdict: "deep_dive" | "brief" | "skip";
  verdictReason: string;
}
```

- [ ] **Step 3: Create retry utility**

Create `src/lib/ai/retry.ts`:
```typescript
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelay = 5000
): Promise<T> {
  let lastError: Error | undefined;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err as Error;
      if (i < maxRetries) {
        await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}
```

- [ ] **Step 4: Create prompts module**

Create `src/lib/ai/prompts.ts` — all prompts in one file for easy tuning:
```typescript
// --- WRITABILITY EVALUATION (GPT, English) ---
export function writabilityPrompt(story: {
  title: string; url?: string; score: number;
  commentsCount: number; time: string; topComments: string;
}) {
  return {
    system: `You are a senior tech editor at a Chinese tech media outlet.
Your job is to evaluate whether a Hacker News story is worth writing a deep-dive article about for Chinese tech professionals.

IMPORTANT: Complete ALL analysis steps before providing scores. Be critical — most stories are NOT worth a deep dive.`,

    user: `# Story Data
Title: ${story.title}
URL: ${story.url ?? "N/A"}
Score: ${story.score}
Comments: ${story.commentsCount}
Posted: ${story.time}
Top HN Comments:
${story.topComments}

# Evaluation Process — complete ALL steps in order

## Step 1: Content Analysis
- What is the core topic? Classify: AI/ML | Security | Open Source | Industry | Dev Tools | Research | Other
- What is genuinely NEW here?

## Step 2: Discussion Quality
- What are the main viewpoints in HN comments?
- Is there genuine disagreement or just consensus?

## Step 3: Devil's Advocate
List 2-3 reasons why this story might NOT be worth covering.

## Step 4: Audience Fit
Would Chinese tech professionals (25-40, engineers/PMs/AI practitioners) care? Why?

## Step 5: Scoring (ONLY after Steps 1-4)

### writability [0-100]
0-20: Just a link, no depth | 21-40: Simple news | 41-60: Some depth
61-80: Rich topic, multiple angles | 81-100: Excellent material, strong narrative

### audience_fit [0-100]
0-20: Irrelevant | 21-40: Niche only | 41-60: Moderate
61-80: Broadly relevant | 81-100: Directly impacts readers' work

### freshness [0-100]
0-20: Already widely covered in Chinese media | 41-60: Partially covered
61-80: Barely covered, clear gap | 81-100: Completely new to Chinese audience

# Output: respond with ONLY this JSON (no markdown fences)
{
  "topic_category": "...",
  "core_novelty": "one sentence",
  "devil_advocate_concerns": ["...", "..."],
  "recommended_angle": "...",
  "discussion_question": "...",
  "scores": { "writability": N, "audience_fit": N, "freshness": N },
  "verdict": "deep_dive | brief | skip",
  "verdict_reason": "one sentence"
}`
  };
}

// --- MATERIAL ANALYSIS (GPT, English) ---
export function materialAnalysisPrompt(materials: {
  originalContent: string;
  hnComments: string;
  webSearch: string;
}) {
  return {
    system: `You are a research analyst preparing structured materials for a Chinese tech article writer.
Extract key facts, insights, and controversy from the provided sources. Be precise and cite sources.`,

    user: `# Source Materials

## Original Article
${materials.originalContent.slice(0, 8000)}

## HN Comment Highlights
${materials.hnComments.slice(0, 4000)}

## Supplementary Web Search
${materials.webSearch.slice(0, 3000)}

# Task: Create a structured material pack. Output ONLY this JSON:
{
  "core_facts": "What happened, who did it, what's the result (2-3 sentences)",
  "key_insights": [
    "Insight from original article (cite source)",
    "Unique perspective from HN comments (cite @username)",
    "Background context from search"
  ],
  "controversy": "Main disagreement in the community, or 'None' if consensus",
  "context": "Why this matters in the bigger tech picture",
  "suggested_angle": "Best angle for Chinese tech audience",
  "discussion_question": "Open question to provoke reader discussion"
}`
  };
}

// --- OUTLINE GENERATION (GPT, Chinese output) ---
export function outlinePrompt(materialPack: string) {
  return {
    system: `你是一位资深科技内容策划，正在为一个面向中国技术从业者和AI爱好者的公众号策划深度解读文章。`,

    user: `# 素材包
${materialPack}

# 任务：设计文章大纲

要求：
- 开头：用一个具体场景、数据点或反直觉的事实引入
- 中间：按逻辑递进（是什么→为什么重要→社区怎么看→对我们的影响）
- 结尾：抛出一个能引发评论区讨论的开放性问题，不要做全文总结
- 总字数目标：300-500字

输出以下 JSON（不要用 markdown 代码块包裹）：
{
  "title": "标题（不超过30字，不用感叹号，要有悬念感）",
  "hook": "开头第一句话（要让人想继续读）",
  "sections": [
    {
      "heading": "小标题（可选）",
      "key_points": ["要覆盖的信息点"],
      "source_refs": ["来自素材包的哪些信息"],
      "word_target": 100
    }
  ],
  "closing_question": "结尾的讨论问题"
}`
  };
}

// --- ARTICLE GENERATION (Qwen, Chinese) ---
export function articlePrompt(outline: string, materialPack: string) {
  return {
    system: `你是一位在AI和科技领域深耕多年的技术博主。你的风格介于"机器之心"的严谨和科技播客的亲切之间——专业但不学术，有观点但不煽情。你的读者是25-40岁的技术从业者、AI应用开发者和对科技商业感兴趣的人。`,

    user: `# 大纲
${outline}

# 素材包
${materialPack}

# 写作风格要求

## 语言
- 正文用中文，技术术语保留英文原文（如 Transformer、LLM、fine-tuning）
- 首次出现的术语格式：中文名（English Term）
- 之后直接用英文即可

## 语气和节奏
- 像一个懂技术的朋友在跟你聊今天圈子里发生了什么
- 句子长短交错——长句解释原理，短句做判断。偶尔用一个3-5字的短句制造节奏感
- 可以用反问句和设问句增加互动感
- 段落长短不一，有的段落可以只有一两句话
- 适当加入思考过程的痕迹："说实话""我觉得""有意思的是"

## 内容要求
- 引用 HN 评论区的观点时标注 "HN 网友 @username 提到"
- 如果有争议，呈现正反两方观点，然后给出你的判断
- 用具体例子和类比解释抽象概念
- 每段都要提供新信息或新视角

## 绝对禁止（违反任何一条请重写该段落）
- ❌ "首先/其次/最后/总而言之/综上所述"
- ❌ "值得注意的是/不可否认/毋庸置疑/不言而喻"
- ❌ "在当今...时代/随着...的发展"
- ❌ "扮演着重要角色/具有重要意义/应运而生/如火如荼"
- ❌ 排比句和对仗句
- ❌ 以总结性段落结尾
- ❌ 感叹号
- ❌ "重磅/炸裂/震惊/颠覆"

# 字数：300-500字，宁可精炼也不要注水。直接输出文章正文，不要加任何前缀说明。`
  };
}

// --- BRIEF GENERATION (Qwen, Chinese) ---
export function briefPrompt(title: string, score: number, comments: number, summary: string) {
  return {
    system: `你是一位科技博主，正在写科技快讯。`,
    user: `用80-120字写一条科技快讯。

素材：
标题：${title}
分数：${score} 评论：${comments}
摘要：${summary}

要求：
- 第一句：发生了什么（who did what）
- 第二句：为什么重要（so what）
- 可选第三句：一个有趣的细节或数据点
- 技术术语保留英文
- 不加任何评论和感叹词

直接输出快讯正文。`
  };
}

// --- REVIEW PASS 1: FACT CHECK (Qwen) ---
export function reviewFactCheckPrompt(article: string, materialPack: string) {
  return {
    system: `你是一位严谨的事实核查编辑。`,
    user: `请逐句检查以下文章中的事实性陈述。

对于每个事实性陈述：
1. 对照素材包验证是否准确
2. 标注确信度：高/中/低
3. 如果确信度为"中"或"低"，修改措辞使其更准确
4. 如果文章中出现了素材包里没有的信息，标记为"可能是AI幻觉"并删除

素材包：
${materialPack}

文章：
${article}

输出格式（JSON）：
{ "revised": "修改后的完整文章", "changes": ["修改1的说明", "修改2的说明"] }`
  };
}

// --- REVIEW PASS 2: DE-AI (Qwen) ---
export function reviewDeAIPrompt(article: string) {
  return {
    system: `你是一位反AI检测专家。`,
    user: `请检查以下文章，找出所有"AI味"痕迹并修改：

检查项：
1. 是否包含禁止词汇（首先/其次/值得注意的是/总而言之...）
2. 是否存在连续3个以上长度相近的句子（需改为长短交错）
3. 是否存在排比句或对仗句
4. 是否有段落听起来像教科书或新闻稿而不像朋友聊天
5. 结尾是否在做全文总结（应该是一个讨论问题）

文章：
${article}

输出格式（JSON）：
{ "revised": "修改后的完整文章", "changes": ["修改1: 原文→修改后 (原因)", ...] }`
  };
}

// --- REVIEW PASS 3: READABILITY (Qwen) ---
export function reviewReadabilityPrompt(article: string) {
  return {
    system: `你是一位公众号运营编辑。`,
    user: `请从公众号读者的角度最终优化这篇文章：

1. 开头前两句能否让人想继续读？如果不够抓人，请重写
2. 有没有可以加入互动元素的地方（反问、"你觉得呢？"）
3. 段落节奏是否舒服？有没有需要拆分的长段落？
4. 结尾的讨论问题是否足够开放、足够有讨论性？
5. 标题是否在30字以内、有悬念感、没有感叹号？

只修改需要改的部分，其余保持不变。

文章：
${article}

输出格式（JSON）：
{ "revised": "最终版本文章", "changes": ["修改说明1", ...] }`
  };
}
```

- [ ] **Step 5: Implement GPT client**

Create `src/lib/ai/gpt.ts`:
```typescript
import OpenAI from "openai";
import { withRetry } from "./retry";
import {
  writabilityPrompt,
  materialAnalysisPrompt,
  outlinePrompt,
} from "./prompts";
import type { WritabilityEvaluation, MaterialPack, ArticleOutline } from "./types";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function chatJSON<T>(system: string, user: string): Promise<T> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    response_format: { type: "json_object" },
  });
  const text = res.choices[0]?.message?.content ?? "{}";
  return JSON.parse(text) as T;
}

export async function evaluateWritability(
  story: { title: string; url?: string; score: number; commentsCount: number; time: string },
  topComments: string
): Promise<WritabilityEvaluation> {
  const prompt = writabilityPrompt({ ...story, topComments });
  return withRetry(() => chatJSON<WritabilityEvaluation>(prompt.system, prompt.user));
}

export async function analyzeMaterials(materials: {
  originalContent: string;
  hnComments: string;
  webSearch: string;
}): Promise<MaterialPack> {
  const prompt = materialAnalysisPrompt(materials);
  return withRetry(() => chatJSON<MaterialPack>(prompt.system, prompt.user));
}

export async function generateOutline(
  materialPack: string
): Promise<ArticleOutline> {
  const prompt = outlinePrompt(materialPack);
  return withRetry(() => chatJSON<ArticleOutline>(prompt.system, prompt.user));
}
```

- [ ] **Step 6: Implement Qwen client**

Create `src/lib/ai/qwen.ts`:
```typescript
import { withRetry } from "./retry";
import {
  articlePrompt,
  briefPrompt,
  reviewFactCheckPrompt,
  reviewDeAIPrompt,
  reviewReadabilityPrompt,
} from "./prompts";

const DASHSCOPE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

async function qwenChat(system: string, user: string, json = false): Promise<string> {
  const res = await fetch(DASHSCOPE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "qwen-plus",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Qwen API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices[0]?.message?.content ?? "";
}

export async function generateArticle(
  outline: string,
  materialPack: string
): Promise<string> {
  const prompt = articlePrompt(outline, materialPack);
  return withRetry(() => qwenChat(prompt.system, prompt.user));
}

export async function generateBrief(
  title: string, score: number, comments: number, summary: string
): Promise<string> {
  const prompt = briefPrompt(title, score, comments, summary);
  return withRetry(() => qwenChat(prompt.system, prompt.user));
}

export async function reviewArticle(
  article: string,
  pass: "fact_check" | "de_ai" | "readability",
  materialPack?: string
): Promise<{ revised: string; changes: string[] }> {
  let prompt: { system: string; user: string };
  switch (pass) {
    case "fact_check":
      prompt = reviewFactCheckPrompt(article, materialPack ?? "");
      break;
    case "de_ai":
      prompt = reviewDeAIPrompt(article);
      break;
    case "readability":
      prompt = reviewReadabilityPrompt(article);
      break;
  }
  const result = await withRetry(() => qwenChat(prompt.system, prompt.user, true));
  return JSON.parse(result);
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add GPT and Qwen AI clients with full prompts"
```

---

### Task 9: Research Pipeline

**Files:**
- Create: `src/lib/research/scraper.ts`
- Create: `src/lib/research/search.ts`
- Create: `src/lib/research/pipeline.ts`

- [ ] **Step 1: Install scraping dependencies**

```bash
pnpm add cheerio puppeteer
pnpm add -D @types/cheerio
```

- [ ] **Step 2: Implement web scraper**

Create `src/lib/research/scraper.ts` — exports `scrapeUrl(url)` → `string`:
- First attempt: `fetch()` + cheerio (fast, works for static pages)
- If content is too short (<200 chars), fall back to puppeteer (handles JS-rendered pages)
- Strips nav/footer/ads/scripts, extracts main content via `<article>`, `<main>`, or largest `<div>`
- Handles arXiv specially: extract abstract from `<blockquote class="abstract">`
- 10-second timeout per attempt. Returns empty string on failure.

- [ ] **Step 3: Implement search module**

Create `src/lib/research/search.ts` — exports `searchWeb(query, limit?)` → `Array<{title, snippet, url}>`. Uses Google Custom Search API. Falls back to empty results on failure.

- [ ] **Step 4: Implement research pipeline**

Create `src/lib/research/pipeline.ts` — exports `runResearch(story)`. Orchestrates parallel execution of:
- A: Scrape source URL (skip for Ask HN)
- B: Fetch HN comments via Algolia
- C: Web search for supplementary context

Stores results in `research` table. Then calls GPT `analyzeMaterials()` to generate the structured material pack.

- [ ] **Step 5: Test research pipeline manually**

Pick a story from the database, call `runResearch(story)`, verify `research` table has data.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add research pipeline with web scraping and search"
```

---

### Task 10: Article Generation + Review Pipeline

**Files:**
- Create: `src/lib/pipeline/generator.ts`
- Create: `src/lib/review/reviewer.ts`
- Create: `src/app/api/articles/generate/route.ts`

- [ ] **Step 1: Implement 3-pass reviewer**

Create `src/lib/review/reviewer.ts` — exports `reviewArticle(article, materialPack)`:
1. Pass 1: Fact-check (Qwen)
2. Pass 2: De-AI (Qwen)
3. Pass 3: Readability (Qwen) — skipped for briefs

Returns `{ reviewed: string, log: Array<{pass, changes}> }`.

- [ ] **Step 2: Implement article generator**

Create `src/lib/pipeline/generator.ts` — exports `generateArticlesForSelection(selections)`:
1. For each deep_dive selection: research → GPT analysis → GPT outline → Qwen write → 3-pass review
2. For each brief selection: GPT brief summary → Qwen write brief → Pass 2 review only
3. Assemble daily digest Markdown
4. Update `articles` table with results

Includes progress callback for real-time UI updates.

- [ ] **Step 3: Create generation API route**

Create `src/app/api/articles/generate/route.ts` — POST endpoint. Receives `{ selections: [{dailyScoreId, type}] }`. Triggers generator pipeline. Returns generated article IDs.

- [ ] **Step 4: End-to-end test**

1. Sample → Score → Select a topic → Generate
2. Verify article appears in `articles` table with `status: 'reviewed'`
3. Verify Markdown content is in Chinese with English terms

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add article generation pipeline with 3-pass review"
```

---

## Phase 4: Article Management UI

Deliverable: Full Web UI for viewing, editing, and exporting articles.

---

### Task 11: Article Management Page

**Files:**
- Create: `src/app/articles/page.tsx`
- Create: `src/app/api/articles/route.ts`
- Create: `src/components/article-list.tsx`

- [ ] **Step 1: Create articles API**

`GET /api/articles` — returns articles with status filter, joined with story data. Supports `?status=draft&date=2026-03-18`.

- [ ] **Step 2: Create article list component**

Table with columns: type badge, title, word count, status badge, created time, actions (Preview / Edit / Copy HTML).

- [ ] **Step 3: Create articles page**

Filter tabs (All / Draft / Reviewed / Published), date picker, article list.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add article management page with filtering"
```

---

### Task 12: Article Editor Page

**Files:**
- Create: `src/app/articles/[id]/page.tsx`
- Create: `src/app/api/articles/[id]/route.ts`
- Create: `src/components/markdown-editor.tsx`
- Create: `src/components/markdown-preview.tsx`
- Create: `src/components/research-panel.tsx`

- [ ] **Step 1: Install markdown rendering**

```bash
pnpm add react-markdown remark-gfm
```

- [ ] **Step 2: Create markdown editor component**

Side-by-side: left textarea for editing, right panel for rendered preview. Auto-saves to `content_edited` on change (debounced).

- [ ] **Step 3: Create research panel component**

Collapsible sections: "Original Article", "HN Comments", "Web Search Results". Shows the raw research materials for reference.

- [ ] **Step 4: Create article detail API**

`GET /api/articles/[id]` — returns article + research data.
`PATCH /api/articles/[id]` — updates `content_edited`, `status`.

- [ ] **Step 5: Create editor page**

Combines editor, preview, research panel, and action buttons (Save / Copy HTML).

- [ ] **Step 6: Verify edit flow**

Open an article → edit in left panel → see preview update → save → verify database updated.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add article editor with live preview and research panel"
```

---

## Phase 5: Publishing + Scheduling

Deliverable: Complete end-to-end system with clipboard export and launchd scheduling.

---

### Task 13: Publishing (Phase 1 — Clipboard)

**Files:**
- Create: `src/lib/publish/markdown-to-wechat.ts`
- Create: `src/app/api/articles/[id]/publish/route.ts`

- [ ] **Step 1: Implement Markdown-to-WeChat HTML converter**

Create `src/lib/publish/markdown-to-wechat.ts` — converts Markdown to WeChat-compatible inline-CSS HTML. Handles: headings, paragraphs, bold, links, code blocks, blockquotes. All styles inlined (WeChat strips `<style>` tags).

- [ ] **Step 2: Create publish API route**

`POST /api/articles/[id]/publish` — converts article Markdown to WeChat HTML, returns the HTML string. Updates `status` to `published`.

- [ ] **Step 3: Add "Copy to Clipboard" button in editor**

Calls publish API, copies returned HTML to clipboard via `navigator.clipboard.writeText()`. Shows toast confirmation.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add WeChat HTML export with clipboard copy"
```

---

### Task 14: Daily Digest Assembly

**Files:**
- Create: `src/lib/pipeline/digest.ts`
- Create: `src/app/api/articles/digest/route.ts`

- [ ] **Step 1: Implement digest assembler**

Create `src/lib/pipeline/digest.ts` — exports `assembleDailyDigest(date)`. Queries all articles for the given date, assembles into the Markdown template from the spec (3 deep dives + briefs + closing).

- [ ] **Step 2: Create digest API route**

`GET /api/articles/digest?date=2026-03-18` — returns the assembled digest Markdown and WeChat HTML.

- [ ] **Step 3: Add "View Digest" button to articles page**

Opens a modal/page showing the full assembled digest with preview.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add daily digest assembly and preview"
```

---

### Task 15: macOS launchd Scheduling

**Files:**
- Create: `scripts/setup-launchd.sh`
- Create: `scripts/com.articleproducer.sample.plist`
- Create: `scripts/com.articleproducer.score.plist`
- Create: `scripts/start.sh`

- [ ] **Step 1: Create startup script**

Create `scripts/start.sh`:
```bash
#!/bin/bash
cd "$(dirname "$0")/.."
pnpm next start -p 3000 &
echo $! > .next/server.pid
echo "ArticleProducer started on http://localhost:3000"
```

- [ ] **Step 2: Create launchd plist for sampling**

Create `scripts/com.articleproducer.sample.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.articleproducer.sample</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/curl</string>
        <string>-s</string>
        <string>http://localhost:3000/api/cron/sample</string>
    </array>
    <key>StartInterval</key>
    <integer>10800</integer>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

- [ ] **Step 3: Create launchd plist for scoring**

Create `scripts/com.articleproducer.score.plist` — triggers at 21:00 Beijing time daily using `StartCalendarInterval`.

- [ ] **Step 4: Create setup script**

Create `scripts/setup-launchd.sh` — copies plists to `~/Library/LaunchAgents/`, loads them via `launchctl`.

- [ ] **Step 5: Test scheduling**

```bash
chmod +x scripts/setup-launchd.sh
./scripts/setup-launchd.sh
launchctl list | grep articleproducer
```
Expected: Both jobs listed and active

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add macOS launchd scheduling for sampling and scoring"
```

---

## Phase 5.5: AI-Powered Scoring Enhancement

Once the basic pipeline works end-to-end, add the AI-powered dimensions.

---

### Task 16: Writability + Freshness AI Evaluation

**Files:**
- Modify: `src/lib/scoring/scorer.ts`
- Create: `src/lib/scoring/ai-evaluator.ts`

- [ ] **Step 1: Implement AI evaluator**

Create `src/lib/scoring/ai-evaluator.ts` — exports `evaluateTopCandidates(candidates)`:
1. For top 30 candidates (by preliminary score), call GPT `evaluateWritability()`
2. For same candidates, call Google Custom Search to check Chinese media coverage
3. Update `daily_scores` with writability_score, freshness_score, ai_analysis
4. Recompute final_score

- [ ] **Step 2: Integrate into scoring API route**

Update `src/app/api/cron/score/route.ts` to call `evaluateTopCandidates()` after `runDailyScoring()`.

- [ ] **Step 3: End-to-end verification**

Run full cycle: sample → score → verify AI analysis appears in topic cards.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add AI-powered writability and freshness scoring"
```

---

## Summary: Build Order

| Phase | Tasks | Deliverable |
|---|---|---|
| 1. Foundation | 1-4 | Next.js app that samples HN data into SQLite |
| 2. Scoring + UI | 5-7 | Weighted scoring + topic selection page |
| 3. AI Pipeline | 8-10 | Research → GPT → Qwen → review → articles |
| 4. Article UI | 11-12 | Article management + editor with preview |
| 5. Publishing | 13-15 | WeChat export + launchd scheduling |
| 5.5. AI Scoring | 16 | GPT writability + freshness evaluation |

---

### Task 17: Data Retention Cleanup

**Files:**
- Create: `src/lib/db/cleanup.ts`
- Create: `src/app/api/cron/cleanup/route.ts`

- [ ] **Step 1: Implement cleanup service**

Create `src/lib/db/cleanup.ts`:
```typescript
import { db } from "@/lib/db";
import { snapshots, research } from "@/lib/db/schema";
import { lt } from "drizzle-orm";

export async function runCleanup() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const deletedSnapshots = await db
    .delete(snapshots)
    .where(lt(snapshots.sampledAt, thirtyDaysAgo));

  const deletedResearch = await db
    .delete(research)
    .where(lt(research.createdAt, ninetyDaysAgo));

  return { deletedSnapshots, deletedResearch };
}
```

- [ ] **Step 2: Create cleanup API route**

Create `src/app/api/cron/cleanup/route.ts` — GET handler that calls `runCleanup()`.

- [ ] **Step 3: Add launchd plist for weekly cleanup**

Add to `scripts/setup-launchd.sh`: a plist that runs cleanup every Sunday at 04:00.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add data retention cleanup for snapshots and research"
```

---

## Summary: Build Order

| Phase | Tasks | Deliverable |
|---|---|---|
| 1. Foundation | 1-4 | Next.js app that samples HN data into SQLite |
| 2. Scoring + UI | 5-7 | Weighted scoring + topic selection page |
| 3. AI Pipeline | 8-10 | Research → GPT → Qwen → review → articles |
| 4. Article UI | 11-12 | Article management + editor with preview |
| 5. Publishing | 13-15 | WeChat export + launchd scheduling |
| 5.5. AI Scoring | 16 | GPT writability + freshness evaluation |
| 5.5. Cleanup | 17 | Data retention (30d snapshots, 90d research) |

**Total: 17 tasks across 5 phases. Each phase produces working, testable software.**
