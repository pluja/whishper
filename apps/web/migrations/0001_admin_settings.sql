CREATE TABLE `instance_settings` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`default_model` text,
	`default_language` text,
	`word_alignment` integer DEFAULT true NOT NULL,
	`max_line_length` integer DEFAULT 42 NOT NULL,
	`precision` text DEFAULT 'auto' NOT NULL,
	`max_upload_bytes` integer DEFAULT 536870912000 NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	CONSTRAINT "instance_settings_singleton_check" CHECK("instance_settings"."id" = 1),
	CONSTRAINT "instance_settings_precision_check" CHECK("instance_settings"."precision" in ('auto', 'memory', 'precise')),
	CONSTRAINT "instance_settings_line_length_check" CHECK("instance_settings"."max_line_length" between 20 and 120),
	CONSTRAINT "instance_settings_upload_limit_check" CHECK("instance_settings"."max_upload_bytes" > 0)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text,
	`project_id` text,
	`run_id` text,
	`kind` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`payload` text NOT NULL,
	`result` text,
	`error` text,
	`progress` real DEFAULT 0 NOT NULL,
	`progress_message` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	`available_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`leased_by` text,
	`lease_token_hash` text,
	`lease_expires_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `transcription_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leased_by`) REFERENCES `workers`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "jobs_state_check" CHECK("__new_jobs"."state" in ('queued', 'leased', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "jobs_progress_check" CHECK("__new_jobs"."progress" >= 0 and "__new_jobs"."progress" <= 1)
);
--> statement-breakpoint
INSERT INTO `__new_jobs`("id", "workspace_id", "project_id", "run_id", "kind", "state", "priority", "payload", "result", "error", "progress", "progress_message", "attempts", "max_attempts", "available_at", "leased_by", "lease_token_hash", "lease_expires_at", "created_at", "updated_at", "completed_at") SELECT "id", "workspace_id", "project_id", "run_id", "kind", "state", "priority", "payload", "result", "error", "progress", "progress_message", "attempts", "max_attempts", "available_at", "leased_by", "lease_token_hash", "lease_expires_at", "created_at", "updated_at", "completed_at" FROM `jobs`;--> statement-breakpoint
DROP TABLE `jobs`;--> statement-breakpoint
ALTER TABLE `__new_jobs` RENAME TO `jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `jobs_lease_idx` ON `jobs` (`state`,`available_at`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_run_idx` ON `jobs` (`run_id`);--> statement-breakpoint
CREATE INDEX `jobs_project_idx` ON `jobs` (`project_id`,`kind`,`state`);--> statement-breakpoint
ALTER TABLE `auth_users` ADD `role` text DEFAULT 'user' NOT NULL;