CREATE TABLE `aurionGroupCoordinator` (
  `id` varchar(32) NOT NULL,
  `nextOrdinal` int NOT NULL DEFAULT 1,
  CONSTRAINT `aurionGroupCoordinator_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `aurionGroupPlayers` (
  `userId` int NOT NULL,
  `status` varchar(16) NOT NULL,
  `queueKey` varchar(96),
  `partyId` varchar(64),
  `stateJson` longtext NOT NULL,
  `stateHash` varchar(64) NOT NULL,
  CONSTRAINT `aurionGroupPlayers_userId` PRIMARY KEY (`userId`)
);
--> statement-breakpoint
CREATE INDEX `aurionGroupPlayers_queue_idx` ON `aurionGroupPlayers` (`status`,`queueKey`);
--> statement-breakpoint
CREATE INDEX `aurionGroupPlayers_party_idx` ON `aurionGroupPlayers` (`partyId`);
--> statement-breakpoint
CREATE TABLE `aurionGroupParties` (
  `id` varchar(64) NOT NULL,
  `stateJson` longtext NOT NULL,
  `stateHash` varchar(64) NOT NULL,
  CONSTRAINT `aurionGroupParties_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE `aurionGroupTickets` (
  `id` varchar(64) NOT NULL,
  `partyId` varchar(64) NOT NULL,
  `sourceRevision` varchar(40) NOT NULL,
  `ticketJson` longtext NOT NULL,
  `ticketHash` varchar(64) NOT NULL,
  CONSTRAINT `aurionGroupTickets_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aurionGroupTickets_party_uq` ON `aurionGroupTickets` (`partyId`);
--> statement-breakpoint
CREATE TABLE `aurionGroupReceipts` (
  `id` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `expectedRevision` int NOT NULL,
  `requestHash` varchar(64) NOT NULL,
  `resultJson` longtext NOT NULL,
  `resultHash` varchar(64) NOT NULL,
  CONSTRAINT `aurionGroupReceipts_id` PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aurionGroupReceipts_actor_revision_uq` ON `aurionGroupReceipts` (`userId`,`expectedRevision`);
