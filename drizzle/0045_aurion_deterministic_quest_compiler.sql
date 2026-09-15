CREATE TABLE IF NOT EXISTS `aurionQuestTemplateVersions` (
	`templateId` varchar(96) NOT NULL,
	`version` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`templateJson` text NOT NULL,
	`templateHash` varchar(64) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`quarantined` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	INDEX `aurionQuestTemplateVersions_tpl_idx` (`templateId`, `version`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionQuestPlans` (
	`planHash` varchar(64) NOT NULL,
	`templateId` varchar(96) NOT NULL,
	`templateVersion` int NOT NULL,
	`templateSetHash` varchar(64) NOT NULL,
	`candidateSetHash` varchar(64) NOT NULL,
	`seedDigest` varchar(64) NOT NULL,
	`roleBindingHash` varchar(64) NOT NULL,
	`graphHash` varchar(64) NOT NULL,
	`planJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	PRIMARY KEY (`planHash`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionQuestInstances` (
	`id` varchar(128) NOT NULL,
	`worldId` varchar(96) NOT NULL,
	`playerUserId` int NOT NULL,
	`giverNpcId` varchar(96) NOT NULL,
	`templateId` varchar(96) NOT NULL,
	`templateVersion` int NOT NULL,
	`seedDigest` varchar(64) NOT NULL,
	`planHash` varchar(64) NOT NULL,
	`graphHash` varchar(64) NOT NULL,
	`currentNodeId` varchar(96) NOT NULL,
	`state` varchar(32) NOT NULL,
	`instanceJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	INDEX `aurionQuestInstances_player_idx` (`playerUserId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionQuestReceipts` (
	`id` varchar(128) NOT NULL,
	`instanceId` varchar(128) NOT NULL,
	`eventSequence` int NOT NULL,
	`planHash` varchar(64) NOT NULL,
	`graphHash` varchar(64) NOT NULL,
	`previousStateHash` varchar(64) NOT NULL,
	`resultStateHash` varchar(64) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`receiptHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	PRIMARY KEY (`id`),
	INDEX `aurionQuestReceipts_inst_idx` (`instanceId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `aurionQuestAdminProposals` (
	`id` varchar(128) NOT NULL,
	`proposalType` varchar(64) NOT NULL,
	`authorUserId` int NOT NULL,
	`templateId` varchar(96) NOT NULL,
	`templateVersion` int NOT NULL,
	`expectedTemplateSetHash` varchar(64) NOT NULL,
	`proposedDataJson` text NOT NULL,
	`status` varchar(32) NOT NULL,
	`receiptHash` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	PRIMARY KEY (`id`)
);
