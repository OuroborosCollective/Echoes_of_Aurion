CREATE TABLE `lootAffixes` (
	`id` varchar(64) NOT NULL,
	`affixKey` varchar(96) NOT NULL,
	`slot` enum('prefix','suffix') NOT NULL,
	`minItemLevel` int NOT NULL,
	`maxItemLevel` int NOT NULL,
	`modifiersJson` text NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	CONSTRAINT `lootAffixes_id` PRIMARY KEY(`id`),
	CONSTRAINT `lootAffixes_affixKey_unique` UNIQUE(`affixKey`)
);
--> statement-breakpoint
CREATE TABLE `lootSetDefinitions` (
	`id` varchar(64) NOT NULL,
	`setKey` varchar(96) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`piecesJson` text NOT NULL,
	`bonusesJson` text NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	CONSTRAINT `lootSetDefinitions_id` PRIMARY KEY(`id`),
	CONSTRAINT `lootSetDefinitions_setKey_unique` UNIQUE(`setKey`)
);
--> statement-breakpoint
CREATE TABLE `treasureClasses` (
	`id` varchar(64) NOT NULL,
	`classKey` varchar(96) NOT NULL,
	`minLevel` int NOT NULL,
	`maxLevel` int NOT NULL,
	`entriesJson` text NOT NULL,
	`active` int NOT NULL DEFAULT 1,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `treasureClasses_id` PRIMARY KEY(`id`),
	CONSTRAINT `treasureClasses_classKey_unique` UNIQUE(`classKey`)
);
--> statement-breakpoint
CREATE TABLE `weaponMasteryReceipts` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expeditionKey` varchar(96) NOT NULL,
	`weaponTrack` enum('blade','staff','spear','focus') NOT NULL,
	`actionKey` varchar(120) NOT NULL,
	`xpGranted` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `weaponMasteryReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `weaponMasteryReceipts_idempotency_uq` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `weaponMasteryReceipts_user_created_idx` ON `weaponMasteryReceipts` (`userId`,`createdAt`);