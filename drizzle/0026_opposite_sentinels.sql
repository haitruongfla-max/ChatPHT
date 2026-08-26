ALTER TABLE `call_sessions` ADD `lastSeenAt` timestamp;--> statement-breakpoint
CREATE INDEX `call_session_status_last_seen_idx` ON `call_sessions` (`status`,`lastSeenAt`);