CREATE TABLE `provider_models` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`remote_id` text NOT NULL,
	`display_name` text NOT NULL,
	`price_micros_per_minute` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `transcription_providers`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "provider_models_price_check" CHECK("provider_models"."price_micros_per_minute" is null or "provider_models"."price_micros_per_minute" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_models_provider_remote_unique` ON `provider_models` (`provider_id`,`remote_id`);--> statement-breakpoint
CREATE TABLE `transcription_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`base_url` text NOT NULL,
	`api_key` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsec') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transcription_runs` ADD `estimated_cost_micros` integer;