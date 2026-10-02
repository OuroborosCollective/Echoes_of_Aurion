ALTER TABLE `aurionItemInstancesV2` ADD `craftingReceiptId` varchar(64) NULL;--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD UNIQUE KEY `aurionItemInstancesV2_crafting_receipt_uq` (`craftingReceiptId`);--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD `socketCount` int NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD `durabilityBps` int NOT NULL DEFAULT 10000;--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` DROP CONSTRAINT `aurionItemInstancesV2_exactly_one_provenance_ck`;--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_exactly_one_provenance_ck` CHECK ((`lootReceiptId` IS NOT NULL) + (`inventoryReceiptId` IS NOT NULL) + (`craftingReceiptId` IS NOT NULL) = 1);--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_socket_count_ck` CHECK (`socketCount` BETWEEN 0 AND 5);--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_durability_ck` CHECK (`durabilityBps` BETWEEN 0 AND 10000);--> statement-breakpoint
ALTER TABLE `craftingReceipts` ADD `commandHash` varchar(96);--> statement-breakpoint
ALTER TABLE `craftingReceipts` ADD `resultJson` text;--> statement-breakpoint
ALTER TABLE `craftingReceipts` DROP INDEX `craftingReceipts_inputItemId_unique`;--> statement-breakpoint
CREATE INDEX `craftingReceipts_input_item_idx` ON `craftingReceipts` (`inputItemId`);
