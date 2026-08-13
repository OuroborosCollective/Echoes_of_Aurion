CREATE TABLE `seasonTransitionReceipts` (
	`id` varchar(64) NOT NULL,
	`action` enum('start','rotate') NOT NULL,
	`fromSeasonId` varchar(64),
	`toSeasonId` varchar(64) NOT NULL,
	`actorUserId` int NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seasonTransitionReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `seasonTransitionReceipts_idempotency_uq` UNIQUE(`idempotencyKey`)
);
