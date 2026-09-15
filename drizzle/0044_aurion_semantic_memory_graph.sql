CREATE TABLE `aurionSemanticMemoryReceipts` (
  `id` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `graphVersion` varchar(64) NOT NULL,
  `sourceDecisionReceiptId` varchar(64) NOT NULL,
  `sourceDecisionSha256` varchar(64) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `previousReceiptId` varchar(64),
  `previousGraphHash` varchar(64) NOT NULL,
  `graphHash` varchar(64) NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionSemanticMemoryReceipts_id` PRIMARY KEY (`id`),
  CONSTRAINT `aurionSemanticMemoryReceipts_index_ck` CHECK (`resolutionIndex` >= 0),
  UNIQUE KEY `aurionSemanticMemoryReceipts_npc_index_uq` (`npcId`,`resolutionIndex`),
  UNIQUE KEY `aurionSemanticMemoryReceipts_source_uq` (`sourceDecisionReceiptId`),
  UNIQUE KEY `aurionSemanticMemoryReceipts_hash_uq` (`receiptHash`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticMemoryReceipts_no_update` BEFORE UPDATE ON `aurionSemanticMemoryReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_MEMORY_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticMemoryReceipts_no_delete` BEFORE DELETE ON `aurionSemanticMemoryReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_MEMORY_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TABLE `aurionSemanticNodes` (
  `id` varchar(64) NOT NULL,
  `graphReceiptId` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `subjectId` varchar(96) NOT NULL,
  `predicate` varchar(64) NOT NULL,
  `value` varchar(255) NOT NULL,
  `factVersion` varchar(64) NOT NULL,
  `validFromIndex` int NOT NULL,
  `validUntilIndex` int NOT NULL,
  `status` varchar(32) NOT NULL,
  `conflictsWithJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionSemanticNodes_id` PRIMARY KEY (`id`),
  KEY `aurionSemanticNodes_graph_idx` (`graphReceiptId`),
  KEY `aurionSemanticNodes_npc_idx` (`npcId`),
  KEY `aurionSemanticNodes_subject_predicate_idx` (`subjectId`,`predicate`)
);
--> statement-breakpoint
CREATE TABLE `aurionSemanticProvenance` (
  `id` varchar(128) NOT NULL,
  `factId` varchar(64) NOT NULL,
  `receiptId` varchar(64) NOT NULL,
  `receiptSha256` varchar(64) NOT NULL,
  `decisionHash` varchar(64) NOT NULL,
  `logicalIndex` int NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionSemanticProvenance_id` PRIMARY KEY (`id`),
  KEY `aurionSemanticProvenance_fact_idx` (`factId`)
);
--> statement-breakpoint
CREATE TABLE `aurionSemanticRetrievalIndex` (
  `id` varchar(128) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `subjectId` varchar(96) NOT NULL,
  `predicate` varchar(64) NOT NULL,
  `value` varchar(255) NOT NULL,
  `status` varchar(32) NOT NULL,
  `validFromIndex` int NOT NULL,
  `validUntilIndex` int NOT NULL,
  `score` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionSemanticRetrievalIndex_id` PRIMARY KEY (`id`),
  KEY `aurionSemanticRetrievalIndex_npc_idx` (`npcId`),
  KEY `aurionSemanticRetrievalIndex_subject_idx` (`subjectId`),
  KEY `aurionSemanticRetrievalIndex_query_idx` (`npcId`,`subjectId`,`predicate`)
);
