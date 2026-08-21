ALTER TABLE `users` ADD `accessExpiresAt` timestamp;
--> statement-breakpoint
INSERT INTO `users` (`openId`, `username`, `name`, `passwordHash`, `loginMethod`, `role`, `lastSignedIn`)
VALUES ('local:admin', 'admin', 'Quản trị viên ChatPHT', 'scrypt$c50e1a5245691519df7607840a54961c$6fbc5af327b59dbe73c34affe5e84b3441c177a03ab38a2dc73b53af81f3e2732d9a34868db7555ffc7dd42fd52096808016e430b7e0e6cee1d68664a4159ace', 'username', 'admin', NOW())
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `passwordHash` = VALUES(`passwordHash`), `loginMethod` = 'username', `role` = 'admin', `accessExpiresAt` = NULL;
