CREATE TABLE `call_sessions` (
	`id` varchar(40) NOT NULL,
	`conversationId` int NOT NULL,
	`callerId` int NOT NULL,
	`recipientId` int NOT NULL,
	`room` varchar(96) NOT NULL,
	`kind` enum('audio','video') NOT NULL,
	`status` enum('ringing','active','declined','ended','missed') NOT NULL DEFAULT 'ringing',
	`expiresAt` timestamp NOT NULL,
	`answeredAt` timestamp,
	`endedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `call_sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `call_sessions_room_unique` UNIQUE(`room`)
);
--> statement-breakpoint
CREATE INDEX `call_session_recipient_status_idx` ON `call_sessions` (`recipientId`,`status`,`expiresAt`);--> statement-breakpoint
CREATE INDEX `call_session_conversation_created_idx` ON `call_sessions` (`conversationId`,`createdAt`);