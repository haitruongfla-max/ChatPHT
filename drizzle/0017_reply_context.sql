ALTER TABLE `messages` ADD `replyToMessageId` int;--> statement-breakpoint
CREATE INDEX `message_reply_idx` ON `messages` (`replyToMessageId`);