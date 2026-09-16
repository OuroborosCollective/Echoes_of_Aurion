CREATE TABLE IF NOT EXISTS `aurionWorldContextEpisodes` (
	`id` varchar(160) NOT NULL,
	`schemaVersion` varchar(64) NOT NULL,
	`kind` varchar(96) NOT NULL,
	`worldId` varchar(96) NOT NULL,
	`sourceSequenceMin` int NOT NULL,
	`sourceSequenceMax` int NOT NULL,
	`actorIdsJson` text NOT NULL,
	`outcomesJson` text NOT NULL,
	`relationshipEffectsJson` text NOT NULL,
	`tagsJson` text NOT NULL,
	`canonicalSummary` text NOT NULL,
	`sourceRootHash` varchar(64) NOT NULL,
	`episodeHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	PRIMARY KEY (`id`),
	INDEX `aurionWcEpisodes_world_seq_idx` (`worldId`, `sourceSequenceMin`, `sourceSequenceMax`),
	INDEX `aurionWcEpisodes_hash_idx` (`episodeHash`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionWorldContextEpisodeSources` (
	`id` varchar(192) NOT NULL,
	`episodeId` varchar(160) NOT NULL,
	`sourceId` varchar(160) NOT NULL,
	`sourceHash` varchar(64) NOT NULL,
	`kind` varchar(64) NOT NULL,
	`evidenceClass` varchar(32) NOT NULL,
	`worldId` varchar(96) NOT NULL,
	`logicalSequence` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	PRIMARY KEY (`id`),
	INDEX `aurionWcEpisodeSources_ep_idx` (`episodeId`),
	INDEX `aurionWcEpisodeSources_src_idx` (`sourceId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionWorldContextCapsuleReceipts` (
	`id` varchar(160) NOT NULL,
	`schemaVersion` varchar(64) NOT NULL,
	`worldId` varchar(96) NOT NULL,
	`worldRevision` varchar(160) NOT NULL,
	`logicalTick` int NOT NULL,
	`actorId` varchar(96) NOT NULL,
	`purpose` varchar(64) NOT NULL,
	`queryHash` varchar(64) NOT NULL,
	`policyVersion` varchar(64) NOT NULL,
	`tokenizerId` varchar(96) NOT NULL,
	`maxEstimatedTokens` int NOT NULL,
	`maxUtf8Bytes` int NOT NULL,
	`selectedSourceCount` int NOT NULL,
	`omittedSourceCount` int NOT NULL,
	`sourceRootHash` varchar(64) NOT NULL,
	`selectedSourceRootHash` varchar(64) NOT NULL,
	`omittedSourceRootHash` varchar(64) NOT NULL,
	`capsuleHash` varchar(64) NOT NULL,
	`estimatedInputTokens` int NOT NULL,
	`utf8Bytes` int NOT NULL,
	`capsuleJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	PRIMARY KEY (`id`),
	INDEX `aurionWcCapsules_world_actor_idx` (`worldId`, `actorId`),
	INDEX `aurionWcCapsules_hash_idx` (`capsuleHash`),
	INDEX `aurionWcCapsules_query_idx` (`queryHash`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionWorldContextCapsuleSources` (
	`id` varchar(255) NOT NULL,
	`capsuleId` varchar(160) NOT NULL,
	`sourceId` varchar(160) NOT NULL,
	`sourceHash` varchar(64) NOT NULL,
	`kind` varchar(64) NOT NULL,
	`evidenceClass` varchar(32) NOT NULL,
	`worldId` varchar(96) NOT NULL,
	`logicalSequence` int NOT NULL,
	`selected` boolean NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	PRIMARY KEY (`id`),
	INDEX `aurionWcCapsuleSources_capsule_idx` (`capsuleId`),
	INDEX `aurionWcCapsuleSources_src_idx` (`sourceId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionWorldContextEvalRuns` (
	`id` varchar(128) NOT NULL,
	`evalSuite` varchar(96) NOT NULL,
	`sourceRevision` varchar(64) NOT NULL,
	`criticalFactRecall` int NOT NULL,
	`scopeViolationCount` int NOT NULL,
	`replayMatchRate` int NOT NULL,
	`metricsJson` text NOT NULL,
	`passed` boolean NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	PRIMARY KEY (`id`)
);
