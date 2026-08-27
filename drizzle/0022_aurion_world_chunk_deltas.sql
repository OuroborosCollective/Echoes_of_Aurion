CREATE TABLE `aurionWorldChunkDeltas` (
	`id` varchar(64) NOT NULL,
	`worldId` varchar(64) NOT NULL,
	`chunkX` int NOT NULL,
	`chunkZ` int NOT NULL,
	`baseRevision` int NOT NULL,
	`sequence` int NOT NULL,
	`kind` enum('resource_depleted','structure_placed','structure_removed','road_built') NOT NULL,
	`targetId` varchar(128) NOT NULL,
	`actorUserId` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`payloadJson` text NOT NULL,
	`deterministicHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aurionWorldChunkDeltas_id` PRIMARY KEY(`id`),
	CONSTRAINT `aurionWorldChunkDeltas_idempotency_uq` UNIQUE(`idempotencyKey`),
	CONSTRAINT `aurionWorldChunkDeltas_hash_uq` UNIQUE(`deterministicHash`),
	CONSTRAINT `aurionWorldChunkDeltas_chunk_sequence_uq` UNIQUE(`worldId`,`chunkX`,`chunkZ`,`sequence`)
);
--> statement-breakpoint
CREATE INDEX `aurionWorldChunkDeltas_chunk_created_idx` ON `aurionWorldChunkDeltas` (`worldId`,`chunkX`,`chunkZ`,`createdAt`);
