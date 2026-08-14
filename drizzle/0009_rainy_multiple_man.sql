CREATE TABLE `marketListings` (
	`id` varchar(64) NOT NULL,
	`itemId` varchar(64) NOT NULL,
	`sellerUserId` int NOT NULL,
	`askingPrice` int NOT NULL,
	`status` enum('active','sold','cancelled') NOT NULL DEFAULT 'active',
	`buyerUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`settledAt` timestamp,
	CONSTRAINT `marketListings_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketListings_itemId_unique` UNIQUE(`itemId`)
);
--> statement-breakpoint
CREATE TABLE `marketTransactionReceipts` (
	`id` varchar(64) NOT NULL,
	`listingId` varchar(64) NOT NULL,
	`itemId` varchar(64) NOT NULL,
	`sellerUserId` int NOT NULL,
	`buyerUserId` int NOT NULL,
	`aurionTransferred` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketTransactionReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `marketTransactionReceipts_listingId_unique` UNIQUE(`listingId`),
	CONSTRAINT `marketTransactionReceipts_itemId_unique` UNIQUE(`itemId`),
	CONSTRAINT `marketTransactionReceipts_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `systemSaleReceipts` (
	`id` varchar(64) NOT NULL,
	`itemId` varchar(64) NOT NULL,
	`sellerUserId` int NOT NULL,
	`aurionGranted` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `systemSaleReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `systemSaleReceipts_itemId_unique` UNIQUE(`itemId`)
);
--> statement-breakpoint
DROP INDEX `itemInstances_owner_created_idx` ON `itemInstances`;--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `status` enum('owned','listed','sold') DEFAULT 'owned' NOT NULL;--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `soldAt` timestamp;--> statement-breakpoint
CREATE INDEX `marketListings_status_created_idx` ON `marketListings` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `marketTransactionReceipts_buyer_created_idx` ON `marketTransactionReceipts` (`buyerUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `systemSaleReceipts_seller_created_idx` ON `systemSaleReceipts` (`sellerUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `itemInstances_owner_status_created_idx` ON `itemInstances` (`ownerUserId`,`status`,`createdAt`);