CREATE TABLE `gameplayActionReceipts` (
	`id` varchar(64) NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`sequence` int NOT NULL,
	`command` varchar(1) NOT NULL,
	`action` varchar(24) NOT NULL,
	`source` enum('human','gateway') NOT NULL,
	`damage` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gameplayActionReceipts_id` PRIMARY KEY(`id`),
	CONSTRAINT `gameplayActionReceipts_session_sequence_uq` UNIQUE(`sessionId`,`sequence`)
);
--> statement-breakpoint
CREATE TABLE `gameplayDungeonKeys` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`keyName` varchar(64) NOT NULL,
	`grantedByQuest` varchar(64) NOT NULL,
	`grantedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gameplayDungeonKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `gameplayDungeonKeys_user_key_uq` UNIQUE(`userId`,`keyName`)
);
--> statement-breakpoint
CREATE TABLE `gameplayQuestProgress` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`questKey` varchar(64) NOT NULL,
	`state` enum('active','completed') NOT NULL,
	`acceptedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`completionSessionId` varchar(64),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gameplayQuestProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `gameplayQuestProgress_user_quest_uq` UNIQUE(`userId`,`questKey`)
);
--> statement-breakpoint
CREATE TABLE `gameplaySessions` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`encounterKey` varchar(64) NOT NULL,
	`status` enum('active','completed','abandoned') NOT NULL DEFAULT 'active',
	`bossHp` int NOT NULL,
	`maxBossHp` int NOT NULL,
	`nextSequence` int NOT NULL DEFAULT 1,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gameplaySessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gameplayActionReceipts_user_created_idx` ON `gameplayActionReceipts` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `gameplayDungeonKeys_user_granted_idx` ON `gameplayDungeonKeys` (`userId`,`grantedAt`);--> statement-breakpoint
CREATE INDEX `gameplayQuestProgress_user_state_idx` ON `gameplayQuestProgress` (`userId`,`state`);--> statement-breakpoint
CREATE INDEX `gameplaySessions_user_status_idx` ON `gameplaySessions` (`userId`,`status`,`updatedAt`);