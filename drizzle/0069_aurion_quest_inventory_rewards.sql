ALTER TABLE `aurionInventoryReceipts` MODIFY COLUMN `operation` enum('merge','split','consume','grant') NOT NULL;
