CREATE TABLE `aurionFactionQuestlineStates` (
  `userId` int NOT NULL,
  `pledgedFaction` enum('sunward_concord','ironwardens','veiled_covenant','wayfarer_compact','free_haven') NOT NULL DEFAULT 'free_haven',
  `permanentOathReceiptId` varchar(64),
  `lastResolutionIndex` int NOT NULL DEFAULT 0,
  `contentVersion` varchar(96) NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionFactionQuestlineStates_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `aurionFactionQuestlineOathReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `fromFaction` enum('free_haven') NOT NULL,
  `toFaction` enum('sunward_concord','ironwardens','veiled_covenant','wayfarer_compact') NOT NULL,
  `sourceQuestId` varchar(96) NOT NULL,
  `sourceReceiptId` varchar(64) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `receiptDigest` varchar(64) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionFactionQuestlineOathReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionFactionQuestlineOathReceipts_user_uq` UNIQUE(`userId`),
  CONSTRAINT `aurionFactionQuestlineOathReceipts_idempotency_uq` UNIQUE(`idempotencyKey`),
  CONSTRAINT `aurionFactionQuestlineOathReceipts_user_source_uq` UNIQUE(`userId`,`sourceReceiptId`),
  CONSTRAINT `aurionFactionQuestlineOathReceipts_user_resolution_uq` UNIQUE(`userId`,`resolutionIndex`)
);
--> statement-breakpoint
CREATE TABLE `aurionFactionQuestlineDecisionReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `faction` enum('sunward_concord','ironwardens','veiled_covenant','wayfarer_compact','free_haven') NOT NULL,
  `questId` varchar(96) NOT NULL,
  `decisionKey` varchar(96) NOT NULL,
  `approach` enum('trade','craft','combat','espionage','exploration') NOT NULL,
  `resolutionIndex` int NOT NULL,
  `receiptDigest` varchar(64) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionFactionQuestlineDecisionReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionFactionQuestlineDecisionReceipts_idempotency_uq` UNIQUE(`idempotencyKey`),
  CONSTRAINT `aurionFactionQuestlineDecisionReceipts_user_quest_uq` UNIQUE(`userId`,`questId`),
  CONSTRAINT `aurionFactionQuestlineDecisionReceipts_user_resolution_uq` UNIQUE(`userId`,`resolutionIndex`)
);
--> statement-breakpoint
CREATE INDEX `aurionFactionQuestlineDecisionReceipts_user_resolution_idx` ON `aurionFactionQuestlineDecisionReceipts` (`userId`,`resolutionIndex`);
