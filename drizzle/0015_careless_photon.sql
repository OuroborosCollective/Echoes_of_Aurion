CREATE TABLE `zoneConnectionTickets` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`zoneId` enum('observatory_threshold') NOT NULL,
	`ticketDigest` varchar(128) NOT NULL,
	`clientBuild` varchar(120) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `zoneConnectionTickets_id` PRIMARY KEY(`id`),
	CONSTRAINT `zoneConnectionTickets_ticketDigest_unique` UNIQUE(`ticketDigest`)
);
--> statement-breakpoint
CREATE INDEX `zoneConnectionTickets_user_created_idx` ON `zoneConnectionTickets` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `zoneConnectionTickets_zone_expiry_idx` ON `zoneConnectionTickets` (`zoneId`,`expiresAt`);