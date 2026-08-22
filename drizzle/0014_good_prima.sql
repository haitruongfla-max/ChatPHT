CREATE TABLE `storage_settings` (
	`id` int NOT NULL,
	`quotaGb` int NOT NULL DEFAULT 200,
	`unlimited` boolean NOT NULL DEFAULT false,
	`scheduledTaskUid` varchar(128),
	`lastCleanupAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `storage_settings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `mediaCleanedAt` timestamp;
--> statement-breakpoint
CREATE INDEX `message_media_cleanup_idx` ON `messages` (`mediaKey`,`createdAt`);
--> statement-breakpoint
INSERT INTO `storage_settings` (`id`, `quotaGb`, `unlimited`) VALUES (1, 200, false)
ON DUPLICATE KEY UPDATE `id` = `id`;
