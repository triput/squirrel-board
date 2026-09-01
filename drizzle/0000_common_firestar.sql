CREATE TABLE `decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text,
	`decision` text NOT NULL,
	`reason` text NOT NULL,
	`source` text DEFAULT 'Human' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`why` text NOT NULL,
	`status` text DEFAULT 'Captured' NOT NULL,
	`next_action` text,
	`notes` text,
	`source` text DEFAULT 'Human' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text NOT NULL,
	`field` text NOT NULL,
	`proposed_value` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer
);
