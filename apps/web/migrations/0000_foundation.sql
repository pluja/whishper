CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `auth_accounts_user_id_idx` ON `auth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `auth_sessions_user_id_idx` ON `auth_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_email_unique` ON `auth_users` (`email`);--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `auth_verifications_identifier_idx` ON `auth_verifications` (`identifier`);--> statement-breakpoint
CREATE TABLE `cues` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`start_us` integer NOT NULL,
	`end_us` integer NOT NULL,
	`text` text NOT NULL,
	`words` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `subtitle_tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cues_timing_check" CHECK("cues"."start_us" >= 0 and "cues"."end_us" >= "cues"."start_us")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cues_track_position_idx` ON `cues` (`track_id`,`position`);--> statement-breakpoint
CREATE TABLE `instance_secrets` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
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
	CONSTRAINT "jobs_state_check" CHECK("jobs"."state" in ('queued', 'leased', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "jobs_progress_check" CHECK("jobs"."progress" >= 0 and "jobs"."progress" <= 1)
);
--> statement-breakpoint
CREATE INDEX `jobs_lease_idx` ON `jobs` (`state`,`available_at`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_run_idx` ON `jobs` (`run_id`);--> statement-breakpoint
CREATE INDEX `jobs_project_idx` ON `jobs` (`project_id`,`kind`,`state`);--> statement-breakpoint
CREATE TABLE `media_derivatives` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`job_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`storage_key` text NOT NULL,
	`source_storage_key` text NOT NULL,
	`media_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`schema_version` text NOT NULL,
	`generator_version` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_derivatives_kind_check" CHECK("media_derivatives"."kind" in ('waveform', 'thumbnail', 'proxy')),
	CONSTRAINT "media_derivatives_status_check" CHECK("media_derivatives"."status" in ('ready', 'failed', 'deleting')),
	CONSTRAINT "media_derivatives_size_check" CHECK("media_derivatives"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE INDEX `media_derivatives_project_created_idx` ON `media_derivatives` (`project_id`,"created_at" desc);--> statement-breakpoint
CREATE UNIQUE INDEX `media_derivatives_project_kind_unique` ON `media_derivatives` (`project_id`,`kind`);--> statement-breakpoint
CREATE TABLE `media_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`created_by` text NOT NULL,
	`original_filename` text NOT NULL,
	`media_type` text,
	`size_bytes` integer NOT NULL,
	`received_bytes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`storage_key` text,
	`error` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	`first_finalize_attempt_at` integer,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "media_uploads_size_check" CHECK("media_uploads"."size_bytes" > 0),
	CONSTRAINT "media_uploads_received_check" CHECK("media_uploads"."received_bytes" >= 0 and "media_uploads"."received_bytes" <= "media_uploads"."size_bytes"),
	CONSTRAINT "media_uploads_status_check" CHECK("media_uploads"."status" in ('uploading', 'finalizing', 'completed', 'cancelled', 'failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_uploads_project_id_unique` ON `media_uploads` (`project_id`);--> statement-breakpoint
CREATE INDEX `media_uploads_workspace_created_idx` ON `media_uploads` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `media_uploads_status_idx` ON `media_uploads` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`workspace_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`workspace_id`, `user_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "memberships_role_check" CHECK("memberships"."role" in ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE INDEX `memberships_user_id_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`media_original_key` text,
	`media_filename` text,
	`media_duration_us` integer,
	`media_preparation_status` text DEFAULT 'not_started' NOT NULL,
	`media_probe` text,
	`media_frame_rate_num` integer,
	`media_frame_rate_den` integer,
	`media_seekable` integer,
	`media_proxy_recommended` integer,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "projects_media_duration_check" CHECK("projects"."media_duration_us" is null or "projects"."media_duration_us" >= 0),
	CONSTRAINT "projects_media_preparation_status_check" CHECK("projects"."media_preparation_status" in ('not_started', 'queued', 'running', 'completed', 'failed')),
	CONSTRAINT "projects_media_frame_rate_check" CHECK(("projects"."media_frame_rate_num" is null and "projects"."media_frame_rate_den" is null)
        or ("projects"."media_frame_rate_num" > 0 and "projects"."media_frame_rate_den" > 0))
);
--> statement-breakpoint
CREATE INDEX `projects_workspace_created_idx` ON `projects` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `subtitle_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`source_run_id` text,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`kind` text DEFAULT 'transcription' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_run_id`) REFERENCES `transcription_runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "subtitle_tracks_revision_check" CHECK("subtitle_tracks"."revision" >= 0)
);
--> statement-breakpoint
CREATE INDEX `subtitle_tracks_project_idx` ON `subtitle_tracks` (`project_id`);--> statement-breakpoint
CREATE TABLE `transcription_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`adapter_id` text NOT NULL,
	`model_id` text NOT NULL,
	`options` text DEFAULT '{}' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "transcription_runs_status_check" CHECK("transcription_runs"."status" in ('queued', 'running', 'completed', 'failed', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX `transcription_runs_project_created_idx` ON `transcription_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`architecture` text NOT NULL,
	`protocol_version` text NOT NULL,
	`manifest` text NOT NULL,
	`last_seen_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);