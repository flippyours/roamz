CREATE TABLE `route_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`client_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`checkpoint_at` integer NOT NULL,
	`collected` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_route_runs_client_created` ON `route_runs` (`client_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `whitelist_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`x_handle` text NOT NULL,
	`wallet_address` text NOT NULL,
	`comment_url` text NOT NULL,
	`duration` integer NOT NULL,
	`status` text DEFAULT 'pending_review' NOT NULL,
	`consent_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entries_run` ON `whitelist_entries` (`run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entries_wallet` ON `whitelist_entries` (`wallet_address`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_entries_handle` ON `whitelist_entries` (`x_handle`);