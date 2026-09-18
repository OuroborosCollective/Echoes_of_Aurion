ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `handoverVersion` int NOT NULL DEFAULT 1 AFTER `id`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `entityId` varchar(128) NULL AFTER `handoverVersion`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `sourceReceiptHash` varchar(96) NULL AFTER `sourceTick`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `sourceStateHash` varchar(96) NULL AFTER `sourceReceiptHash`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `targetAcceptedTick` int NULL AFTER `targetTick`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `targetReceiptHash` varchar(96) NULL AFTER `targetAcceptedTick`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `payloadHash` varchar(96) NULL AFTER `transferHash`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `transferReceiptHash` varchar(96) NULL AFTER `payloadJson`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `previousTransferReceiptHash` varchar(96) NULL AFTER `transferReceiptHash`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  ADD COLUMN `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `createdAt`;
--> statement-breakpoint
ALTER TABLE `aurionCrossZoneTransfers`
  MODIFY COLUMN `status` enum('PENDING','CONSUMED','PREPARED','SOURCE_FROZEN','TARGET_ACCEPTED','SOURCE_FINALIZED','COMMITTED','REJECTED','EXPIRED','UNPROVABLE') NOT NULL DEFAULT 'PENDING';
--> statement-breakpoint
CREATE INDEX `aurionCrossZoneTransfers_entity_status_idx` ON `aurionCrossZoneTransfers` (`entityId`,`status`);
--> statement-breakpoint
CREATE UNIQUE INDEX `aurionCrossZoneTransfers_receipt_hash_uq` ON `aurionCrossZoneTransfers` (`transferReceiptHash`);
--> statement-breakpoint
CREATE TABLE `aurionCrossZoneTransferReceipts` (
  `id` varchar(96) NOT NULL,
  `transferId` varchar(96) NOT NULL,
  `sequence` int NOT NULL,
  `entityId` varchar(128) NOT NULL,
  `status` enum('PREPARED','SOURCE_FROZEN','TARGET_ACCEPTED','SOURCE_FINALIZED','COMMITTED','REJECTED','EXPIRED','UNPROVABLE') NOT NULL,
  `transferReceiptHash` varchar(96) NOT NULL,
  `previousTransferReceiptHash` varchar(96) NULL,
  `receiptJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionCrossZoneTransferReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionCrossZoneTransferReceipts_transfer_sequence_uq` UNIQUE(`transferId`,`sequence`),
  CONSTRAINT `aurionCrossZoneTransferReceipts_hash_uq` UNIQUE(`transferReceiptHash`),
  INDEX `aurionCrossZoneTransferReceipts_entity_idx` (`entityId`,`createdAt`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionCrossZoneTransferReceipts_no_update` BEFORE UPDATE ON `aurionCrossZoneTransferReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_CROSS_ZONE_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionCrossZoneTransferReceipts_no_delete` BEFORE DELETE ON `aurionCrossZoneTransferReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_CROSS_ZONE_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TABLE `aurionEntityZoneOwnership` (
  `entityId` varchar(128) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `zoneId` varchar(64) NOT NULL,
  `mode` enum('ACTIVE','FROZEN') NOT NULL DEFAULT 'ACTIVE',
  `activeTransferId` varchar(96) NULL,
  `generation` int NOT NULL DEFAULT 0,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionEntityZoneOwnership_entityId` PRIMARY KEY(`entityId`),
  CONSTRAINT `aurionEntityZoneOwnership_active_transfer_uq` UNIQUE(`activeTransferId`),
  INDEX `aurionEntityZoneOwnership_zone_mode_idx` (`worldId`,`zoneId`,`mode`)
);
