CREATE TABLE `weaponLoadouts` (
	`userId` int NOT NULL,
	`weaponTrack` enum('blade','staff','spear','focus') NOT NULL,
	`configuredAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `weaponLoadouts_userId` PRIMARY KEY(`userId`)
);
