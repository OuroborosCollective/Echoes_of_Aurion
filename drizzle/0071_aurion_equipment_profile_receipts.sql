ALTER TABLE `playerProfiles` ADD COLUMN `equipmentRevisionExact` varchar(128) NOT NULL DEFAULT '0';--> statement-breakpoint
CREATE TABLE `aurionEquipmentProfileReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `revisionExact` varchar(128) NOT NULL,
  `receiptHash` varchar(71) NOT NULL,
  `mutationJson` text NOT NULL,
  `appliedCausalReceiptHash` varchar(71) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionEquipmentProfileReceipts_id` PRIMARY KEY (`id`),
  CONSTRAINT `aurionEquipmentProfileReceipts_user_revision_uq` UNIQUE (`userId`,`revisionExact`),
  INDEX `aurionEquipmentProfileReceipts_pending_idx` (`userId`,`appliedCausalReceiptHash`)
);
