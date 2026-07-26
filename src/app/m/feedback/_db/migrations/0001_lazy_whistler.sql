CREATE TABLE `known_users` (
	`user_id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`seen_at` integer NOT NULL
);
