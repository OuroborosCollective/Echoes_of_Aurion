CREATE TABLE `expeditionTeamSignals` (
	`id` varchar(64) NOT NULL,
	`teamId` varchar(64) NOT NULL,
	`senderUserId` int NOT NULL,
	`command` varchar(1) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expeditionTeamSignals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `expeditionTeamSignals_team_created_idx` ON `expeditionTeamSignals` (`teamId`,`createdAt`);