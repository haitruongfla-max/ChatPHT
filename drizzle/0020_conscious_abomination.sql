CREATE TABLE `screen_share_sessions` (
	`id` varchar(40) NOT NULL,
	`conversationId` int NOT NULL,
	`hostId` int NOT NULL,
	`room` varchar(96) NOT NULL,
	`status` enum('starting','live','ended','expired') NOT NULL DEFAULT 'starting',
	`expiresAt` timestamp NOT NULL,
	`startedAt` timestamp,
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `screen_share_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `screen_share_sessions_room_unique` UNIQUE(`room`)
);
--> statement-breakpoint
ALTER TABLE `messages` MODIFY COLUMN `contentType` enum('text','image','video','screen_share_invite') NOT NULL;--> statement-breakpoint
CREATE INDEX `screen_share_conversation_status_idx` ON `screen_share_sessions` (`conversationId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `screen_share_host_status_idx` ON `screen_share_sessions` (`hostId`,`status`,`expiresAt`);