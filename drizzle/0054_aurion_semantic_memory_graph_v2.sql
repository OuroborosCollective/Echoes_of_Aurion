CREATE TABLE `aurionSemanticGraphReceiptsV2` (
  `id` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `generation` int NOT NULL,
  `graphVersion` varchar(64) NOT NULL,
  `retrievalVersion` varchar(64) NOT NULL,
  `memoryReceiptId` varchar(64) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `capsuleManifestSha256` varchar(64) NOT NULL,
  `previousGraphHash` varchar(64),
  `graphHash` varchar(64) NOT NULL,
  `graphJson` mediumtext NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionSemanticGraphReceiptsV2_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionSemanticGraphReceiptsV2_generation_ck` CHECK (`generation` >= 0),
  CONSTRAINT `aurionSemanticGraphReceiptsV2_npc_generation_uq` UNIQUE(`npcId`,`generation`),
  CONSTRAINT `aurionSemanticGraphReceiptsV2_memory_uq` UNIQUE(`memoryReceiptId`),
  CONSTRAINT `aurionSemanticGraphReceiptsV2_graph_hash_uq` UNIQUE(`graphHash`),
  CONSTRAINT `aurionSemanticGraphReceiptsV2_receipt_hash_uq` UNIQUE(`receiptHash`),
  INDEX `aurionSemanticGraphReceiptsV2_npc_idx`(`npcId`,`generation`)
);
--> statement-breakpoint
CREATE TABLE `aurionSemanticGraphNodesV2` (
  `id` varchar(64) NOT NULL,
  `graphReceiptId` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `kind` varchar(64) NOT NULL,
  `semanticKey` varchar(128) NOT NULL,
  `status` varchar(32) NOT NULL,
  `validFromIndex` int NOT NULL,
  `validUntilIndex` int,
  `payloadHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionSemanticGraphNodesV2_pk` PRIMARY KEY(`id`,`graphReceiptId`),
  INDEX `aurionSemanticGraphNodesV2_graph_idx`(`graphReceiptId`),
  INDEX `aurionSemanticGraphNodesV2_npc_kind_idx`(`npcId`,`kind`,`status`),
  INDEX `aurionSemanticGraphNodesV2_key_idx`(`npcId`,`semanticKey`)
);
--> statement-breakpoint
CREATE TABLE `aurionSemanticGraphEdgesV2` (
  `id` varchar(64) NOT NULL,
  `graphReceiptId` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `kind` varchar(64) NOT NULL,
  `relationKey` varchar(256) NOT NULL,
  `fromNodeId` varchar(64) NOT NULL,
  `toNodeId` varchar(64) NOT NULL,
  `status` varchar(32) NOT NULL,
  `validFromIndex` int NOT NULL,
  `validUntilIndex` int,
  `payloadHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionSemanticGraphEdgesV2_pk` PRIMARY KEY(`id`,`graphReceiptId`),
  INDEX `aurionSemanticGraphEdgesV2_graph_idx`(`graphReceiptId`),
  INDEX `aurionSemanticGraphEdgesV2_npc_kind_idx`(`npcId`,`kind`,`status`),
  INDEX `aurionSemanticGraphEdgesV2_from_idx`(`graphReceiptId`,`fromNodeId`),
  INDEX `aurionSemanticGraphEdgesV2_to_idx`(`graphReceiptId`,`toNodeId`)
);
--> statement-breakpoint
CREATE TABLE `aurionSemanticGraphProvenanceV2` (
  `id` varchar(64) NOT NULL,
  `graphReceiptId` varchar(64) NOT NULL,
  `elementType` enum('node','edge') NOT NULL,
  `elementId` varchar(64) NOT NULL,
  `provenanceKind` varchar(32) NOT NULL,
  `provenanceId` varchar(128) NOT NULL,
  `provenanceHash` varchar(64) NOT NULL,
  `logicalIndex` int NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionSemanticGraphProvenanceV2_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionSemanticGraphProvenanceV2_unique` UNIQUE(`graphReceiptId`,`elementType`,`elementId`,`provenanceKind`,`provenanceId`,`provenanceHash`),
  INDEX `aurionSemanticGraphProvenanceV2_element_idx`(`graphReceiptId`,`elementType`,`elementId`)
);
--> statement-breakpoint
CREATE TABLE `aurionSemanticGraphIndexV2` (
  `id` varchar(64) NOT NULL,
  `graphReceiptId` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `nodeId` varchar(64) NOT NULL,
  `semanticKey` varchar(128) NOT NULL,
  `kind` varchar(64) NOT NULL,
  `status` varchar(32) NOT NULL,
  `validFromIndex` int NOT NULL,
  `validUntilIndex` int,
  `payloadHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionSemanticGraphIndexV2_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionSemanticGraphIndexV2_node_uq` UNIQUE(`graphReceiptId`,`nodeId`),
  INDEX `aurionSemanticGraphIndexV2_lookup_idx`(`npcId`,`kind`,`status`,`semanticKey`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticGraphReceiptsV2_no_update` BEFORE UPDATE ON `aurionSemanticGraphReceiptsV2` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_GRAPH_V2_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticGraphReceiptsV2_no_delete` BEFORE DELETE ON `aurionSemanticGraphReceiptsV2` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_GRAPH_V2_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticGraphNodesV2_no_update` BEFORE UPDATE ON `aurionSemanticGraphNodesV2` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_GRAPH_V2_NODES_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticGraphNodesV2_no_delete` BEFORE DELETE ON `aurionSemanticGraphNodesV2` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_GRAPH_V2_NODES_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticGraphEdgesV2_no_update` BEFORE UPDATE ON `aurionSemanticGraphEdgesV2` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_GRAPH_V2_EDGES_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticGraphEdgesV2_no_delete` BEFORE DELETE ON `aurionSemanticGraphEdgesV2` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_GRAPH_V2_EDGES_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticGraphProvenanceV2_no_update` BEFORE UPDATE ON `aurionSemanticGraphProvenanceV2` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_GRAPH_V2_PROVENANCE_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionSemanticGraphProvenanceV2_no_delete` BEFORE DELETE ON `aurionSemanticGraphProvenanceV2` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_SEMANTIC_GRAPH_V2_PROVENANCE_APPEND_ONLY';
--> statement-breakpoint
CREATE TABLE `aurionNpcActionEpochSourceReceipts` (
  `id` varchar(96) NOT NULL,
  `hubId` varchar(96) NOT NULL,
  `previousSourceRevision` varchar(40) NOT NULL,
  `previousSourceSha256` varchar(64) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `capsuleManifestSha256` varchar(64) NOT NULL,
  `marketVersion` int NOT NULL,
  `marketHash` varchar(64) NOT NULL,
  `inventoryHash` varchar(64) NOT NULL,
  `polityVersion` int NOT NULL,
  `polityStateHash` varchar(64) NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcActionEpochSourceReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionNpcActionEpochSourceReceipts_hash_uq` UNIQUE(`receiptHash`),
  CONSTRAINT `aurionNpcActionEpochSourceReceipts_transition_uq` UNIQUE(`hubId`,`previousSourceRevision`,`sourceRevision`,`marketVersion`,`polityVersion`),
  INDEX `aurionNpcActionEpochSourceReceipts_hub_idx`(`hubId`,`createdAt`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionEpochSourceReceipts_no_update` BEFORE UPDATE ON `aurionNpcActionEpochSourceReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_EPOCH_SOURCE_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionEpochSourceReceipts_no_delete` BEFORE DELETE ON `aurionNpcActionEpochSourceReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_EPOCH_SOURCE_RECEIPTS_APPEND_ONLY';
