ALTER TABLE `gameplayQuestProgress` MODIFY COLUMN `state` enum('active','ready_to_turn_in','completed') NOT NULL;--> statement-breakpoint
ALTER TABLE `gameplayQuestProgress` ADD `readyAt` timestamp;