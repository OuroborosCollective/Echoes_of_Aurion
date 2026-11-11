ALTER TABLE `aurionCausalTickReceipts` MODIFY COLUMN `stageReceiptsJson` mediumtext;
--> statement-breakpoint
ALTER TABLE `aurionCausalArchive` MODIFY COLUMN `payloadJson` mediumtext NOT NULL;
