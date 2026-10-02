CREATE TABLE `spots` (
	`spotcd` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kana` text,
	`address` text,
	`prefecture` text,
	`city` text,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`genre` text,
	`status` text,
	`phenomena` text DEFAULT '[]' NOT NULL,
	`features` text DEFAULT '[]' NOT NULL,
	`total_score` integer,
	`national_rank` integer,
	`pref_rank` integer,
	`fear_rating` real,
	`rating_count` integer,
	`outline` text,
	`comment` text,
	`image_url` text,
	`source_url` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `spots_pref_idx` ON `spots` (`prefecture`);--> statement-breakpoint
CREATE INDEX `spots_genre_idx` ON `spots` (`genre`);--> statement-breakpoint
CREATE INDEX `spots_bbox_idx` ON `spots` (`lat`,`lng`);