ALTER TABLE `conversation_members` ADD `hiddenAt` timestamp;--> statement-breakpoint
ALTER TABLE `conversation_members` ADD `hiddenAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `recalledAt` timestamp;--> statement-breakpoint
ALTER TABLE `messages` ADD `recalledBy` int;
