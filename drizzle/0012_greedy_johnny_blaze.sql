CREATE TABLE `localCredentials` (
	`userId` int NOT NULL,
	`handle` varchar(32) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `localCredentials_userId` PRIMARY KEY(`userId`),
	CONSTRAINT `localCredentials_handle_unique` UNIQUE(`handle`)
);
