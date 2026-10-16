CREATE TABLE `aurionNpcGuildStates` (
  `guildId` varchar(64) NOT NULL,
  `name` varchar(64) NOT NULL,
  `hubId` varchar(96) NOT NULL,
  `leaderNpcId` varchar(96) NOT NULL,
  `tradePolicy` enum('free_trade','protectionist','caravan_focused','self_sufficient') NOT NULL DEFAULT 'free_trade',
  `treasuryCopper` int NOT NULL DEFAULT 0,
  `foundedCycle` int NOT NULL,
  `lastElectionCycle` int NOT NULL,
  `revision` int NOT NULL,
  `stateHash` varchar(64) NOT NULL,
  `stateJson` mediumtext NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcGuildStates_pk` PRIMARY KEY(`guildId`),
  CONSTRAINT `aurionNpcGuildStates_name_uq` UNIQUE(`name`),
  CONSTRAINT `aurionNpcGuildStates_revision_ck` CHECK (`revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `aurionNpcGuildStates_hub_idx` ON `aurionNpcGuildStates` (`hubId`);
--> statement-breakpoint
CREATE TABLE `aurionNpcGuildMemberships` (
  `membershipId` varchar(64) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `hubId` varchar(96) NOT NULL,
  `role` enum('leader','merchant','trader','prospector') NOT NULL,
  `joinedCycle` int NOT NULL,
  `status` enum('active','left') NOT NULL DEFAULT 'active',
  `lastReceiptId` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcGuildMemberships_pk` PRIMARY KEY(`membershipId`),
  CONSTRAINT `aurionNpcGuildMemberships_npc_uq` UNIQUE(`npcId`)
);
--> statement-breakpoint
CREATE INDEX `aurionNpcGuildMemberships_guild_status_idx` ON `aurionNpcGuildMemberships` (`guildId`,`status`);
--> statement-breakpoint
CREATE TABLE `aurionNpcGuildReceipts` (
  `receiptId` varchar(64) NOT NULL,
  `guildId` varchar(64) NOT NULL,
  `actorNpcId` varchar(96) NOT NULL,
  `operation` enum('found_guild','elect_leader','join_guild','leave_guild','set_trade_policy','set_diplomacy') NOT NULL,
  `cycle` int NOT NULL,
  `sourceDecisionReceiptId` varchar(64) NOT NULL,
  `sourceResolutionIndex` int NOT NULL,
  `expectedRevision` int NOT NULL,
  `resultingRevision` int NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `confirmationHash` varchar(64) NOT NULL,
  `requestHash` varchar(64) NOT NULL,
  `resultHash` varchar(64) NOT NULL,
  `stateHash` varchar(64) NOT NULL,
  `resultJson` mediumtext NOT NULL,
  `receiptJson` mediumtext NOT NULL,
  `ruleSetVersion` varchar(96) NOT NULL,
  `contentVersion` varchar(96) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `aurionNpcGuildReceipts_pk` PRIMARY KEY(`receiptId`),
  CONSTRAINT `aurionNpcGuildReceipts_idempotency_uq` UNIQUE(`idempotencyKey`),
  CONSTRAINT `aurionNpcGuildReceipts_guild_revision_uq` UNIQUE(`guildId`,`resultingRevision`)
);
--> statement-breakpoint
CREATE INDEX `aurionNpcGuildReceipts_actor_cycle_idx` ON `aurionNpcGuildReceipts` (`actorNpcId`,`cycle`);
