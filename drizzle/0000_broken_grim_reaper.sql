CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer,
	`daily_score_id` integer,
	`type` text NOT NULL,
	`title` text,
	`content_md` text,
	`content_reviewed` text,
	`content_edited` text,
	`outline` text,
	`status` text DEFAULT 'generating',
	`review_log` text,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`daily_score_id`) REFERENCES `daily_scores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_articles_status` ON `articles` (`status`);--> statement-breakpoint
CREATE TABLE `daily_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`date` text NOT NULL,
	`appearance_count` integer NOT NULL,
	`discussion_score` real,
	`trend_score` real,
	`writability_score` real,
	`freshness_score` real,
	`final_score` real,
	`ai_analysis` text,
	`status` text DEFAULT 'candidate',
	`created_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_daily_scores_date_status` ON `daily_scores` (`date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_daily_scores_story_date` ON `daily_scores` (`story_id`,`date`);--> statement-breakpoint
CREATE TABLE `research` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`original_content` text,
	`hn_comments` text,
	`web_search` text,
	`ai_summary` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`story_id` integer NOT NULL,
	`sampled_at` integer NOT NULL,
	`rank` integer NOT NULL,
	`score` integer NOT NULL,
	`comments_count` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_snapshots_story_sampled` ON `snapshots` (`story_id`,`sampled_at`);--> statement-breakpoint
CREATE INDEX `idx_snapshots_sampled` ON `snapshots` (`sampled_at`);--> statement-breakpoint
CREATE TABLE `stories` (
	`id` integer PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`author` text,
	`story_type` text DEFAULT 'story',
	`score` integer,
	`comments_count` integer,
	`story_text` text,
	`hn_created_at` integer,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `system_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`level` text NOT NULL,
	`source` text NOT NULL,
	`message` text NOT NULL,
	`details` text,
	`created_at` integer NOT NULL
);
