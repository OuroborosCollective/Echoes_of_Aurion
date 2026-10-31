CREATE TABLE `aurionInvestigationDeductionReceipts` (
  `id` varchar(64) NOT NULL PRIMARY KEY,
  `actorId` varchar(128) NOT NULL,
  `worldId` varchar(128) NOT NULL,
  `deductionType` enum('affirm','challenge','chain') NOT NULL,
  `selectedClaimIdsJson` text NOT NULL,
  `sourceProjectionHash` varchar(71) NOT NULL,
  `graphHash` varchar(71) NOT NULL,
  `result` enum('validated') NOT NULL,
  `receiptHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  UNIQUE KEY `aurionInvestigationDeductionReceipts_hash_uq` (`receiptHash`),
  INDEX `aurionInvestigationDeductionReceipts_actor_idx` (`actorId`, `createdAt`)
);
