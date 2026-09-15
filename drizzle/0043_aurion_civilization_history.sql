CREATE TABLE `aurionCivilizationHistoryEvents` (
  `eventId` varchar(64) NOT NULL,
  `civilizationId` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `worldEpoch` int NOT NULL,
  `eventType` varchar(64) NOT NULL,
  `sourceReceiptId` varchar(64) NOT NULL,
  `sourceRevision` varchar(64) NOT NULL,
  `eventPayloadHash` varchar(64) NOT NULL,
  `occurredSequence` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionCivilizationHistoryEvents_eventId` PRIMARY KEY (`eventId`),
  UNIQUE KEY `historySequenceIdx` (`worldId`,`civilizationId`,`occurredSequence`)
);
--> statement-breakpoint
CREATE TABLE `aurionActiveCivilizations` (
  `civilizationId` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `worldEpoch` int NOT NULL,
  `population` int NOT NULL,
  `stability` float NOT NULL,
  `hazardIndex` float NOT NULL,
  `scarcitySeverity` float NOT NULL,
  `lastResolutionIndex` int NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionActiveCivilizations_civilizationId` PRIMARY KEY (`civilizationId`)
);
--> statement-breakpoint
CREATE TABLE `aurionRuinOrigins` (
  `ruinId` varchar(64) NOT NULL,
  `originCivilizationId` varchar(64) NOT NULL,
  `collapseEventId` varchar(64) NOT NULL,
  `locationIdentity` varchar(255) NOT NULL,
  `worldEpoch` int NOT NULL,
  `historyDigest` varchar(64) NOT NULL,
  `rulesetVersion` varchar(32) NOT NULL,
  `generationSeedDigest` varchar(64) NOT NULL,
  `state` enum('ELIGIBLE','MATERIALIZED','DISCOVERED','ACTIVE','CLEARED','HISTORICAL') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionRuinOrigins_ruinId` PRIMARY KEY (`ruinId`)
);
--> statement-breakpoint
CREATE TABLE `aurionDungeonInstanceReceipts` (
  `instanceId` varchar(64) NOT NULL,
  `ruinId` varchar(64) NOT NULL,
  `entryReceipt` varchar(64) NOT NULL,
  `rulesetVersion` varchar(32) NOT NULL,
  `contextIdentity` varchar(64) NOT NULL,
  `completionReceipt` varchar(64),
  `lootReceiptSetDigest` varchar(64),
  `resultHash` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionDungeonInstanceReceipts_instanceId` PRIMARY KEY (`instanceId`)
);
--> statement-breakpoint
CREATE TABLE `aurionSettlementRebirthCandidates` (
  `candidateId` varchar(64) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `locationIdentity` varchar(255) NOT NULL,
  `ruinId` varchar(64),
  `eligibilityReceipt` varchar(64) NOT NULL,
  `candidateSeedDigest` varchar(64) NOT NULL,
  `state` enum('INELIGIBLE','ELIGIBLE','MATERIALIZED','REJECTED') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionSettlementRebirthCandidates_candidateId` PRIMARY KEY (`candidateId`)
);
