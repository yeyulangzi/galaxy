CREATE TABLE `node_thought_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`content` text NOT NULL,
	`version_label` text,
	`saved_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `node_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content_or_url` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP INDEX IF EXISTS `uq_aspects_node_template`;--> statement-breakpoint
ALTER TABLE aspects ADD `source_type` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE aspects ADD `source_id` text;--> statement-breakpoint
ALTER TABLE edges ADD `origin` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE feed_items ADD `parsed_content` text;--> statement-breakpoint
ALTER TABLE nodes ADD `node_type` text DEFAULT 'concept' NOT NULL;--> statement-breakpoint
ALTER TABLE nodes ADD `channel` text DEFAULT 'light' NOT NULL;--> statement-breakpoint
ALTER TABLE nodes ADD `internalization_status` text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE nodes ADD `my_thoughts` text;--> statement-breakpoint
ALTER TABLE nodes ADD `last_accessed_at` text;--> statement-breakpoint
CREATE INDEX `idx_thought_versions_node` ON `node_thought_versions` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_attachments_node` ON `node_attachments` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_nodes_channel` ON `nodes` (`channel`);--> statement-breakpoint
CREATE INDEX `idx_nodes_node_type` ON `nodes` (`node_type`);--> statement-breakpoint
ALTER TABLE `aspects` DROP COLUMN `template_key`;