CREATE TABLE `skillProgressionEvents` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`skillId` enum('woodcutting','mining','fishing','combat','crafting') NOT NULL,
	`amountExact` varchar(128) NOT NULL,
	`source` enum('npc_kill','resource_gather','crafting','quest_reward') NOT NULL,
	`resultReceiptId` varchar(64) NOT NULL,
	`resolutionIndex` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `skillProgressionEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `skillProgressionEvents_idempotency_uq` UNIQUE(`idempotencyKey`),
	CONSTRAINT `skillProgressionEvents_user_receipt_skill_uq` UNIQUE(`userId`,`resultReceiptId`,`skillId`)
);
--> statement-breakpoint
CREATE INDEX `skillProgressionEvents_user_skill_created_idx` ON `skillProgressionEvents` (`userId`,`skillId`,`createdAt`);
