CREATE TABLE `aurionWorldCheckpoints` (
	`id` varchar(80) NOT NULL,
	`worldId` varchar(64) NOT NULL,
	`worldSeed` varchar(128) NOT NULL,
	`epoch` int NOT NULL,
	`worldRevision` varchar(64) NOT NULL,
	`chunkRevision` varchar(64) NOT NULL,
	`snapshotHash` varchar(64) NOT NULL,
	`snapshotJson` longtext NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aurionWorldCheckpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `aurionWorldCheckpoints_world_seed_epoch_uq` UNIQUE(`worldId`,`worldSeed`,`epoch`),
	CONSTRAINT `aurionWorldCheckpoints_revision_uq` UNIQUE(`worldId`,`worldRevision`,`chunkRevision`),
	CONSTRAINT `aurionWorldCheckpoints_snapshot_hash_uq` UNIQUE(`snapshotHash`),
	CONSTRAINT `aurionWorldCheckpoints_idempotency_uq` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `aurionWorldCheckpoints_world_created_idx` ON `aurionWorldCheckpoints` (`worldId`,`createdAt`);
