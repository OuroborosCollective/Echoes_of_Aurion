CREATE TABLE `aurionTemporalEvents` (
  `eventId` varchar(96) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `epoch` int NOT NULL,
  `domain` enum('world','zone','quest','npc','faction','economy','ownership','social') NOT NULL,
  `validFromEpoch` int NOT NULL,
  `validToEpoch` int,
  `sourceReceiptHash` varchar(96) NOT NULL,
  `sourceWorldRoot` varchar(96) NOT NULL,
  `sourceRevision` varchar(64) NOT NULL,
  `rulesetVersion` varchar(64) NOT NULL,
  `payloadJson` text NOT NULL,
  `payloadHash` varchar(96) NOT NULL,
  `eventHash` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionTemporalEvents_eventId` PRIMARY KEY (`eventId`),
  UNIQUE KEY `aurionTemporalEvents_event_hash_uq` (`eventHash`),
  KEY `aurionTemporalEvents_world_epoch_idx` (`worldId`,`epoch`),
  KEY `aurionTemporalEvents_world_domain_epoch_idx` (`worldId`,`domain`,`epoch`)
);
--> statement-breakpoint
CREATE TABLE `aurionTemporalEventSubjects` (
  `eventId` varchar(96) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  `subjectId` varchar(128) NOT NULL,
  `domain` enum('world','zone','quest','npc','faction','economy','ownership','social') NOT NULL,
  `validFromEpoch` int NOT NULL,
  `validToEpoch` int,
  CONSTRAINT `aurionTemporalEventSubjects_pk` PRIMARY KEY (`eventId`,`subjectId`),
  KEY `aurionTemporalEventSubjects_world_subject_epoch_idx` (`worldId`,`subjectId`,`validFromEpoch`)
);
--> statement-breakpoint
CREATE TABLE `aurionTemporalEventPredecessors` (
  `eventId` varchar(96) NOT NULL,
  `predecessorEventId` varchar(96) NOT NULL,
  `worldId` varchar(64) NOT NULL,
  CONSTRAINT `aurionTemporalEventPredecessors_pk` PRIMARY KEY (`eventId`,`predecessorEventId`),
  KEY `aurionTemporalEventPredecessors_predecessor_idx` (`predecessorEventId`),
  KEY `aurionTemporalEventPredecessors_world_event_idx` (`worldId`,`eventId`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionTemporalEvents_no_update` BEFORE UPDATE ON `aurionTemporalEvents` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_TEMPORAL_HISTORY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionTemporalEvents_no_delete` BEFORE DELETE ON `aurionTemporalEvents` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_TEMPORAL_HISTORY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionTemporalEventSubjects_no_update` BEFORE UPDATE ON `aurionTemporalEventSubjects` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_TEMPORAL_HISTORY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionTemporalEventSubjects_no_delete` BEFORE DELETE ON `aurionTemporalEventSubjects` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_TEMPORAL_HISTORY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionTemporalEventPredecessors_no_update` BEFORE UPDATE ON `aurionTemporalEventPredecessors` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_TEMPORAL_HISTORY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionTemporalEventPredecessors_no_delete` BEFORE DELETE ON `aurionTemporalEventPredecessors` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_TEMPORAL_HISTORY_APPEND_ONLY';
