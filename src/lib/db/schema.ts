import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

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
}, (table) => [
  index("idx_snapshots_story_sampled").on(table.storyId, table.sampledAt),
  index("idx_snapshots_sampled").on(table.sampledAt),
]);

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
  clusterId: integer("cluster_id"),
}, (table) => [
  index("idx_daily_scores_date_status").on(table.date, table.status),
  index("idx_daily_scores_story_date").on(table.storyId, table.date),
]);

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
}, (table) => [
  index("idx_articles_status").on(table.status),
]);

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

export const topicClusters = sqliteTable("topic_clusters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  label: text("label").notNull(),
  primaryStoryId: integer("primary_story_id").notNull().references(() => stories.id),
  storyIds: text("story_ids").notNull(), // JSON array of story IDs
  mergedScore: integer("merged_score"),
  mergedComments: integer("merged_comments"),
  totalAppearances: integer("total_appearances"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_topic_clusters_date").on(table.date),
]);
