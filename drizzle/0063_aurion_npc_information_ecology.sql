CREATE TABLE `aurionNpcInformationReceipts` (
  `id` varchar(64) NOT NULL,
  `factId` varchar(64) NOT NULL,
  `worldId` varchar(128) NOT NULL,
  `ownerNpcId` varchar(128) NOT NULL,
  `subjectId` varchar(128) NOT NULL,
  `predicate` varchar(128) NOT NULL,
  `value` varchar(255) NOT NULL,
  `claimKey` varchar(71) NOT NULL,
  `status` enum('experienced','remembered','communicated','corroborated','contradicted','trusted','uncertain','expired') NOT NULL,
  `confidenceBps` int NOT NULL,
  `witnessNpcId` varchar(128) NOT NULL,
  `communicatedByNpcId` varchar(128),
  `communicationReceiptId` varchar(128),
  `relatedFactId` varchar(64),
  `sourceKind` enum('npc_decision_receipt','npc_memory_receipt','npc_action_receipt','world_receipt','quest_receipt','semantic_graph_receipt') NOT NULL,
  `sourceReceiptId` varchar(128) NOT NULL,
  `sourceReceiptHash` varchar(71) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(71) NOT NULL,
  `sourceCausalRoot` varchar(71) NOT NULL,
  `logicalIndex` int NOT NULL,
  `expiresAtIndex` int,
  `previousReceiptId` varchar(128),
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionNpcInformationReceipts_id` PRIMARY KEY(`id`),
  UNIQUE KEY `aurionNpcInformationReceipts_receipt_uq` (`receiptHash`),
  UNIQUE KEY `aurionNpcInformationReceipts_communication_uq` (`communicationReceiptId`),
  KEY `aurionNpcInformationReceipts_owner_idx` (`ownerNpcId`,`logicalIndex`),
  KEY `aurionNpcInformationReceipts_fact_idx` (`factId`,`logicalIndex`),
  KEY `aurionNpcInformationReceipts_claim_idx` (`worldId`,`claimKey`,`logicalIndex`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcInformationReceipts_no_update` BEFORE UPDATE ON `aurionNpcInformationReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_INFORMATION_RECEIPT_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcInformationReceipts_no_delete` BEFORE DELETE ON `aurionNpcInformationReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_INFORMATION_RECEIPT_APPEND_ONLY';
