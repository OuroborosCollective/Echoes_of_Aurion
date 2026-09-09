CREATE TABLE `aurionNpcMemoryReceiptsV4` (
  `id` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `sourceDecisionReceiptId` varchar(64) NOT NULL,
  `sourceDecisionSha256` varchar(64) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `ruleSetVersion` varchar(64) NOT NULL,
  `previousReceiptId` varchar(64),
  `previousMemoryHash` varchar(64) NOT NULL,
  `memoryHash` varchar(64) NOT NULL,
  `memoryJson` mediumtext NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionNpcMemoryReceiptsV4_id` PRIMARY KEY (`id`),
  CONSTRAINT `aurionNpcMemoryReceiptsV4_index_ck` CHECK (`resolutionIndex` >= 0),
  CONSTRAINT `aurionNpcMemoryReceiptsV4_bytes_ck` CHECK (octet_length(`memoryJson`) <= 262144),
  UNIQUE KEY `aurionNpcMemoryReceiptsV4_npc_index_uq` (`npcId`,`resolutionIndex`),
  UNIQUE KEY `aurionNpcMemoryReceiptsV4_source_uq` (`sourceDecisionReceiptId`),
  UNIQUE KEY `aurionNpcMemoryReceiptsV4_hash_uq` (`receiptHash`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcMemoryReceiptsV4_no_update` BEFORE UPDATE ON `aurionNpcMemoryReceiptsV4` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_MEMORY_V4_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcMemoryReceiptsV4_no_delete` BEFORE DELETE ON `aurionNpcMemoryReceiptsV4` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_MEMORY_V4_APPEND_ONLY';
