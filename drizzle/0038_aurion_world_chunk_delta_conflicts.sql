CREATE TABLE `aurionWorldChunkDeltaConflicts` (
  `id` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `chunkX` int NOT NULL,
  `chunkZ` int NOT NULL,
  `baseRevision` int NOT NULL,
  `sequence` int NOT NULL,
  `leftHash` varchar(64) NOT NULL,
  `rightHash` varchar(64) NOT NULL,
  `winnerId` varchar(64) NOT NULL,
  `resolutionHash` varchar(64) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionWorldChunkDeltaConflicts_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aurionWorldChunkDeltaConflicts_idempotency_uq` (`idempotencyKey`),
  UNIQUE KEY `aurionWorldChunkDeltaConflicts_resolution_hash_uq` (`resolutionHash`),
  UNIQUE KEY `aurionWorldChunkDeltaConflicts_scope_uq` (`worldId`,`chunkX`,`chunkZ`,`baseRevision`,`sequence`),
  KEY `aurionWorldChunkDeltaConflicts_world_created_idx` (`worldId`,`createdAt`)
);
