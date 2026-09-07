CREATE TABLE `aurionNpcMemoryReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `characterId` varchar(128) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `worldRevision` varchar(128) NOT NULL,
  `resultReceiptId` varchar(128) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `memoryJson` text NOT NULL,
  `memoryHash` varchar(64) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionNpcMemoryReceipts_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aurionNpcMemoryReceipts_idempotency_uq` (`idempotencyKey`),
  UNIQUE KEY `aurionNpcMemoryReceipts_character_receipt_uq` (`userId`,`characterId`,`npcId`,`resultReceiptId`),
  KEY `aurionNpcMemoryReceipts_user_npc_created_idx` (`userId`,`npcId`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE `aurionNpcQuestOffers` (
  `id` varchar(64) NOT NULL,
  `memoryReceiptId` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `characterId` varchar(128) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `worldRevision` varchar(128) NOT NULL,
  `resultReceiptId` varchar(128) NOT NULL,
  `resolutionIndex` int NOT NULL,
  `offerKey` varchar(128) NOT NULL,
  `offerJson` text NOT NULL,
  `offerHash` varchar(64) NOT NULL,
  `reviewOnly` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionNpcQuestOffers_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aurionNpcQuestOffers_receipt_offer_uq` (`memoryReceiptId`,`offerKey`),
  UNIQUE KEY `aurionNpcQuestOffers_hash_uq` (`offerHash`),
  KEY `aurionNpcQuestOffers_user_npc_created_idx` (`userId`,`npcId`,`createdAt`),
  CONSTRAINT `aurionNpcQuestOffers_review_only_ck` CHECK (`reviewOnly` = 1)
);
