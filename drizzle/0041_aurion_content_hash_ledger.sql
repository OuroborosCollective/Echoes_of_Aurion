CREATE TABLE `aurionContentHashLedger` (
  `id` varchar(64) NOT NULL,
  `sourceRevision` varchar(256) NOT NULL,
  `sourcePath` varchar(512) NOT NULL,
  `fileHash` varchar(64) NOT NULL,
  `manifestHash` varchar(64) NOT NULL,
  `migrationTag` varchar(128) NOT NULL,
  `contentKind` enum('sql','schema','protocol','manifest','asset') NOT NULL,
  `sourceSizeBytes` int NOT NULL,
  `identityHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionContentHashLedger_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aurionContentHashLedger_identity_uq` (`identityHash`),
  UNIQUE KEY `aurionContentHashLedger_source_revision_path_uq` (`sourceRevision`,`sourcePath`),
  KEY `aurionContentHashLedger_migration_created_idx` (`migrationTag`,`createdAt`)
);
--> statement-breakpoint
CREATE TABLE `aurionContentHashAuditReceipts` (
  `id` varchar(64) NOT NULL,
  `ledgerId` varchar(64) NOT NULL,
  `status` enum('VERIFIED','DRIFT','UNREADABLE') NOT NULL,
  `checkedCount` int NOT NULL,
  `driftCount` int NOT NULL,
  `evidenceDigest` varchar(64) NOT NULL,
  `redactedJson` text NOT NULL,
  `createdByRole` varchar(32) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `aurionContentHashAuditReceipts_id` PRIMARY KEY (`id`),
  CONSTRAINT `aurionContentHashAuditReceipts_root_only_ck` CHECK (`createdByRole` = 'root'),
  UNIQUE KEY `aurionContentHashAuditReceipts_evidence_uq` (`evidenceDigest`),
  KEY `aurionContentHashAuditReceipts_status_created_idx` (`status`,`createdAt`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionContentHashLedger_no_update` BEFORE UPDATE ON `aurionContentHashLedger` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_CONTENT_HASH_LEDGER_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionContentHashLedger_no_delete` BEFORE DELETE ON `aurionContentHashLedger` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'AURION_CONTENT_HASH_LEDGER_APPEND_ONLY';
