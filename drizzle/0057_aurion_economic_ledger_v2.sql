CREATE TABLE `aurionEconomicProjectionIntents` (
  `intentId` varchar(96) NOT NULL,
  `sourceKind` enum('trade_crafting','loot_v2','market_transaction','system_sale','guild_bank','progression_points') NOT NULL,
  `sourceId` varchar(128) NOT NULL,
  `sourceEvidenceHash` varchar(96) NOT NULL,
  `intentHash` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionEconomicProjectionIntents_intentId` PRIMARY KEY (`intentId`),
  UNIQUE KEY `aurionEconomicProjectionIntents_source_uq` (`sourceKind`,`sourceId`),
  UNIQUE KEY `aurionEconomicProjectionIntents_hash_uq` (`intentHash`)
);
--> statement-breakpoint
CREATE TABLE `aurionEconomicLedgerCoordinator` (
  `worldId` varchar(64) NOT NULL,
  `nextOrdinal` bigint unsigned NOT NULL DEFAULT 1,
  CONSTRAINT `aurionEconomicLedgerCoordinator_worldId` PRIMARY KEY (`worldId`)
);
--> statement-breakpoint
CREATE TABLE `aurionEconomicEvents` (
  `eventId` varchar(96) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `epoch` int NOT NULL,
  `ordinal` bigint unsigned NOT NULL,
  `eventType` enum('economic_transition') NOT NULL,
  `sourceKind` enum('trade_crafting','loot_v2','market_transaction','system_sale','guild_bank','progression_points') NOT NULL,
  `sourceId` varchar(128) NOT NULL,
  `sourceEvidenceHash` varchar(96) NOT NULL,
  `temporalEventId` varchar(96) NOT NULL,
  `temporalEventHash` varchar(96) NOT NULL,
  `sourceWorldRoot` varchar(96) NOT NULL,
  `sourceRevision` varchar(64) NOT NULL,
  `rulesetVersion` varchar(64) NOT NULL,
  `eventHash` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionEconomicEvents_eventId` PRIMARY KEY (`eventId`),
  UNIQUE KEY `aurionEconomicEvents_world_ordinal_uq` (`worldId`,`ordinal`),
  UNIQUE KEY `aurionEconomicEvents_event_hash_uq` (`eventHash`),
  UNIQUE KEY `aurionEconomicEvents_source_uq` (`sourceKind`,`sourceId`),
  KEY `aurionEconomicEvents_world_epoch_idx` (`worldId`,`epoch`)
);
--> statement-breakpoint
CREATE TABLE `aurionEconomicResourceDeltas` (
  `eventId` varchar(96) NOT NULL,
  `resourceId` varchar(96) NOT NULL,
  `accountId` varchar(128) NOT NULL,
  `deltaExact` varchar(128) NOT NULL,
  CONSTRAINT `aurionEconomicResourceDeltas_pk` PRIMARY KEY (`eventId`,`resourceId`,`accountId`),
  KEY `aurionEconomicResourceDeltas_resource_account_idx` (`resourceId`,`accountId`)
);
--> statement-breakpoint
CREATE TABLE `aurionEconomicAssetTransitions` (
  `eventId` varchar(96) NOT NULL,
  `assetId` varchar(128) NOT NULL,
  `transitionKind` enum('create','transfer','consume') NOT NULL,
  `fromOwnerId` varchar(128),
  `toOwnerId` varchar(128),
  CONSTRAINT `aurionEconomicAssetTransitions_pk` PRIMARY KEY (`eventId`,`assetId`),
  KEY `aurionEconomicAssetTransitions_asset_idx` (`assetId`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionEconomicEvents_no_update` BEFORE UPDATE ON `aurionEconomicEvents` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_ECONOMIC_LEDGER_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionEconomicEvents_no_delete` BEFORE DELETE ON `aurionEconomicEvents` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_ECONOMIC_LEDGER_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionEconomicResourceDeltas_no_update` BEFORE UPDATE ON `aurionEconomicResourceDeltas` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_ECONOMIC_LEDGER_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionEconomicResourceDeltas_no_delete` BEFORE DELETE ON `aurionEconomicResourceDeltas` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_ECONOMIC_LEDGER_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionEconomicAssetTransitions_no_update` BEFORE UPDATE ON `aurionEconomicAssetTransitions` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_ECONOMIC_LEDGER_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionEconomicAssetTransitions_no_delete` BEFORE DELETE ON `aurionEconomicAssetTransitions` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_ECONOMIC_LEDGER_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionEconomicProjectionIntents_no_update` BEFORE UPDATE ON `aurionEconomicProjectionIntents` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_ECONOMIC_INTENT_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionEconomicProjectionIntents_no_delete` BEFORE DELETE ON `aurionEconomicProjectionIntents` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_ECONOMIC_INTENT_APPEND_ONLY';
