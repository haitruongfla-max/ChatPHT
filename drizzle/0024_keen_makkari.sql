ALTER TABLE `conversation_members` ADD `clearedThroughMessageId` int;--> statement-breakpoint
CREATE INDEX `conversation_member_user_hidden_idx` ON `conversation_members` (`userId`,`hiddenAt`);