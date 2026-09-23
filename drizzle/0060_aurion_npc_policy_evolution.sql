CREATE TABLE `aurionNpcPolicyVersions` (
  `id` varchar(128) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `version` int NOT NULL,
  `policyHash` varchar(64) NOT NULL,
  `payloadJson` text NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionNpcPolicyVersions_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aurionNpcPolicyVersions_npc_ver_uq` (`npcId`,`version`),
  UNIQUE KEY `aurionNpcPolicyVersions_npc_hash_uq` (`npcId`,`policyHash`),
  KEY `aurionNpcPolicyVersions_npc_idx` (`npcId`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcPolicyVersions_no_update` BEFORE UPDATE ON `aurionNpcPolicyVersions` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_POLICY_VERSIONS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcPolicyVersions_no_delete` BEFORE DELETE ON `aurionNpcPolicyVersions` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_POLICY_VERSIONS_APPEND_ONLY';
--> statement-breakpoint
CREATE TABLE `aurionNpcPolicyActivePointers` (
  `npcId` varchar(96) NOT NULL,
  `activeVersionId` varchar(128) NOT NULL,
  `activePolicyHash` varchar(64) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcPolicyActivePointers_npcId` PRIMARY KEY (`npcId`)
);
--> statement-breakpoint
CREATE TABLE `aurionNpcPolicyMutationReceipts` (
  `id` varchar(128) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `previousVersionId` varchar(128),
  `previousPolicyHash` varchar(64),
  `nextVersionId` varchar(128),
  `nextPolicyHash` varchar(64),
  `rejectedCandidateHash` varchar(64),
  `verdict` varchar(32) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `provenanceDigest` varchar(255) NOT NULL,
  `evidenceWindowJson` text NOT NULL,
  `fitnessContractVersion` varchar(64) NOT NULL,
  `fitnessResultDigest` varchar(64) NOT NULL,
  `mutationRuleVersion` varchar(64) NOT NULL,
  `envelopeHash` varchar(64) NOT NULL,
  `rollbackTargetVersion` int,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionNpcPolicyMutationReceipts_id` PRIMARY KEY (`id`),
  KEY `aurionNpcPolicyMutationReceipts_npc_idx` (`npcId`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcPolicyMutationReceipts_no_update` BEFORE UPDATE ON `aurionNpcPolicyMutationReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_POLICY_MUTATION_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcPolicyMutationReceipts_no_delete` BEFORE DELETE ON `aurionNpcPolicyMutationReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_POLICY_MUTATION_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TABLE `aurionNpcPolicyRollbackReceipts` (
  `id` varchar(128) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `mutationReceiptId` varchar(128) NOT NULL,
  `requestedVersionId` varchar(128) NOT NULL,
  `requestedPolicyHash` varchar(64) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `adminUserId` varchar(128) NOT NULL,
  `wasdVerifiedReceiptId` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionNpcPolicyRollbackReceipts_id` PRIMARY KEY (`id`),
  KEY `aurionNpcPolicyRollbackReceipts_npc_idx` (`npcId`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcPolicyRollbackReceipts_no_update` BEFORE UPDATE ON `aurionNpcPolicyRollbackReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_POLICY_ROLLBACK_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcPolicyRollbackReceipts_no_delete` BEFORE DELETE ON `aurionNpcPolicyRollbackReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_POLICY_ROLLBACK_RECEIPTS_APPEND_ONLY';
