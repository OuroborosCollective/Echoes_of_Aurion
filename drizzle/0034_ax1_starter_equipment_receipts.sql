CREATE TABLE `aurionAx1StarterEquipmentReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `definitionId` varchar(96) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `sourceBlobSha` varchar(40) NOT NULL,
  `sourcePath` varchar(192) NOT NULL,
  `contentSha256` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionAx1StarterEquipmentReceipts_id` PRIMARY KEY (`id`),
  CONSTRAINT `aurionAx1StarterEquipmentReceipts_user_definition_uq` UNIQUE(`userId`,`definitionId`)
);
--> statement-breakpoint
CREATE INDEX `aurionAx1StarterEquipmentReceipts_user_created_idx` ON `aurionAx1StarterEquipmentReceipts` (`userId`,`createdAt`);
--> statement-breakpoint
CREATE TABLE `aurionAx1StarterEquipmentStates` (
  `userId` int NOT NULL,
  `receiptId` varchar(64) NOT NULL,
  `status` enum('owned','equipped') NOT NULL DEFAULT 'equipped',
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionAx1StarterEquipmentStates_userId` PRIMARY KEY (`userId`),
  CONSTRAINT `aurionAx1StarterEquipmentStates_receiptId_unique` UNIQUE(`receiptId`)
);
--> statement-breakpoint
CREATE INDEX `aurionAx1StarterEquipmentStates_status_idx` ON `aurionAx1StarterEquipmentStates` (`status`);
