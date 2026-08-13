CREATE TABLE `seasonLeaderboardSnapshots` (
	`id` varchar(64) NOT NULL,
	`seasonId` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`level` int NOT NULL,
	`seasonPoints` int NOT NULL,
	`victories` int NOT NULL,
	`selectedClass` enum('unbound','vanguard','seer','warden') NOT NULL,
	`capturedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seasonLeaderboardSnapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `seasonLeaderboardSnapshots_season_user_uq` UNIQUE(`seasonId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` varchar(64) NOT NULL,
	`seasonKey` varchar(64) NOT NULL,
	`displayName` varchar(120) NOT NULL,
	`status` enum('active','closed') NOT NULL DEFAULT 'active',
	`startsAt` timestamp NOT NULL DEFAULT (now()),
	`endsAt` timestamp,
	`createdByUserId` int NOT NULL,
	`closedByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seasons_id` PRIMARY KEY(`id`),
	CONSTRAINT `seasons_seasonKey_unique` UNIQUE(`seasonKey`)
);
--> statement-breakpoint
CREATE INDEX `seasonLeaderboardSnapshots_season_rank_idx` ON `seasonLeaderboardSnapshots` (`seasonId`,`seasonPoints`,`victories`,`level`);--> statement-breakpoint
CREATE INDEX `seasons_status_starts_idx` ON `seasons` (`status`,`startsAt`);