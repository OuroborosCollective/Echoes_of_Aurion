CREATE TABLE `aurionCombatVictoryEvents` (
  `eventId` varchar(128) NOT NULL,
  `receiptId` varchar(128) NOT NULL,
  `logicalRevision` int NOT NULL,
  `playerUserId` int NOT NULL,
  `opponentEntityId` varchar(128) NOT NULL,
  `opponentSpecies` varchar(128) NOT NULL,
  `outcome` enum('victory','defeat') NOT NULL,
  `confirmed` boolean NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionCombatVictoryEvents_eventId` PRIMARY KEY (`eventId`),
  CONSTRAINT `aurionCombatVictoryEvents_receipt_uq` UNIQUE (`receiptId`),
  CONSTRAINT `aurionCombatVictoryEvents_revision_ck` CHECK (`logicalRevision` >= 0),
  CONSTRAINT `aurionCombatVictoryEvents_player_ck` CHECK (`playerUserId` > 0),
  CONSTRAINT `aurionCombatVictoryEvents_confirmed_ck` CHECK (`confirmed` = 1)
);--> statement-breakpoint
CREATE INDEX `aurionCombatVictoryEvents_player_revision_idx` ON `aurionCombatVictoryEvents` (`playerUserId`,`logicalRevision`);
