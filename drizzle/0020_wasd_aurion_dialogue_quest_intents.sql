CREATE TABLE `aurionDialogueCommandReceipts` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`dialogueReceiptId` varchar(64) NOT NULL,
	`npcId` varchar(96) NOT NULL,
	`actionKind` enum('offer_quest','request_turn_in') NOT NULL,
	`questKey` varchar(64) NOT NULL,
	`outcomeJson` text NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aurionDialogueCommandReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `aurionDialogueCommandReceipts_idempotency_uq` UNIQUE(`idempotencyKey`),
	CONSTRAINT `aurionDialogueCommandReceipts_user_dialogue_action_quest_uq` UNIQUE(`userId`,`dialogueReceiptId`,`actionKind`,`questKey`)
);
--> statement-breakpoint
CREATE INDEX `aurionDialogueCommandReceipts_user_created_idx` ON `aurionDialogueCommandReceipts` (`userId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `aurionDialogueCommandReceipts_dialogue_idx` ON `aurionDialogueCommandReceipts` (`dialogueReceiptId`);
