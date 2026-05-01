CREATE TABLE `feedback_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`dimension_key` text NOT NULL,
	`suggestion_type` text NOT NULL,
	`source` text NOT NULL,
	`strategy` text,
	`total_count` integer DEFAULT 0 NOT NULL,
	`accepted_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`modified_count` integer DEFAULT 0 NOT NULL,
	`avg_confidence` real DEFAULT 0,
	`avg_accepted_confidence` real DEFAULT 0,
	`avg_rejected_confidence` real DEFAULT 0,
	`window_start` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`preference_key` text NOT NULL,
	`preference_value` text NOT NULL,
	`source` text DEFAULT 'learned' NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`learned_at` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
ALTER TABLE suggestions ADD `calibrated_confidence` real;--> statement-breakpoint
ALTER TABLE suggestions ADD `feedback_processed` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `feedback_stats_dimension_key_unique` ON `feedback_stats` (`dimension_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_preferences_preference_key_unique` ON `user_preferences` (`preference_key`);