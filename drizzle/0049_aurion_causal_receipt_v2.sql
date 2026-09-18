ALTER TABLE `aurionCausalTickReceipts`
  ADD COLUMN `receiptSchema` varchar(64) NOT NULL DEFAULT 'aurion.causal.tick.v1' AFTER `rulesetVersion`;
--> statement-breakpoint
ALTER TABLE `aurionCausalTickReceipts`
  ADD COLUMN `stageReceiptsJson` text NULL AFTER `inputJson`;
