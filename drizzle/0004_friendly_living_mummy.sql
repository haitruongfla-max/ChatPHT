CREATE TABLE `message_reactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`messageId` int NOT NULL,
	`userId` int NOT NULL,
	`emoji` varchar(16) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_reactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `message_reaction_unique_idx` UNIQUE(`messageId`,`userId`,`emoji`)
);
--> statement-breakpoint
CREATE INDEX `message_reaction_message_idx` ON `message_reactions` (`messageId`);