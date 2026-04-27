CREATE TABLE `ai_call_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`channel` text NOT NULL,
	`task` text NOT NULL,
	`provider_id` text,
	`model` text,
	`base_url` text,
	`prompt_template` text,
	`context_summary` text,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `aspects` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`template_key` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text DEFAULT 'user' NOT NULL,
	`ai_metadata` text,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `deep_dive_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `deep_dive_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `deep_dive_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`agent_type` text NOT NULL,
	`bridge_task_path` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`final_suggestion_ids` text,
	`provider_id` text,
	`model` text,
	FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `edges` (
	`id` text PRIMARY KEY NOT NULL,
	`source_node_id` text NOT NULL,
	`target_node_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`description` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text DEFAULT 'user' NOT NULL,
	`ai_metadata` text,
	FOREIGN KEY (`source_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feed_items` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`raw_content` text,
	`file_path` text,
	`source_url` text,
	`status` text DEFAULT 'processing' NOT NULL,
	`error_message` text,
	`suggestions_count` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`summary` text,
	`domain` text,
	`is_seed` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`created_by` text DEFAULT 'user' NOT NULL,
	`ai_metadata` text
);
--> statement-breakpoint
CREATE TABLE `suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`source_ref_id` text,
	`payload` text NOT NULL,
	`rationale` text,
	`confidence` real DEFAULT 0.5 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_at` text,
	`decided_payload` text,
	`decision_note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`expires_at` text,
	`provider_id` text,
	`model` text
);
--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`started_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`finished_at` text,
	`scope` text,
	`suggestions_count` integer DEFAULT 0 NOT NULL,
	`cost_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`acceptance_rate` real,
	`error_message` text,
	`provider_id` text,
	`model` text
);
--> statement-breakpoint
CREATE TABLE `operation_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`operation` text NOT NULL,
	`affected_ids` text NOT NULL,
	`payload_snapshot` text,
	`user_note` text,
	`is_undone` integer DEFAULT false NOT NULL,
	`undone_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`enable_feed_ai` integer DEFAULT true NOT NULL,
	`enable_proactive_scan` integer DEFAULT false NOT NULL,
	`enable_deepdive` integer DEFAULT true NOT NULL,
	`proactive_scan_cron` text DEFAULT '0 3 * * *' NOT NULL,
	`proactive_scan_max_suggestions` integer DEFAULT 10 NOT NULL,
	`proactive_scan_strategies` text DEFAULT (json('["islands","gaps"]')) NOT NULL,
	`default_provider` text,
	`default_model` text,
	`provider_credentials` text,
	`task_provider_overrides` text,
	`custom_providers` text,
	`qoder_bridge_dir` text,
	`bridge_timeout_minutes` integer DEFAULT 30 NOT NULL,
	`enable_monthly_budget` integer DEFAULT false NOT NULL,
	`monthly_budget_usd` real DEFAULT 20 NOT NULL,
	`current_month_cost_usd` real DEFAULT 0 NOT NULL,
	`current_month_key` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_call_logs_created` ON `ai_call_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_call_logs_provider` ON `ai_call_logs` (`provider_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_aspects_node_template` ON `aspects` (`node_id`,`template_key`);--> statement-breakpoint
CREATE INDEX `idx_aspects_node` ON `aspects` (`node_id`);--> statement-breakpoint
CREATE INDEX `idx_deep_dive_messages_session` ON `deep_dive_messages` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_deep_dive_node` ON `deep_dive_sessions` (`node_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_edges_triple` ON `edges` (`source_node_id`,`target_node_id`,`relation_type`);--> statement-breakpoint
CREATE INDEX `idx_edges_source` ON `edges` (`source_node_id`);--> statement-breakpoint
CREATE INDEX `idx_edges_target` ON `edges` (`target_node_id`);--> statement-breakpoint
CREATE INDEX `idx_nodes_title` ON `nodes` (`title`);--> statement-breakpoint
CREATE INDEX `idx_nodes_domain` ON `nodes` (`domain`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_nodes_slug` ON `nodes` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_suggestions_status` ON `suggestions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_suggestions_source` ON `suggestions` (`source`);--> statement-breakpoint
CREATE INDEX `idx_suggestions_type` ON `suggestions` (`type`);--> statement-breakpoint
CREATE INDEX `idx_suggestions_confidence` ON `suggestions` (`confidence`);