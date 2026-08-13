CREATE TABLE `gatewayCommands` (
	`id` varchar(64) NOT NULL,
	`gatewaySessionId` varchar(64) NOT NULL,
	`sequence` int NOT NULL,
	`command` varchar(1) NOT NULL,
	`source` varchar(32) NOT NULL DEFAULT 'authorized-mcp',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gatewayCommands_id` PRIMARY KEY(`id`),
	CONSTRAINT `gatewayCommands_session_sequence_uq` UNIQUE(`gatewaySessionId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `gatewaySessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`providerLabel` varchar(120) NOT NULL,
	`tokenDigest` varchar(128) NOT NULL,
	`allowedCommands` text NOT NULL,
	`status` enum('active','revoked','expired') NOT NULL DEFAULT 'active',
	`expiresAt` timestamp NOT NULL,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gatewaySessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `gatewaySessions_tokenDigest_unique` UNIQUE(`tokenDigest`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
CREATE INDEX `gatewayCommands_session_created_idx` ON `gatewayCommands` (`gatewaySessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `gatewaySessions_userId_idx` ON `gatewaySessions` (`userId`);