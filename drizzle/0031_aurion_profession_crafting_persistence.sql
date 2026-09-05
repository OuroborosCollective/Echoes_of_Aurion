CREATE TABLE `aurionProfessionReceipts` (
  `id` varchar(64) NOT NULL PRIMARY KEY,
  `userId` int NOT NULL,
  `sourceCraftingReceiptId` varchar(64) NOT NULL,
  `operationId` varchar(128) NOT NULL,
  `commitHash` varchar(64) NOT NULL,
  `envelopeJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  UNIQUE KEY `aurionProfessionReceipts_source_uq` (`sourceCraftingReceiptId`),
  UNIQUE KEY `aurionProfessionReceipts_operation_uq` (`operationId`),
  KEY `aurionProfessionReceipts_user_idx` (`userId`)
);
--> statement-breakpoint
CREATE TABLE `aurionScopedMasteryEvents` (
  `id` varchar(64) NOT NULL PRIMARY KEY,
  `userId` int NOT NULL,
  `scopeKey` varchar(128) NOT NULL,
  `professionReceiptId` varchar(64) NOT NULL,
  `eventHash` varchar(64) NOT NULL,
  `eventJson` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  UNIQUE KEY `aurionScopedMasteryEvents_source_scope_uq` (`userId`, `professionReceiptId`, `scopeKey`),
  KEY `aurionScopedMasteryEvents_user_scope_idx` (`userId`, `scopeKey`)
);
--> statement-breakpoint
CREATE TABLE `aurionProfessionOutputBatches` (
  `professionReceiptId` varchar(64) NOT NULL PRIMARY KEY,
  `sourceCraftingReceiptId` varchar(64) NOT NULL,
  `ownerUserId` int NOT NULL,
  `totalQuantityExact` text NOT NULL,
  `nextOutputIndexExact` text NOT NULL,
  `templateJson` text NOT NULL,
  UNIQUE KEY `aurionProfessionOutputBatches_source_uq` (`sourceCraftingReceiptId`),
  KEY `aurionProfessionOutputBatches_owner_idx` (`ownerUserId`),
  CONSTRAINT `aurionProfessionOutputBatches_quantity_ck` CHECK (`totalQuantityExact` REGEXP '^[1-9][0-9]*$'),
  CONSTRAINT `aurionProfessionOutputBatches_index_ck` CHECK (`nextOutputIndexExact` REGEXP '^[1-9][0-9]*$')
);
--> statement-breakpoint
ALTER TABLE `craftingReceipts` ADD `professionReceiptId` varchar(64);
--> statement-breakpoint
ALTER TABLE `craftingReceipts` ADD CONSTRAINT `craftingReceipts_professionReceiptId_unique` UNIQUE (`professionReceiptId`);
--> statement-breakpoint
ALTER TABLE `itemInstances` ADD `craftingOutputKey` varchar(64) NOT NULL DEFAULT 'base';
--> statement-breakpoint
ALTER TABLE `itemInstances` ADD CONSTRAINT `itemInstances_crafting_output_uq` UNIQUE (`craftingReceiptId`, `craftingOutputKey`);
--> statement-breakpoint
ALTER TABLE `itemInstances` DROP INDEX `itemInstances_craftingReceiptId_unique`;
