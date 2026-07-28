CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`wedding_date` text,
	`date_undecided` integer DEFAULT false NOT NULL,
	`session` text NOT NULL,
	`tables` integer NOT NULL,
	`personality` text NOT NULL,
	`answers_json` text NOT NULL,
	`scores_json` text NOT NULL,
	`created_at` text NOT NULL
);
