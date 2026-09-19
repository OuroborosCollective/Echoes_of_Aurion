CREATE TABLE `aurionNpcActionEpochStates` (
  `hubId` varchar(96) NOT NULL,
  `active` boolean NOT NULL DEFAULT true,
  `marketVersion` int NOT NULL,
  `marketJson` text NOT NULL,
  `marketHash` varchar(64) NOT NULL,
  `inventoryJson` text NOT NULL,
  `inventoryHash` varchar(64) NOT NULL,
  `polityVersion` int NOT NULL,
  `polityId` varchar(96) NOT NULL,
  `polityStability` int NOT NULL,
  `polityStateHash` varchar(64) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcActionEpochStates_hubId` PRIMARY KEY(`hubId`),
  CONSTRAINT `aurionNpcActionEpochStates_market_version_ck` CHECK (`marketVersion` >= 0),
  CONSTRAINT `aurionNpcActionEpochStates_polity_version_ck` CHECK (`polityVersion` >= 0),
  CONSTRAINT `aurionNpcActionEpochStates_polity_stability_ck` CHECK (`polityStability` >= 0 and `polityStability` <= 100),
  INDEX `aurionNpcActionEpochStates_active_idx` (`active`)
);
--> statement-breakpoint
CREATE TABLE `aurionNpcActionLeases` (
  `id` varchar(96) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `intentId` varchar(96) NOT NULL,
  `targetId` varchar(128) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `lockedStateHash` varchar(64) NOT NULL,
  `issuedAtLogicalIndex` int NOT NULL,
  `expiresAtLogicalIndex` int NOT NULL,
  `state` enum('active','consumed','revoked') NOT NULL,
  `leaseJson` text NOT NULL,
  `leaseHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcActionLeases_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionNpcActionLeases_intent_uq` UNIQUE(`intentId`),
  CONSTRAINT `aurionNpcActionLeases_hash_uq` UNIQUE(`leaseHash`),
  INDEX `aurionNpcActionLeases_npc_state_idx` (`npcId`,`state`)
);
--> statement-breakpoint
CREATE TABLE `aurionNpcActionConsentReceipts` (
  `id` varchar(96) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `sourceDecisionReceiptId` varchar(64) NOT NULL,
  `intentId` varchar(96) NOT NULL,
  `verdict` enum('NOT_REQUIRED','ALLOW','DENY') NOT NULL,
  `policyVersion` varchar(96) NOT NULL,
  `policyHash` varchar(64) NOT NULL,
  `consentHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcActionConsentReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionNpcActionConsentReceipts_intent_uq` UNIQUE(`intentId`),
  CONSTRAINT `aurionNpcActionConsentReceipts_hash_uq` UNIQUE(`consentHash`)
);
--> statement-breakpoint
CREATE TABLE `aurionNpcActionReceipts` (
  `id` varchar(96) NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `sourceDecisionReceiptId` varchar(64) NOT NULL,
  `sourceDecisionSha256` varchar(64) NOT NULL,
  `sourcePlanHash` varchar(64) NOT NULL,
  `sourceGoal` varchar(64) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceSha256` varchar(64) NOT NULL,
  `capsuleManifestSha256` varchar(64) NOT NULL,
  `intentId` varchar(96) NOT NULL,
  `intentHash` varchar(64) NOT NULL,
  `leaseId` varchar(96) NOT NULL,
  `effectsHash` varchar(64) NOT NULL,
  `effectSetJson` mediumtext NOT NULL,
  `expectedMarketVersion` int NOT NULL,
  `expectedMarketHash` varchar(64) NOT NULL,
  `expectedPolityVersion` int NOT NULL,
  `expectedPolityHash` varchar(64) NOT NULL,
  `expectedInventoryHash` varchar(64) NOT NULL,
  `expectedTargetHash` varchar(64) NOT NULL,
  `consentReceiptId` varchar(96) NOT NULL,
  `successorNpcReceiptId` varchar(64) NOT NULL,
  `successorWorldReceiptId` varchar(64) NOT NULL,
  `successorPolityHash` varchar(64) NOT NULL,
  `successorMarketHash` varchar(64) NOT NULL,
  `successorInventoryHash` varchar(64) NOT NULL,
  `receiptJson` mediumtext NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcActionReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionNpcActionReceipts_hash_uq` UNIQUE(`receiptHash`),
  CONSTRAINT `aurionNpcActionReceipts_source_uq` UNIQUE(`sourceDecisionReceiptId`),
  CONSTRAINT `aurionNpcActionReceipts_intent_uq` UNIQUE(`intentId`),
  CONSTRAINT `aurionNpcActionReceipts_lease_uq` UNIQUE(`leaseId`),
  INDEX `aurionNpcActionReceipts_npc_index_idx` (`npcId`,`resolutionIndex`)
);
--> statement-breakpoint
CREATE TABLE `aurionNpcActionEffectReadbacks` (
  `id` varchar(96) NOT NULL,
  `actionReceiptId` varchar(96) NOT NULL,
  `effectsHash` varchar(64) NOT NULL,
  `npcReceiptId` varchar(64) NOT NULL,
  `npcDecisionHash` varchar(64) NOT NULL,
  `worldReceiptId` varchar(64) NOT NULL,
  `worldReactionHash` varchar(64) NOT NULL,
  `polityId` varchar(96) NOT NULL,
  `polityStateHash` varchar(64) NOT NULL,
  `marketStateHash` varchar(64) NOT NULL,
  `inventoryStateHash` varchar(64) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `readbackHash` varchar(64) NOT NULL,
  `readbackJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcActionEffectReadbacks_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionNpcActionEffectReadbacks_action_uq` UNIQUE(`actionReceiptId`),
  CONSTRAINT `aurionNpcActionEffectReadbacks_hash_uq` UNIQUE(`readbackHash`)
);
--> statement-breakpoint
CREATE TABLE `aurionNpcActionMemoryLinks` (
  `id` varchar(96) NOT NULL,
  `actionReceiptId` varchar(96) NOT NULL,
  `effectReadbackId` varchar(96) NOT NULL,
  `memoryReceiptId` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `linkHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcActionMemoryLinks_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionNpcActionMemoryLinks_action_uq` UNIQUE(`actionReceiptId`),
  CONSTRAINT `aurionNpcActionMemoryLinks_memory_uq` UNIQUE(`memoryReceiptId`),
  CONSTRAINT `aurionNpcActionMemoryLinks_hash_uq` UNIQUE(`linkHash`)
);
--> statement-breakpoint
INSERT INTO `aurionNpcActionEpochStates` (`hubId`,`active`,`marketVersion`,`marketJson`,`marketHash`,`inventoryJson`,`inventoryHash`,`polityVersion`,`polityId`,`polityStability`,`polityStateHash`,`sourceRevision`,`sourceSha256`) VALUES
('observatory_threshold',true,0,'{"hubId":"observatory_threshold","controllingGuild":"Order of Aurion","taxRateBasisPoints":400,"treasuryCopper":500000,"stock":{"grain":150,"sandstone":100,"bronze":80,"aether":40,"salve":60,"rune_core":25}}','781a2fc029fcce8c1a2f6566752783a4035513c93128ba64963a6d902dd0c64a','{"ownerId":"market:observatory_threshold","entries":[{"itemId":"grain","quantity":150,"capacity":1000000},{"itemId":"sandstone","quantity":100,"capacity":1000000},{"itemId":"bronze","quantity":80,"capacity":1000000},{"itemId":"aether","quantity":40,"capacity":1000000},{"itemId":"salve","quantity":60,"capacity":1000000},{"itemId":"rune_core","quantity":25,"capacity":1000000}],"stateHash":"775f82d54bed12870e228b96bbcb6f99c1c027ebdeed3b2156f354494af15739"}','775f82d54bed12870e228b96bbcb6f99c1c027ebdeed3b2156f354494af15739',0,'polity:observatory_threshold',72,'fd4e0a1d6e58fddf9f4c657f5f3521ac994d11fbf223d5dc22a565b59cd7116e','002e7c35309816cd043295f47398e52fdb388694','7a524e3d329dd34205c41fdc00dc088e3b3187ab39c9f17a42a0c2cd8294e82f'),
('windhollow',true,0,'{"hubId":"windhollow","controllingGuild":"Aethelgard Pioneers","taxRateBasisPoints":250,"treasuryCopper":280000,"stock":{"grain":600,"sandstone":120,"bronze":30,"aether":15,"salve":40,"rune_core":5}}','e2f5e555ab6e77b4cde8548b469245e857584679c0ce3f6635e9c27707b2f19e','{"ownerId":"market:windhollow","entries":[{"itemId":"grain","quantity":600,"capacity":1000000},{"itemId":"sandstone","quantity":120,"capacity":1000000},{"itemId":"bronze","quantity":30,"capacity":1000000},{"itemId":"aether","quantity":15,"capacity":1000000},{"itemId":"salve","quantity":40,"capacity":1000000},{"itemId":"rune_core","quantity":5,"capacity":1000000}],"stateHash":"e5c7a61c605042152d5a0b2d7775c7f390dcbe0e2178e2a5ff390c3cc3aa994e"}','e5c7a61c605042152d5a0b2d7775c7f390dcbe0e2178e2a5ff390c3cc3aa994e',0,'polity:windhollow',72,'a164c19e9bb3d35c7ac846e6a1f3d175efaedc090d4d0a54b664142e1e6b53ca','002e7c35309816cd043295f47398e52fdb388694','7a524e3d329dd34205c41fdc00dc088e3b3187ab39c9f17a42a0c2cd8294e82f'),
('emberfall',true,0,'{"hubId":"emberfall","controllingGuild":"Bronze Syndicate","taxRateBasisPoints":550,"treasuryCopper":420000,"stock":{"grain":80,"sandstone":450,"bronze":350,"aether":20,"salve":25,"rune_core":10}}','b8f0e2ed6e8898c28aa9ea9726f8fad67be336b9bb4e17441cd2ee67f8ae90fb','{"ownerId":"market:emberfall","entries":[{"itemId":"grain","quantity":80,"capacity":1000000},{"itemId":"sandstone","quantity":450,"capacity":1000000},{"itemId":"bronze","quantity":350,"capacity":1000000},{"itemId":"aether","quantity":20,"capacity":1000000},{"itemId":"salve","quantity":25,"capacity":1000000},{"itemId":"rune_core","quantity":10,"capacity":1000000}],"stateHash":"3e571602605d2fe258ca6e949a6a2a09d0613d13739f96fc222aa309f7a1afb2"}','3e571602605d2fe258ca6e949a6a2a09d0613d13739f96fc222aa309f7a1afb2',0,'polity:emberfall',72,'de9e93f260760e1a945c43760020194e1a24bec2e8ef0c54f3a55a00431e1c3f','002e7c35309816cd043295f47398e52fdb388694','7a524e3d329dd34205c41fdc00dc088e3b3187ab39c9f17a42a0c2cd8294e82f'),
('cinder_vault',true,0,'{"hubId":"cinder_vault","controllingGuild":"Starforged Sentinels","taxRateBasisPoints":600,"treasuryCopper":610000,"stock":{"grain":40,"sandstone":90,"bronze":60,"aether":180,"salve":30,"rune_core":80}}','fec38bd331aa5838fac65fd3048c06974f8cd6855a42b7f423099d46d74bd33b','{"ownerId":"market:cinder_vault","entries":[{"itemId":"grain","quantity":40,"capacity":1000000},{"itemId":"sandstone","quantity":90,"capacity":1000000},{"itemId":"bronze","quantity":60,"capacity":1000000},{"itemId":"aether","quantity":180,"capacity":1000000},{"itemId":"salve","quantity":30,"capacity":1000000},{"itemId":"rune_core","quantity":80,"capacity":1000000}],"stateHash":"e9ffa07401c72b6e7ce2e76d8b2529a574a95efb3222179f364883fed8ca247f"}','e9ffa07401c72b6e7ce2e76d8b2529a574a95efb3222179f364883fed8ca247f',0,'polity:cinder_vault',72,'3597ce07bc2c14a70d1ca7f80b521c23bc6cc14374cc3b12c307ca108b36fce2','002e7c35309816cd043295f47398e52fdb388694','7a524e3d329dd34205c41fdc00dc088e3b3187ab39c9f17a42a0c2cd8294e82f');
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionConsentReceipts_no_update` BEFORE UPDATE ON `aurionNpcActionConsentReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_CONSENT_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionConsentReceipts_no_delete` BEFORE DELETE ON `aurionNpcActionConsentReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_CONSENT_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionReceipts_no_update` BEFORE UPDATE ON `aurionNpcActionReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionReceipts_no_delete` BEFORE DELETE ON `aurionNpcActionReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionEffectReadbacks_no_update` BEFORE UPDATE ON `aurionNpcActionEffectReadbacks` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_READBACKS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionEffectReadbacks_no_delete` BEFORE DELETE ON `aurionNpcActionEffectReadbacks` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_READBACKS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionMemoryLinks_no_update` BEFORE UPDATE ON `aurionNpcActionMemoryLinks` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_MEMORY_LINKS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcActionMemoryLinks_no_delete` BEFORE DELETE ON `aurionNpcActionMemoryLinks` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_NPC_ACTION_MEMORY_LINKS_APPEND_ONLY';
