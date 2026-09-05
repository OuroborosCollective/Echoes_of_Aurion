CREATE TABLE `aurionPlayerUiSettings` (
  `userId` int NOT NULL,
  `revision` int NOT NULL DEFAULT 0,
  `autoLoot` int NOT NULL DEFAULT 1,
  `analyticsConsent` int NOT NULL DEFAULT 0,
  `hotbarJson` text NOT NULL,
  CONSTRAINT `aurionPlayerUiSettings_userId` PRIMARY KEY (`userId`)
);
--> statement-breakpoint
ALTER TABLE `itemInstances` MODIFY COLUMN `status` enum('owned','listed','sold','consumed','guild_custody','pending_pickup','equipped') NOT NULL DEFAULT 'owned';
--> statement-breakpoint
ALTER TABLE `aurionItemInstancesV2` MODIFY COLUMN `status` enum('owned','listed','sold','consumed','guild_custody','pending_pickup','equipped') NOT NULL DEFAULT 'owned';
--> statement-breakpoint
-- Preserve existing equipment only where ownership, record version and slot agree.
-- Contradicted historical rows remain detectable by the strict inventory readback.
UPDATE `itemInstances` i INNER JOIN `aurionEquipmentSlots` e ON e.`itemId` = i.`id` AND e.`userId` = i.`ownerUserId` AND e.`itemRecordVersion` = 'legacy'
SET i.`status` = 'equipped'
WHERE i.`status` = 'owned' AND e.`slot` = 'main_hand' AND i.`baseItemKey` IN ('aurion_spear','asterion_blade','archive_staff','warden_focus','solarium_blade','sunspike_spear','ember_focus');
--> statement-breakpoint
UPDATE `aurionItemInstancesV2` i INNER JOIN `aurionEquipmentSlots` e ON e.`itemId` = i.`id` AND e.`userId` = i.`ownerUserId` AND e.`itemRecordVersion` = 'aurion_v2' AND e.`slot` = i.`equipmentSlot`
SET i.`status` = 'equipped' WHERE i.`status` = 'owned';
