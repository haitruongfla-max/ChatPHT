CREATE TABLE `p2p_signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` varchar(40) NOT NULL,
	`senderId` int NOT NULL,
	`recipientId` int NOT NULL,
	`type` enum('offer','answer','ice') NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `p2p_signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `p2p_signal_recipient_idx` ON `p2p_signals` (`callId`,`recipientId`,`id`);--> statement-breakpoint
CREATE INDEX `p2p_signal_call_idx` ON `p2p_signals` (`callId`,`createdAt`);