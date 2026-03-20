CREATE TABLE `topic_clusters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`label` text NOT NULL,
	`primary_story_id` integer NOT NULL,
	`story_ids` text NOT NULL,
	`merged_score` integer,
	`merged_comments` integer,
	`total_appearances` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`primary_story_id`) REFERENCES `stories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_topic_clusters_date` ON `topic_clusters` (`date`);--> statement-breakpoint
ALTER TABLE `daily_scores` ADD `cluster_id` integer;