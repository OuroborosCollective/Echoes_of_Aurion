ALTER TABLE `itemInstances` MODIFY COLUMN `status` enum('owned','listed','sold','consumed','guild_custody') NOT NULL DEFAULT 'owned';--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` MODIFY COLUMN `status` enum('owned','listed','sold','consumed','guild_custody') NOT NULL DEFAULT 'owned';--> statement-breakpoint
CREATE TABLE `aurionGuildTreasuryAccounts` (
  `guildId` varchar(64) NOT NULL,
  `balance` bigint unsigned NOT NULL DEFAULT 0,
  `revision` bigint unsigned NOT NULL DEFAULT 0,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  CONSTRAINT `aurionGuildTreasuryAccounts_pk` PRIMARY KEY (`guildId`)
);--> statement-breakpoint
CREATE TABLE `aurionGuildBankPlans` (
  `confirmationHash` varchar(64) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `actorUserId` int NOT NULL,
  `operation` enum('deposit_points','withdraw_points','deposit_item','withdraw_item','donate_resource_item','upgrade_building') NOT NULL,
  `requiredCapability` enum('member_manage','diplomacy_manage','territory_manage','bank_deposit','bank_withdraw','building_manage','kingdom_consolidate') NOT NULL,
  `expectedRevision` bigint unsigned NOT NULL,
  `idempotencyKey` varchar(160) NOT NULL,
  `payloadHash` varchar(64) NOT NULL,
  `payloadJson` longtext NOT NULL,
  `resourcesJson` longtext NOT NULL,
  `planJson` longtext NOT NULL,
  `status` enum('planned','consumed','expired') NOT NULL DEFAULT 'planned',
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `consumedAt` timestamp NULL DEFAULT NULL,
  CONSTRAINT `aurionGuildBankPlans_pk` PRIMARY KEY (`confirmationHash`),
  CONSTRAINT `aurionGuildBankPlans_idempotency_uq` UNIQUE (`idempotencyKey`),
  INDEX `aurionGuildBankPlans_actor_status_idx` (`actorUserId`,`status`,`expiresAt`)
);--> statement-breakpoint
CREATE TABLE `aurionGuildBankReceipts` (
  `receiptId` varchar(64) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `actorUserId` int NOT NULL,
  `operation` enum('deposit_points','withdraw_points','deposit_item','withdraw_item','donate_resource_item','upgrade_building') NOT NULL,
  `expectedRevision` bigint unsigned NOT NULL,
  `resultingRevision` bigint unsigned NOT NULL,
  `idempotencyKey` varchar(160) NOT NULL,
  `confirmationHash` varchar(64) NOT NULL,
  `requestHash` varchar(64) NOT NULL,
  `resultHash` varchar(64) NOT NULL,
  `resultJson` longtext NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT `aurionGuildBankReceipts_pk` PRIMARY KEY (`receiptId`),
  CONSTRAINT `aurionGuildBankReceipts_idempotency_uq` UNIQUE (`idempotencyKey`),
  CONSTRAINT `aurionGuildBankReceipts_confirmation_uq` UNIQUE (`confirmationHash`),
  CONSTRAINT `aurionGuildBankReceipts_guild_revision_uq` UNIQUE (`guildId`,`resultingRevision`),
  INDEX `aurionGuildBankReceipts_guild_created_idx` (`guildId`,`createdAt`)
);--> statement-breakpoint
CREATE TABLE `aurionGuildTreasuryLedger` (
  `entryId` varchar(64) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `actorUserId` int NOT NULL,
  `receiptId` varchar(64) NOT NULL,
  `direction` enum('credit','debit') NOT NULL,
  `reason` enum('player_deposit','player_withdrawal','building_upgrade') NOT NULL,
  `amount` bigint unsigned NOT NULL,
  `balanceBefore` bigint unsigned NOT NULL,
  `balanceAfter` bigint unsigned NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT `aurionGuildTreasuryLedger_pk` PRIMARY KEY (`entryId`),
  CONSTRAINT `aurionGuildTreasuryLedger_receipt_uq` UNIQUE (`receiptId`),
  INDEX `aurionGuildTreasuryLedger_guild_created_idx` (`guildId`,`createdAt`)
);--> statement-breakpoint
CREATE TABLE `aurionGuildItemCustody` (
  `custodyId` varchar(64) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `itemRecordVersion` enum('legacy','aurion_v2') NOT NULL,
  `itemId` varchar(64) NOT NULL,
  `depositorUserId` int NOT NULL,
  `currentRecipientUserId` int DEFAULT NULL,
  `status` enum('held','withdrawn') NOT NULL DEFAULT 'held',
  `revision` bigint unsigned NOT NULL,
  `depositReceiptId` varchar(64) NOT NULL,
  `withdrawalReceiptId` varchar(64) DEFAULT NULL,
  `depositedAt` timestamp NOT NULL DEFAULT current_timestamp(),
  `withdrawnAt` timestamp NULL DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  CONSTRAINT `aurionGuildItemCustody_pk` PRIMARY KEY (`custodyId`),
  CONSTRAINT `aurionGuildItemCustody_item_uq` UNIQUE (`itemRecordVersion`,`itemId`),
  INDEX `aurionGuildItemCustody_guild_status_idx` (`guildId`,`status`,`updatedAt`)
);--> statement-breakpoint
CREATE TABLE `aurionGuildItemCustodyLedger` (
  `eventId` varchar(64) NOT NULL,
  `custodyId` varchar(64) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `itemRecordVersion` enum('legacy','aurion_v2') NOT NULL,
  `itemId` varchar(64) NOT NULL,
  `actorUserId` int NOT NULL,
  `eventType` enum('deposit','withdrawal') NOT NULL,
  `receiptId` varchar(64) NOT NULL,
  `previousOwnerUserId` int NOT NULL,
  `resultingOwnerUserId` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT `aurionGuildItemCustodyLedger_pk` PRIMARY KEY (`eventId`),
  CONSTRAINT `aurionGuildItemCustodyLedger_receipt_uq` UNIQUE (`receiptId`),
  INDEX `aurionGuildItemCustodyLedger_custody_created_idx` (`custodyId`,`createdAt`)
);--> statement-breakpoint
CREATE TABLE `aurionGuildResourceAccounts` (
  `id` varchar(160) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `resourceKey` enum('wood','stone','aether') NOT NULL,
  `balance` bigint unsigned NOT NULL DEFAULT 0,
  `revision` bigint unsigned NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  CONSTRAINT `aurionGuildResourceAccounts_pk` PRIMARY KEY (`id`),
  CONSTRAINT `aurionGuildResourceAccounts_guild_resource_uq` UNIQUE (`guildId`,`resourceKey`)
);--> statement-breakpoint
CREATE TABLE `aurionGuildResourceLedger` (
  `entryId` varchar(64) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `resourceKey` enum('wood','stone','aether') NOT NULL,
  `direction` enum('credit','debit') NOT NULL,
  `amount` bigint unsigned NOT NULL,
  `balanceBefore` bigint unsigned NOT NULL,
  `balanceAfter` bigint unsigned NOT NULL,
  `sourceItemRecordVersion` enum('legacy','aurion_v2') DEFAULT NULL,
  `sourceItemId` varchar(64) DEFAULT NULL,
  `sourceReceiptId` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT `aurionGuildResourceLedger_pk` PRIMARY KEY (`entryId`),
  CONSTRAINT `aurionGuildResourceLedger_receipt_resource_uq` UNIQUE (`sourceReceiptId`,`resourceKey`),
  INDEX `aurionGuildResourceLedger_guild_created_idx` (`guildId`,`createdAt`)
);--> statement-breakpoint
CREATE TABLE `aurionGuildBuildings` (
  `id` varchar(160) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `buildingId` varchar(96) NOT NULL,
  `level` bigint unsigned NOT NULL DEFAULT 0,
  `revision` bigint unsigned NOT NULL DEFAULT 0,
  `upgradeReceiptId` varchar(64) DEFAULT NULL,
  `projectionJson` longtext NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  CONSTRAINT `aurionGuildBuildings_pk` PRIMARY KEY (`id`),
  CONSTRAINT `aurionGuildBuildings_guild_building_uq` UNIQUE (`guildId`,`buildingId`),
  INDEX `aurionGuildBuildings_guild_level_idx` (`guildId`,`level`)
);
