CREATE TABLE `aurionGlobalWorldStates` (
	`worldId` varchar(64) NOT NULL,
	`worldSeed` varchar(128) NOT NULL,
	`epoch` int NOT NULL,
	`activePlayerCount` int NOT NULL,
	`highWaterPlayerCount` int NOT NULL,
	`snapshotJson` text NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aurionGlobalWorldStates_worldId` PRIMARY KEY(`worldId`),
	CONSTRAINT `aurionGlobalWorldStates_snapshotHash_uq` UNIQUE(`snapshotHash`)
);
--> statement-breakpoint
CREATE TABLE `aurionGlobalWorldEpochReceipts` (
	`id` varchar(64) NOT NULL,
	`worldId` varchar(64) NOT NULL,
	`epoch` int NOT NULL,
	`activePlayerCount` int NOT NULL,
	`highWaterPlayerCount` int NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`snapshotJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aurionGlobalWorldEpochReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `aurionGlobalWorldEpochReceipts_world_epoch_uq` UNIQUE(`worldId`,`epoch`),
	CONSTRAINT `aurionGlobalWorldEpochReceipts_hash_uq` UNIQUE(`snapshotHash`)
);
--> statement-breakpoint
CREATE INDEX `aurionGlobalWorldEpochReceipts_world_created_idx` ON `aurionGlobalWorldEpochReceipts` (`worldId`,`createdAt`);
