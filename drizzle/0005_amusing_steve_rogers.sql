CREATE TABLE `expeditionResultReceipts` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`expeditionKey` varchar(96) NOT NULL,
	`seedDigest` varchar(128) NOT NULL,
	`resultDigest` varchar(128) NOT NULL,
	`status` enum('accepted','rejected') NOT NULL DEFAULT 'accepted',
	`idempotencyKey` varchar(128) NOT NULL,
	`confirmedByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expeditionResultReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `expeditionResultReceipts_idempotency_uq` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `expeditionResultReceipts_user_expedition_idx` ON `expeditionResultReceipts` (`userId`,`expeditionKey`,`createdAt`);