ALTER TABLE `messages` ADD `mediaBatchId` varchar(80);--> statement-breakpoint
CREATE INDEX `message_conversation_batch_idx` ON `messages` (`conversationId`,`mediaBatchId`,`createdAt`);