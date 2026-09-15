ALTER TABLE `aurionSemanticNodes` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `aurionSemanticNodes` ADD PRIMARY KEY (`id`,`graphReceiptId`);
