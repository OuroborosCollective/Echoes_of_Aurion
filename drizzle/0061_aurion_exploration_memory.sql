CREATE TABLE `aurionExplorationMemoryProjections` (
  `id` varchar(128) NOT NULL,
  `userId` int NOT NULL,
  `worldId` varchar(96) NOT NULL,
  `worldEpoch` int NOT NULL,
  `chunkX` int NOT NULL,
  `chunkZ` int NOT NULL,
  `firstDiscoveryReceiptHash` varchar(71) NOT NULL,
  `latestConfirmedVisitSequence` bigint NOT NULL,
  `latestProjectionHash` varchar(71) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `memoryHash` varchar(71) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionExplorationMemoryProjections_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aurionExplorationMemoryProjections_owner_chunk_uq` (`userId`,`worldId`,`worldEpoch`,`chunkX`,`chunkZ`),
  KEY `aurionExplorationMemoryProjections_world_idx` (`worldId`,`worldEpoch`,`chunkX`,`chunkZ`),
  KEY `aurionExplorationMemoryProjections_user_idx` (`userId`,`worldEpoch`)
);