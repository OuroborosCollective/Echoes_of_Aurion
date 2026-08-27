CREATE TABLE `aurionWorldPresenceLeases` (
	`connectionId` varchar(96) NOT NULL,
	`userId` int NOT NULL,
	`zoneId` varchar(64) NOT NULL,
	`chunkX` int NOT NULL,
	`chunkZ` int NOT NULL,
	`positionX` int NOT NULL,
	`positionZ` int NOT NULL,
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	`disconnectedAt` timestamp,
	CONSTRAINT `aurionWorldPresenceLeases_connectionId` PRIMARY KEY(`connectionId`)
);
--> statement-breakpoint
CREATE INDEX `aurionWorldPresenceLeases_active_idx` ON `aurionWorldPresenceLeases` (`expiresAt`,`disconnectedAt`);
--> statement-breakpoint
CREATE INDEX `aurionWorldPresenceLeases_user_active_idx` ON `aurionWorldPresenceLeases` (`userId`,`expiresAt`);
--> statement-breakpoint
CREATE TABLE `aurionWorldEpochRequests` (
	`idempotencyKey` varchar(128) NOT NULL,
	`worldId` varchar(64) NOT NULL,
	`requestedByUserId` int NOT NULL,
	`ruleSetVersion` varchar(96) NOT NULL,
	`epoch` int NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`snapshotJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aurionWorldEpochRequests_idempotencyKey` PRIMARY KEY(`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `aurionWorldEpochRequests_world_epoch_idx` ON `aurionWorldEpochRequests` (`worldId`,`epoch`);
--> statement-breakpoint
CREATE INDEX `aurionWorldEpochRequests_hash_idx` ON `aurionWorldEpochRequests` (`snapshotHash`);
