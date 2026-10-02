CREATE TABLE `spot_phenomena` (
	`spotcd` integer NOT NULL,
	`phenomenon` text NOT NULL,
	PRIMARY KEY(`spotcd`, `phenomenon`),
	FOREIGN KEY (`spotcd`) REFERENCES `spots`(`spotcd`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `spot_phenomena_phenomenon_idx` ON `spot_phenomena` (`phenomenon`);--> statement-breakpoint
CREATE INDEX `spot_phenomena_spotcd_idx` ON `spot_phenomena` (`spotcd`);--> statement-breakpoint
CREATE INDEX `spots_pref_genre_idx` ON `spots` (`prefecture`,`genre`);--> statement-breakpoint
CREATE INDEX `spots_bbox_covering_idx` ON `spots` (`lat`,`lng`,`total_score`,`spotcd`);--> statement-breakpoint
CREATE INDEX `spots_total_score_idx` ON `spots` (`total_score`,`spotcd`);--> statement-breakpoint
CREATE INDEX `spots_fear_rating_idx` ON `spots` (`fear_rating`);--> statement-breakpoint
CREATE INDEX `spots_genre_rating_idx` ON `spots` (`genre`,`fear_rating`);