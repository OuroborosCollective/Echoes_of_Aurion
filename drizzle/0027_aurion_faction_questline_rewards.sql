CREATE TABLE `aurionFactionQuestlineRewardReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `faction` enum('sunward_concord','ironwardens','veiled_covenant','wayfarer_compact','free_haven') NOT NULL,
  `questId` varchar(96) NOT NULL,
  `approach` enum('trade','craft','combat','espionage','exploration') NOT NULL,
  `sourceDecisionReceiptId` varchar(64) NOT NULL,
  `completionResolutionIndex` int NOT NULL,
  `rewardKey` varchar(160) NOT NULL,
  `xp` int NOT NULL,
  `points` int NOT NULL,
  `victory` int NOT NULL,
  `rewardDigest` varchar(64) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionFactionQuestlineRewardReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionFactionQuestlineRewardReceipts_idempotency_uq` UNIQUE(`idempotencyKey`),
  CONSTRAINT `aurionFactionQuestlineRewardReceipts_user_quest_uq` UNIQUE(`userId`,`questId`),
  CONSTRAINT `aurionFactionQuestlineRewardReceipts_user_resolution_uq` UNIQUE(`userId`,`completionResolutionIndex`),
  CONSTRAINT `aurionFactionQuestlineRewardReceipts_digest_uq` UNIQUE(`rewardDigest`)
);
--> statement-breakpoint
CREATE INDEX `aurionFactionQuestlineRewardReceipts_user_created_idx` ON `aurionFactionQuestlineRewardReceipts` (`userId`,`createdAt`);
