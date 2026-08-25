CREATE TABLE `p2p_call_telemetry` (
	`id` int AUTO_INCREMENT NOT NULL,
	`callId` varchar(40) NOT NULL,
	`reporterId` int NOT NULL,
	`event` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `p2p_call_telemetry_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `p2p_telemetry_call_created_idx` ON `p2p_call_telemetry` (`callId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `p2p_telemetry_reporter_created_idx` ON `p2p_call_telemetry` (`reporterId`,`createdAt`);