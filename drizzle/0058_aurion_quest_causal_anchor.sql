CREATE TABLE `aurionQuestCausalAnchors` (
  `id` varchar(96) NOT NULL,
  `questReceiptId` varchar(128) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `epoch` int NOT NULL,
  `zoneId` varchar(64) NOT NULL,
  `tick` int NOT NULL,
  `causalReceiptHash` varchar(96) NOT NULL,
  `sourceWorldRoot` varchar(96) NOT NULL,
  `sourceRevision` varchar(64) NOT NULL,
  `rulesetVersion` varchar(64) NOT NULL,
  `sourceEvidenceId` varchar(128) NOT NULL,
  `sourceEvidenceDigest` varchar(64) NOT NULL,
  `sourceLogicalRevision` int NOT NULL,
  `triggerEventId` varchar(128) NOT NULL,
  `triggerEventDigest` varchar(128) NOT NULL,
  `compilerVersion` varchar(64) NOT NULL,
  `templateSetHash` varchar(64) NOT NULL,
  `candidateSetHash` varchar(64) NOT NULL,
  `seedDigest` varchar(64) NOT NULL,
  `roleBindingHash` varchar(64) NOT NULL,
  `commandId` varchar(64) NOT NULL,
  `planHash` varchar(64) NOT NULL,
  `graphHash` varchar(64) NOT NULL,
  `previousStateHash` varchar(64) NOT NULL,
  `resultStateHash` varchar(64) NOT NULL,
  `anchorHash` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionQuestCausalAnchors_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aurionQuestCausalAnchors_receipt_uq` (`questReceiptId`),
  UNIQUE KEY `aurionQuestCausalAnchors_anchor_uq` (`anchorHash`),
  KEY `aurionQuestCausalAnchors_causal_receipt_idx` (`causalReceiptHash`),
  KEY `aurionQuestCausalAnchors_world_epoch_idx` (`worldId`,`epoch`),
  KEY `aurionQuestCausalAnchors_world_source_idx` (`worldId`,`sourceEvidenceId`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionQuestCausalAnchors_no_update` BEFORE UPDATE ON `aurionQuestCausalAnchors` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_QUEST_CAUSAL_ANCHOR_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionQuestCausalAnchors_no_delete` BEFORE DELETE ON `aurionQuestCausalAnchors` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_QUEST_CAUSAL_ANCHOR_APPEND_ONLY';
