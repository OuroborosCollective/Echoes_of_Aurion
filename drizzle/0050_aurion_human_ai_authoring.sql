CREATE TABLE IF NOT EXISTS `aurionWorldDesignVersions` (
  `id` varchar(128) NOT NULL,
  `designKey` varchar(96) NOT NULL,
  `version` int NOT NULL,
  `worldId` varchar(96) NOT NULL,
  `title` varchar(255) NOT NULL,
  `expectedCatalogRevision` varchar(64) NOT NULL,
  `designJson` text NOT NULL,
  `designHash` varchar(64) NOT NULL,
  `active` boolean NOT NULL DEFAULT true,
  `createdByUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionWorldDesignVersions_id` PRIMARY KEY(`id`),
  INDEX `aurionWorldDesignVersions_key_version_idx` (`designKey`, `version`),
  INDEX `aurionWorldDesignVersions_active_idx` (`active`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionDungeonDesignVersions` (
  `id` varchar(128) NOT NULL,
  `dungeonId` varchar(96) NOT NULL,
  `version` int NOT NULL,
  `label` varchar(255) NOT NULL,
  `zone` varchar(96) NOT NULL,
  `expectedCatalogRevision` varchar(64) NOT NULL,
  `designJson` text NOT NULL,
  `designHash` varchar(64) NOT NULL,
  `active` boolean NOT NULL DEFAULT true,
  `createdByUserId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionDungeonDesignVersions_id` PRIMARY KEY(`id`),
  INDEX `aurionDungeonDesignVersions_id_version_idx` (`dungeonId`, `version`),
  INDEX `aurionDungeonDesignVersions_active_idx` (`active`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionAuthoringReceipts` (
  `id` varchar(128) NOT NULL,
  `kind` varchar(32) NOT NULL,
  `action` varchar(32) NOT NULL,
  `targetId` varchar(128) NOT NULL,
  `actorUserId` int NOT NULL,
  `planHash` varchar(64) NOT NULL,
  `previousHash` varchar(64) NULL,
  `resultHash` varchar(64) NOT NULL,
  `payloadJson` text NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionAuthoringReceipts_id` PRIMARY KEY(`id`),
  INDEX `aurionAuthoringReceipts_target_idx` (`kind`, `targetId`),
  INDEX `aurionAuthoringReceipts_plan_idx` (`planHash`)
);
