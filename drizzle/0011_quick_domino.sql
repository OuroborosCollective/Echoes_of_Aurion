CREATE TABLE `glbAssetSubmissions` (
	`id` varchar(64) NOT NULL,
	`submittedByUserId` int NOT NULL,
	`assetType` enum('character','enemy','weapon','armor','arena') NOT NULL,
	`subcategory` varchar(80) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`description` varchar(1000) NOT NULL,
	`visibility` enum('private','public') NOT NULL DEFAULT 'private',
	`storageKey` varchar(512) NOT NULL,
	`storageUrl` varchar(768) NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`bytes` int NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewNote` varchar(500),
	`reviewedByUserId` int,
	`reviewedAt` timestamp,
	`approvedAssetId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `glbAssetSubmissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `glbAssetSubmissions_storageKey_unique` UNIQUE(`storageKey`)
);
--> statement-breakpoint
CREATE TABLE `playerCharacterAppearances` (
	`userId` int NOT NULL,
	`assetId` varchar(64) NOT NULL,
	`visibility` enum('private','public') NOT NULL,
	`equippedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `playerCharacterAppearances_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE INDEX `glbAssetSubmissions_status_created_idx` ON `glbAssetSubmissions` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `glbAssetSubmissions_submitter_created_idx` ON `glbAssetSubmissions` (`submittedByUserId`,`createdAt`);