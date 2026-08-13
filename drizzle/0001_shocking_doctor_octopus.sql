CREATE TABLE `glbAssets` (
	`id` varchar(64) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`assetType` enum('character','enemy','weapon','armor','arena') NOT NULL,
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(768) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`bytes` int NOT NULL,
	`status` enum('draft','approved','rejected','archived') NOT NULL DEFAULT 'draft',
	`createdByUserId` int NOT NULL,
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `glbAssets_id` PRIMARY KEY(`id`),
	CONSTRAINT `glbAssets_storageKey_unique` UNIQUE(`storageKey`),
	CONSTRAINT `glbAssets_sha256_unique` UNIQUE(`sha256`)
);
--> statement-breakpoint
CREATE TABLE `glbAssignments` (
	`id` varchar(64) NOT NULL,
	`assetId` varchar(64) NOT NULL,
	`targetType` enum('character','enemy','weapon','armor','arena') NOT NULL,
	`targetKey` varchar(120) NOT NULL,
	`active` int NOT NULL DEFAULT 0,
	`assignedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `glbAssignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `guildContributionLedger` (
	`id` varchar(64) NOT NULL,
	`guildId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`activityKey` varchar(96) NOT NULL,
	`points` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guildContributionLedger_id` PRIMARY KEY(`id`),
	CONSTRAINT `guildContributionLedger_idempotency_uq` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `guildMemberships` (
	`id` varchar(64) NOT NULL,
	`guildId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`role` enum('founder','officer','member','applicant') NOT NULL DEFAULT 'member',
	`status` enum('active','left','removed','pending') NOT NULL DEFAULT 'active',
	`joinedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `guildMemberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `guildMemberships_guild_user_uq` UNIQUE(`guildId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `guilds` (
	`id` varchar(64) NOT NULL,
	`name` varchar(48) NOT NULL,
	`tag` varchar(8) NOT NULL,
	`founderUserId` int NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`seasonPoints` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guilds_id` PRIMARY KEY(`id`),
	CONSTRAINT `guilds_name_unique` UNIQUE(`name`),
	CONSTRAINT `guilds_tag_unique` UNIQUE(`tag`)
);
--> statement-breakpoint
CREATE TABLE `itemInstances` (
	`id` varchar(64) NOT NULL,
	`ownerUserId` int NOT NULL,
	`lootReceiptId` varchar(64) NOT NULL,
	`baseItemKey` varchar(96) NOT NULL,
	`quality` enum('normal','magic','rare','set','unique') NOT NULL,
	`itemLevel` int NOT NULL,
	`affixesJson` text NOT NULL,
	`setKey` varchar(96),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `itemInstances_id` PRIMARY KEY(`id`),
	CONSTRAINT `itemInstances_lootReceiptId_unique` UNIQUE(`lootReceiptId`)
);
--> statement-breakpoint
CREATE TABLE `lootDropReceipts` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expeditionKey` varchar(96) NOT NULL,
	`treasureClass` varchar(96) NOT NULL,
	`quality` enum('normal','magic','rare','set','unique') NOT NULL,
	`seedDigest` varchar(128) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lootDropReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `lootDropReceipts_idempotency_uq` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `monetizationPlacements` (
	`id` varchar(64) NOT NULL,
	`placementKey` varchar(96) NOT NULL,
	`kind` enum('banner','offerwall','vote_list') NOT NULL,
	`providerLabel` varchar(96) NOT NULL,
	`active` int NOT NULL DEFAULT 0,
	`consentRequired` int NOT NULL DEFAULT 1,
	`configurationJson` text NOT NULL,
	`updatedByUserId` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monetizationPlacements_id` PRIMARY KEY(`id`),
	CONSTRAINT `monetizationPlacements_placementKey_unique` UNIQUE(`placementKey`)
);
--> statement-breakpoint
CREATE TABLE `playerProfiles` (
	`userId` int NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`totalXp` int NOT NULL DEFAULT 0,
	`aurionPoints` int NOT NULL DEFAULT 0,
	`victories` int NOT NULL DEFAULT 0,
	`seasonPoints` int NOT NULL DEFAULT 0,
	`selectedClass` enum('unbound','vanguard','seer','warden') NOT NULL DEFAULT 'unbound',
	`classChosenAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playerProfiles_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `progressionLedger` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('xp','points','victory','weapon_xp','guild_contribution') NOT NULL,
	`delta` int NOT NULL,
	`source` varchar(64) NOT NULL,
	`reason` varchar(240) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `progressionLedger_id` PRIMARY KEY(`id`),
	CONSTRAINT `progressionLedger_idempotency_uq` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `rewardReceipts` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`placementId` varchar(64) NOT NULL,
	`providerEventId` varchar(160) NOT NULL,
	`status` enum('accepted','rejected','credited') NOT NULL,
	`rewardJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `rewardReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `rewardReceipts_placement_event_uq` UNIQUE(`placementId`,`providerEventId`)
);
--> statement-breakpoint
CREATE TABLE `weaponMasteries` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`weaponTrack` enum('blade','staff','spear','focus') NOT NULL,
	`xp` int NOT NULL DEFAULT 0,
	`level` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weaponMasteries_id` PRIMARY KEY(`id`),
	CONSTRAINT `weaponMasteries_user_track_uq` UNIQUE(`userId`,`weaponTrack`)
);
--> statement-breakpoint
CREATE INDEX `glbAssignments_target_active_idx` ON `glbAssignments` (`targetType`,`targetKey`,`active`);--> statement-breakpoint
CREATE INDEX `guildContributionLedger_guild_created_idx` ON `guildContributionLedger` (`guildId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `guildMemberships_user_status_idx` ON `guildMemberships` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `itemInstances_owner_created_idx` ON `itemInstances` (`ownerUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `lootDropReceipts_user_created_idx` ON `lootDropReceipts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `progressionLedger_user_created_idx` ON `progressionLedger` (`userId`,`createdAt`);