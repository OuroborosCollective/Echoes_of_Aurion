ALTER TABLE `playerProfiles` ADD `inventoryRevisionExact` varchar(128) NOT NULL DEFAULT '0';--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `quantityExact` varchar(128) NOT NULL DEFAULT '1';--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `maxQuantityExact` varchar(128) NOT NULL DEFAULT '1';--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `mergeKey` varchar(96) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `provenanceHash` varchar(96) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` MODIFY COLUMN `lootReceiptId` varchar(64);--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD `inventoryReceiptId` varchar(64);--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD `originItemId` varchar(64);--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD `quantityExact` varchar(128) NOT NULL DEFAULT '1';--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD `maxQuantityExact` varchar(128) NOT NULL DEFAULT '1';--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD `mergeKey` varchar(96) NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD `provenanceHash` varchar(96) NOT NULL DEFAULT '';--> statement-breakpoint
UPDATE `itemInstances` SET `mergeKey`=CONCAT('legacy:',`id`), `provenanceHash`=CONCAT('sha256:',SHA2(`id`,256)) WHERE `mergeKey`='';--> statement-breakpoint
UPDATE `aurionItemInstancesV2` SET `mergeKey`=`id`, `provenanceHash`=CONCAT('sha256:',SHA2(`id`,256)) WHERE `mergeKey`='';--> statement-breakpoint
ALTER TABLE `playerProfiles` ADD CONSTRAINT `playerProfiles_inventory_revision_ck` CHECK (`inventoryRevisionExact` REGEXP '^(0|[1-9][0-9]*)$');--> statement-breakpoint
ALTER TABLE `itemInstances` ADD CONSTRAINT `itemInstances_quantity_exact_ck` CHECK (`quantityExact` REGEXP '^(0|[1-9][0-9]*)$');--> statement-breakpoint
ALTER TABLE `itemInstances` ADD CONSTRAINT `itemInstances_max_quantity_exact_ck` CHECK (`maxQuantityExact` REGEXP '^[1-9][0-9]*$');--> statement-breakpoint
ALTER TABLE `itemInstances` ADD CONSTRAINT `itemInstances_quantity_le_capacity_ck` CHECK (CHAR_LENGTH(`quantityExact`) < CHAR_LENGTH(`maxQuantityExact`) OR (CHAR_LENGTH(`quantityExact`) = CHAR_LENGTH(`maxQuantityExact`) AND CAST(`quantityExact` AS CHAR CHARSET BINARY) <= CAST(`maxQuantityExact` AS CHAR CHARSET BINARY)));--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_exactly_one_provenance_ck` CHECK ((`lootReceiptId` IS NOT NULL AND `inventoryReceiptId` IS NULL) OR (`lootReceiptId` IS NULL AND `inventoryReceiptId` IS NOT NULL));--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_inventory_origin_ck` CHECK (`inventoryReceiptId` IS NULL OR `originItemId` IS NOT NULL);--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_quantity_exact_ck` CHECK (`quantityExact` REGEXP '^(0|[1-9][0-9]*)$');--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_max_quantity_exact_ck` CHECK (`maxQuantityExact` REGEXP '^[1-9][0-9]*$');--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_quantity_le_capacity_ck` CHECK (CHAR_LENGTH(`quantityExact`) < CHAR_LENGTH(`maxQuantityExact`) OR (CHAR_LENGTH(`quantityExact`) = CHAR_LENGTH(`maxQuantityExact`) AND CAST(`quantityExact` AS CHAR CHARSET BINARY) <= CAST(`maxQuantityExact` AS CHAR CHARSET BINARY)));--> statement-breakpoint
CREATE TABLE `aurionInventoryReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `operation` enum('merge','split','consume') NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `commandHash` varchar(96) NOT NULL,
  `beforeRevisionExact` varchar(128) NOT NULL,
  `afterRevisionExact` varchar(128) NOT NULL,
  `beforeStateHash` varchar(96) NOT NULL,
  `afterStateHash` varchar(96) NOT NULL,
  `beforeStateJson` text NOT NULL,
  `afterStateJson` text NOT NULL,
  `resultJson` text NOT NULL,
  `resultHash` varchar(96) NOT NULL,
  `receiptHash` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionInventoryReceipts_id` PRIMARY KEY(`id`),
  CONSTRAINT `aurionInventoryReceipts_user_idempotency_uq` UNIQUE(`userId`,`idempotencyKey`),
  CONSTRAINT `aurionInventoryReceipts_user_after_revision_uq` UNIQUE(`userId`,`afterRevisionExact`),
  CONSTRAINT `aurionInventoryReceipts_receipt_hash_uq` UNIQUE(`receiptHash`),
  KEY `aurionInventoryReceipts_user_created_idx` (`userId`,`createdAt`),
  KEY `aurionInventoryReceipts_after_state_idx` (`afterStateHash`)
);--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD UNIQUE KEY `aurionItemInstancesV2_inventory_receipt_uq` (`inventoryReceiptId`);
