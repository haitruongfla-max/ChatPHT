CREATE TABLE `call_participants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` varchar(40) NOT NULL,
	`userId` int NOT NULL,
	`joinedAt` timestamp,
	`leftAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `call_participants_id` PRIMARY KEY(`id`),
	CONSTRAINT `call_participant_unique_idx` UNIQUE(`callId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `conversations` MODIFY COLUMN `directKey` varchar(64);--> statement-breakpoint
ALTER TABLE `call_sessions` ADD `provider` enum('livekit','p2p') DEFAULT 'livekit' NOT NULL;--> statement-breakpoint
ALTER TABLE `call_sessions` ADD `isGroup` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `role` enum('owner','admin','member') DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `kind` enum('direct','group') DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE `conversations` ADD `title` varchar(80);--> statement-breakpoint
ALTER TABLE `conversations` ADD `avatarKey` varchar(512);--> statement-breakpoint
ALTER TABLE `conversations` ADD `createdBy` int;--> statement-breakpoint
ALTER TABLE `conversations` ADD `pinnedMessageId` int;--> statement-breakpoint
CREATE INDEX `call_participant_user_idx` ON `call_participants` (`userId`,`callId`);