CREATE TABLE `aurionEffectIntents` (
  `effectId` varchar(96) NOT NULL,
  `authorityReceiptHash` varchar(96) NOT NULL,
  `effectType` varchar(96) NOT NULL,
  `subjectId` varchar(128) NOT NULL,
  `ordinal` int NOT NULL,
  `payloadHash` varchar(96) NOT NULL,
  `payloadJson` text NOT NULL,
  `deliveryState` enum('PENDING','DELIVERED','FAILED','RETRYABLE','PERMANENT_FAILURE') NOT NULL DEFAULT 'PENDING',
  `attemptCount` int NOT NULL DEFAULT 0,
  `providerReceiptHash` varchar(96) NULL,
  `lastErrorCode` varchar(96) NULL,
  `deliveredAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionEffectIntents_effectId` PRIMARY KEY(`effectId`),
  CONSTRAINT `aurionEffectIntents_authority_identity_uq` UNIQUE(`authorityReceiptHash`,`effectType`,`subjectId`,`ordinal`),
  INDEX `aurionEffectIntents_state_created_idx` (`deliveryState`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE `aurionEffectDeliveryReceipts` (
  `id` varchar(96) NOT NULL,
  `effectId` varchar(96) NOT NULL,
  `attempt` int NOT NULL,
  `deliveryState` enum('PENDING','DELIVERED','FAILED','RETRYABLE','PERMANENT_FAILURE') NOT NULL,
  `providerReceiptHash` varchar(96) NULL,
  `errorCode` varchar(96) NULL,
  `deliveryReceiptHash` varchar(96) NOT NULL,
  `previousDeliveryReceiptHash` varchar(96) NULL,
  `receiptJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionEffectDeliveryReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionEffectDeliveryReceipts_effect_attempt_uq` UNIQUE(`effectId`,`attempt`),
  CONSTRAINT `aurionEffectDeliveryReceipts_hash_uq` UNIQUE(`deliveryReceiptHash`),
  INDEX `aurionEffectDeliveryReceipts_effect_created_idx` (`effectId`,`createdAt`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionEffectDeliveryReceipts_no_update` BEFORE UPDATE ON `aurionEffectDeliveryReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_EFFECT_DELIVERY_RECEIPTS_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionEffectDeliveryReceipts_no_delete` BEFORE DELETE ON `aurionEffectDeliveryReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_EFFECT_DELIVERY_RECEIPTS_APPEND_ONLY';
