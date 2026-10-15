CREATE TABLE `aurionStatAllocationReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `attribute` varchar(32) NOT NULL,
  `amountExact` varchar(128) NOT NULL,
  `earnedAtSpendExact` varchar(128) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionStatAllocationReceipts_id` PRIMARY KEY (`id`),
  CONSTRAINT `aurionStatAllocationReceipts_idempotency_uq` UNIQUE (`idempotencyKey`),
  INDEX `aurionStatAllocationReceipts_user_created_idx` (`userId`,`createdAt`)
);