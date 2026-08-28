CREATE TABLE IF NOT EXISTS `aurionLootBaseDefinitions` (
  `id` varchar(96) NOT NULL,
  `category` enum('weapon','armor','accessory','focus','relic','crafting_component','shaping_component') NOT NULL,
  `equipmentSlot` enum('main_hand','off_hand','head','chest','hands','legs','feet','belt','ring','amulet','focus','relic') DEFAULT NULL,
  `familyId` varchar(64) NOT NULL,
  `minItemLevelExact` varchar(128) NOT NULL,
  `maxItemLevelExact` varchar(128) DEFAULT NULL,
  `baseStatsJson` text NOT NULL,
  `affixSlotsJson` text NOT NULL,
  `tagsJson` text NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `active` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `aurionLootBaseDefinitions_active_category_idx` (`active`,`category`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionLootAffixDefinitions` (
  `id` varchar(96) NOT NULL,
  `slot` enum('prefix','suffix','implicit','corruption','craft') NOT NULL,
  `groupId` varchar(64) NOT NULL,
  `minItemLevelExact` varchar(128) NOT NULL,
  `maxItemLevelExact` varchar(128) DEFAULT NULL,
  `allowedCategoriesJson` text NOT NULL,
  `requiredTagsJson` text NOT NULL,
  `excludesGroupIdsJson` text NOT NULL,
  `statRangesJson` text NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `active` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `aurionLootAffixDefinitions_active_slot_idx` (`active`,`slot`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionLootSetDefinitions` (
  `id` varchar(96) NOT NULL,
  `pieceBaseItemIdsJson` text NOT NULL,
  `bonusesByPiecesJson` text NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `active` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `aurionLootSetDefinitions_active_idx` (`active`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionEquipmentSlots` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `slot` enum('main_hand','off_hand','head','chest','hands','legs','feet','belt','ring','amulet','focus','relic') NOT NULL,
  `itemRecordVersion` enum('legacy','aurion_v2') NOT NULL DEFAULT 'aurion_v2',
  `itemId` varchar(64) NOT NULL,
  `equippedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionEquipmentSlots_user_slot_uq` (`userId`,`slot`),
  UNIQUE KEY `aurionEquipmentSlots_item_uq` (`itemId`),
  KEY `aurionEquipmentSlots_user_equipped_idx` (`userId`,`equippedAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionMasteryEvents` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `disciplineId` varchar(64) NOT NULL,
  `source` enum('encounter','quest','crafting','shaping','civic','diplomacy','world_stewardship') NOT NULL,
  `amountExact` varchar(128) NOT NULL,
  `sourceReceiptId` varchar(64) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionMasteryEvents_idempotency_uq` (`idempotencyKey`),
  UNIQUE KEY `aurionMasteryEvents_user_receipt_discipline_uq` (`userId`,`sourceReceiptId`,`disciplineId`),
  KEY `aurionMasteryEvents_user_discipline_created_idx` (`userId`,`disciplineId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionEthosEvents` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `sourceReceiptId` varchar(64) NOT NULL,
  `deltasBpsJson` text NOT NULL,
  `resolutionIndex` int NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionEthosEvents_idempotency_uq` (`idempotencyKey`),
  UNIQUE KEY `aurionEthosEvents_user_receipt_uq` (`userId`,`sourceReceiptId`),
  KEY `aurionEthosEvents_user_created_idx` (`userId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionLootDropReceiptsV2` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `encounterReceiptId` varchar(64) NOT NULL,
  `itemDefinitionId` varchar(96) NOT NULL,
  `category` enum('weapon','armor','accessory','focus','relic','crafting_component','shaping_component') NOT NULL,
  `quality` enum('normal','magic','rare','set','unique','mythic') NOT NULL,
  `itemLevelExact` varchar(128) NOT NULL,
  `setId` varchar(96) DEFAULT NULL,
  `resolvedJson` text NOT NULL,
  `contextHash` varchar(64) NOT NULL,
  `deterministicHash` varchar(64) NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionLootDropReceiptsV2_idempotency_uq` (`idempotencyKey`),
  UNIQUE KEY `aurionLootDropReceiptsV2_user_encounter_uq` (`userId`,`encounterReceiptId`),
  KEY `aurionLootDropReceiptsV2_user_created_idx` (`userId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionItemInstancesV2` (
  `id` varchar(64) NOT NULL,
  `ownerUserId` int NOT NULL,
  `lootReceiptId` varchar(64) NOT NULL,
  `baseItemDefinitionId` varchar(96) NOT NULL,
  `category` enum('weapon','armor','accessory','focus','relic','crafting_component','shaping_component') NOT NULL,
  `equipmentSlot` enum('main_hand','off_hand','head','chest','hands','legs','feet','belt','ring','amulet','focus','relic') DEFAULT NULL,
  `quality` enum('normal','magic','rare','set','unique','mythic') NOT NULL,
  `itemLevelExact` varchar(128) NOT NULL,
  `affixesJson` text NOT NULL,
  `setId` varchar(96) DEFAULT NULL,
  `itemPower` int NOT NULL,
  `deterministicHash` varchar(64) NOT NULL,
  `status` enum('owned','listed','sold','consumed') NOT NULL DEFAULT 'owned',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `aurionItemInstancesV2_loot_receipt_uq` (`lootReceiptId`),
  KEY `aurionItemInstancesV2_owner_status_created_idx` (`ownerUserId`,`status`,`createdAt`)
);
