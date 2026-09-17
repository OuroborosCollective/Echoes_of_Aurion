CREATE TABLE IF NOT EXISTS `aurionCausalTickReceipts` (
  `id` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `zoneId` varchar(64) NOT NULL,
  `tick` int NOT NULL,
  `revision` varchar(64) NOT NULL,
  `rulesetVersion` varchar(64) NOT NULL,
  `preStateHash` varchar(64) NOT NULL,
  `inputHash` varchar(64) NOT NULL,
  `inputJson` text,
  `transitionHash` varchar(64) NOT NULL,
  `rngRootHash` varchar(64) NOT NULL,
  `postStateHash` varchar(64) NOT NULL,
  `previousReceiptHash` varchar(64),
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionCausalTickReceipts_world_zone_tick_uq` (`worldId`,`zoneId`,`tick`),
  UNIQUE KEY `aurionCausalTickReceipts_receipt_hash_uq` (`receiptHash`),
  KEY `aurionCausalTickReceipts_world_zone_created_idx` (`worldId`,`zoneId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionCausalCheckpoints` (
  `id` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `zoneId` varchar(64) NOT NULL,
  `tick` int NOT NULL,
  `snapshotHash` varchar(64) NOT NULL,
  `snapshotJson` text NOT NULL,
  `reconciled` int NOT NULL DEFAULT 0,
  `reconciledAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionCausalCheckpoints_world_zone_tick_uq` (`worldId`,`zoneId`,`tick`),
  KEY `aurionCausalCheckpoints_world_zone_created_idx` (`worldId`,`zoneId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionReplayRuns` (
  `id` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `zoneId` varchar(64) NOT NULL,
  `fromTick` int NOT NULL,
  `toTick` int NOT NULL,
  `sourceRevision` varchar(64) NOT NULL,
  `runtimeRuleset` varchar(64) NOT NULL,
  `status` enum('MATCH','FIRST_DIVERGENCE','UNPROVABLE') NOT NULL,
  `firstDivergentStage` varchar(64),
  `expectedHash` varchar(64),
  `observedHash` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `aurionReplayRuns_world_zone_created_idx` (`worldId`,`zoneId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionCausalArchive` (
  `id` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `zoneId` varchar(64) NOT NULL,
  `startTick` int NOT NULL,
  `endTick` int NOT NULL,
  `receiptCount` int NOT NULL,
  `archiveHash` varchar(64) NOT NULL,
  `payloadJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionCausalArchive_world_zone_start_uq` (`worldId`,`zoneId`,`startTick`),
  KEY `aurionCausalArchive_world_zone_created_idx` (`worldId`,`zoneId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionCrossZoneTransfers` (
  `id` varchar(64) NOT NULL,
  `sourceWorldId` varchar(64) NOT NULL,
  `sourceZoneId` varchar(64) NOT NULL,
  `sourceTick` int NOT NULL,
  `targetWorldId` varchar(64) NOT NULL,
  `targetZoneId` varchar(64) NOT NULL,
  `targetTick` int,
  `transferHash` varchar(64) NOT NULL,
  `payloadJson` text NOT NULL,
  `status` enum('PENDING','CONSUMED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `consumedAt` timestamp,
  PRIMARY KEY (`id`),
  KEY `aurionCrossZoneTransfers_source_idx` (`sourceWorldId`,`sourceZoneId`,`sourceTick`),
  KEY `aurionCrossZoneTransfers_target_idx` (`targetWorldId`,`targetZoneId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionGlobalStateProofs` (
  `id` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `epoch` int NOT NULL,
  `globalProofHash` varchar(64) NOT NULL,
  `globalProofJson` text NOT NULL,
  `status` enum('VERIFIED','UNPROVABLE','CONFLICT') NOT NULL DEFAULT 'UNPROVABLE',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionGlobalStateProofs_world_epoch_uq` (`worldId`,`epoch`),
  UNIQUE KEY `aurionGlobalStateProofs_hash_uq` (`globalProofHash`),
  KEY `aurionGlobalStateProofs_world_created_idx` (`worldId`,`createdAt`)
);
