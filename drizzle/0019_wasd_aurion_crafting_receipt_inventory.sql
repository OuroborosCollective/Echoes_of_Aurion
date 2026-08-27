CREATE TABLE `craftingReceipts` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`recipeKey` varchar(96) NOT NULL,
	`recipeDigest` varchar(64) NOT NULL,
	`ruleSetVersion` varchar(96) NOT NULL,
	`contentVersion` varchar(96) NOT NULL,
	`inputItemId` varchar(64) NOT NULL,
	`receiptDigest` varchar(64) NOT NULL,
	`resolutionIndex` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `craftingReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `craftingReceipts_inputItemId_unique` UNIQUE(`inputItemId`),
	CONSTRAINT `craftingReceipts_receiptDigest_unique` UNIQUE(`receiptDigest`),
	CONSTRAINT `craftingReceipts_idempotencyKey_unique` UNIQUE(`idempotencyKey`),
	CONSTRAINT `craftingReceipts_user_resolution_uq` UNIQUE(`userId`,`resolutionIndex`)
);
--> statement-breakpoint
ALTER TABLE `itemInstances` MODIFY COLUMN `lootReceiptId` varchar(64);--> statement-breakpoint
ALTER TABLE `itemInstances` MODIFY COLUMN `status` enum('owned','listed','sold','consumed') NOT NULL DEFAULT 'owned';--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `sourceKind` enum('loot','crafting') DEFAULT 'loot' NOT NULL;--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `craftingReceiptId` varchar(64);--> statement-breakpoint
ALTER TABLE `skillProgressionEvents` ADD `receiptKind` enum('expedition_result','crafting') DEFAULT 'expedition_result' NOT NULL;--> statement-breakpoint
ALTER TABLE `itemInstances` ADD CONSTRAINT `itemInstances_craftingReceiptId_unique` UNIQUE(`craftingReceiptId`);--> statement-breakpoint
CREATE INDEX `craftingReceipts_user_created_idx` ON `craftingReceipts` (`userId`,`createdAt`);--> statement-breakpoint
ALTER TABLE `itemInstances` ADD CONSTRAINT `itemInstances_exactly_one_provenance_ck` CHECK ((`itemInstances`.`sourceKind` = 'loot' AND `itemInstances`.`lootReceiptId` IS NOT NULL AND `itemInstances`.`craftingReceiptId` IS NULL) OR (`itemInstances`.`sourceKind` = 'crafting' AND `itemInstances`.`lootReceiptId` IS NULL AND `itemInstances`.`craftingReceiptId` IS NOT NULL));