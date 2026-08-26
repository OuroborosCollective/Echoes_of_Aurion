CREATE TABLE `aurionWorldResolutions` (
	`id` varchar(64) NOT NULL,
	`regionId` varchar(96) NOT NULL,
	`worldSeedDigest` varchar(64) NOT NULL,
	`ruleSetVersion` varchar(96) NOT NULL,
	`contentVersion` varchar(96) NOT NULL,
	`resolutionIndex` int NOT NULL,
	`signalsJson` text NOT NULL,
	`reactionJson` text NOT NULL,
	`reactionHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aurionWorldResolutions_id` PRIMARY KEY(`id`),
	CONSTRAINT `aurionWorldResolutions_region_index_uq` UNIQUE(`regionId`,`resolutionIndex`),
	CONSTRAINT `aurionWorldResolutions_reaction_hash_uq` UNIQUE(`reactionHash`)
);
--> statement-breakpoint
CREATE INDEX `aurionWorldResolutions_region_created_idx` ON `aurionWorldResolutions` (`regionId`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `aurionNpcStates` (
	`npcId` varchar(96) NOT NULL,
	`regionId` varchar(96) NOT NULL,
	`needsJson` text NOT NULL,
	`memoryJson` text NOT NULL,
	`languageProfileId` varchar(96) NOT NULL,
	`lastResolutionIndex` int NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aurionNpcStates_npcId` PRIMARY KEY(`npcId`)
);
--> statement-breakpoint
CREATE INDEX `aurionNpcStates_region_updated_idx` ON `aurionNpcStates` (`regionId`,`updatedAt`);
--> statement-breakpoint
CREATE TABLE `aurionNpcDecisionReceipts` (
	`id` varchar(64) NOT NULL,
	`npcId` varchar(96) NOT NULL,
	`regionId` varchar(96) NOT NULL,
	`resolutionIndex` int NOT NULL,
	`observationIdsJson` text NOT NULL,
	`goal` varchar(64) NOT NULL,
	`decisionHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aurionNpcDecisionReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `aurionNpcDecisionReceipts_npc_index_uq` UNIQUE(`npcId`,`resolutionIndex`),
	CONSTRAINT `aurionNpcDecisionReceipts_hash_uq` UNIQUE(`decisionHash`)
);
--> statement-breakpoint
CREATE INDEX `aurionNpcDecisionReceipts_region_created_idx` ON `aurionNpcDecisionReceipts` (`regionId`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `aurionPolityStates` (
	`polityId` varchar(96) NOT NULL,
	`stateJson` text NOT NULL,
	`reactionHash` varchar(64) NOT NULL,
	`ruleSetVersion` varchar(96) NOT NULL,
	`contentVersion` varchar(96) NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aurionPolityStates_polityId` PRIMARY KEY(`polityId`),
	CONSTRAINT `aurionPolityStates_reactionHash_unique` UNIQUE(`reactionHash`)
);
--> statement-breakpoint
CREATE TABLE `aurionDialogueReceipts` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`npcId` varchar(96) NOT NULL,
	`utteranceDigest` varchar(64) NOT NULL,
	`interpretationJson` text NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aurionDialogueReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `aurionDialogueReceipts_idempotency_uq` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `aurionDialogueReceipts_user_created_idx` ON `aurionDialogueReceipts` (`userId`,`createdAt`);
