-- Aurion world-entity foundation: definition-only registry for the classless
-- (RuneScape-style) progression world. Authored canonical content for
-- professions, activities, recipes and world bosses. No live state, no receipts.
-- Seed with: drizzle/seed_0064_aurion_world_foundation.sql
CREATE TABLE `aurionProfessionDefinitions` (
  `id` varchar(64) NOT NULL,
  `sourceId` varchar(64) NOT NULL,
  `category` enum('crafting','gathering','civic') NOT NULL,
  `displayName` varchar(120) NOT NULL,
  `masteryScope` varchar(128) NOT NULL,
  `unbounded` boolean NOT NULL DEFAULT true,
  `definitionJson` text NOT NULL,
  `sourceCatalog` varchar(120) NOT NULL,
  `contentVersion` varchar(120) NOT NULL,
  `contentHash` varchar(71) NOT NULL,
  `definitionVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionProfessionDefinitions_id` PRIMARY KEY (`id`),
  KEY `aurionProfessionDefinitions_category_idx` (`category`)
);
--> statement-breakpoint
CREATE TABLE `aurionActivityDefinitions` (
  `id` varchar(64) NOT NULL,
  `professionId` varchar(64) NOT NULL,
  `kind` enum('gather','process') NOT NULL,
  `outputItemKey` varchar(96) NOT NULL,
  `outputItemLabel` varchar(120) NOT NULL,
  `definitionJson` text NOT NULL,
  `sourceCatalog` varchar(120) NOT NULL,
  `contentVersion` varchar(120) NOT NULL,
  `contentHash` varchar(71) NOT NULL,
  `definitionVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionActivityDefinitions_id` PRIMARY KEY (`id`),
  KEY `aurionActivityDefinitions_profession_idx` (`professionId`)
);
--> statement-breakpoint
CREATE TABLE `aurionRecipeDefinitions` (
  `id` varchar(64) NOT NULL,
  `professionId` varchar(64) NOT NULL,
  `displayName` varchar(120) NOT NULL,
  `outputItemKey` varchar(96) NOT NULL,
  `definitionJson` text NOT NULL,
  `sourceCatalog` varchar(120) NOT NULL,
  `contentVersion` varchar(120) NOT NULL,
  `contentHash` varchar(71) NOT NULL,
  `definitionVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionRecipeDefinitions_id` PRIMARY KEY (`id`),
  KEY `aurionRecipeDefinitions_profession_idx` (`professionId`)
);
--> statement-breakpoint
CREATE TABLE `aurionWorldBossDefinitions` (
  `id` varchar(64) NOT NULL,
  `displayName` varchar(120) NOT NULL,
  `zoneKey` varchar(96) NOT NULL,
  `respawnTicksExact` varchar(32) NOT NULL,
  `definitionJson` text NOT NULL,
  `sourceCatalog` varchar(120) NOT NULL,
  `contentVersion` varchar(120) NOT NULL,
  `contentHash` varchar(71) NOT NULL,
  `definitionVersion` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionWorldBossDefinitions_id` PRIMARY KEY (`id`),
  KEY `aurionWorldBossDefinitions_zone_idx` (`zoneKey`)
);
