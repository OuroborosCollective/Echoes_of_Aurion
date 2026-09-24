CREATE TABLE `aurionWorldDirectorReceipts` (
  `id` varchar(128) NOT NULL,
  `schemaVersion` varchar(64) NOT NULL,
  `worldId` varchar(96) NOT NULL,
  `worldEpoch` int NOT NULL,
  `zoneId` varchar(128) NOT NULL,
  `logicalTick` int NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceRootHash` varchar(160) NOT NULL,
  `causalReceiptHash` varchar(96) NOT NULL,
  `seedDigest` varchar(96) NOT NULL,
  `previousReceiptHash` varchar(96),
  `candidateSetHash` varchar(96) NOT NULL,
  `decisionHash` varchar(96) NOT NULL,
  `rulesetVersion` varchar(96) NOT NULL,
  `decisionJson` text NOT NULL,
  `receiptHash` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionWorldDirectorReceipts_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aurionWorldDirectorReceipts_world_zone_tick_uq` (`worldId`,`zoneId`,`logicalTick`),
  UNIQUE KEY `aurionWorldDirectorReceipts_receipt_uq` (`receiptHash`),
  KEY `aurionWorldDirectorReceipts_world_zone_idx` (`worldId`,`zoneId`),
  KEY `aurionWorldDirectorReceipts_causal_idx` (`causalReceiptHash`),
  KEY `aurionWorldDirectorReceipts_decision_idx` (`decisionHash`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionWorldDirectorReceipts_no_update` BEFORE UPDATE ON `aurionWorldDirectorReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_WORLD_DIRECTOR_RECEIPT_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionWorldDirectorReceipts_no_delete` BEFORE DELETE ON `aurionWorldDirectorReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_WORLD_DIRECTOR_RECEIPT_APPEND_ONLY';
