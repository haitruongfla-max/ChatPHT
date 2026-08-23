ALTER TABLE `conversations` ADD `backgroundKey` varchar(512);--> statement-breakpoint
ALTER TABLE `conversations` ADD `backgroundSize` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `backgroundOpacity` int DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `backgroundUpdatedAt` timestamp;