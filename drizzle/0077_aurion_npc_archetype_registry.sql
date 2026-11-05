CREATE TABLE `aurionNpcControllerArtifacts` (
  `artifactHash` varchar(71) NOT NULL,
  `artifactJson` text NOT NULL,
  PRIMARY KEY (`artifactHash`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcControllerArtifacts_no_update` BEFORE UPDATE ON `aurionNpcControllerArtifacts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NPC_REGISTRY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcControllerArtifacts_no_delete` BEFORE DELETE ON `aurionNpcControllerArtifacts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NPC_REGISTRY_APPEND_ONLY';
--> statement-breakpoint
CREATE TABLE `aurionNpcArchetypeReleases` (
  `releaseHash` varchar(71) NOT NULL,
  `archetypeId` varchar(96) NOT NULL,
  `revision` int NOT NULL,
  `artifactHash` varchar(71) NOT NULL,
  `policyVersionId` varchar(128) NOT NULL,
  `mutationReceiptId` varchar(128) NOT NULL,
  `payloadJson` text NOT NULL,
  PRIMARY KEY (`releaseHash`),
  UNIQUE KEY `aurionNpcArchetypeReleases_revision_uq` (`archetypeId`,`revision`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcArchetypeReleases_no_update` BEFORE UPDATE ON `aurionNpcArchetypeReleases` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NPC_REGISTRY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcArchetypeReleases_no_delete` BEFORE DELETE ON `aurionNpcArchetypeReleases` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NPC_REGISTRY_APPEND_ONLY';
--> statement-breakpoint
CREATE TABLE `aurionNpcArchetypePointers` (
  `archetypeId` varchar(96) NOT NULL,
  `revision` int NOT NULL,
  `releaseHash` varchar(71),
  PRIMARY KEY (`archetypeId`)
);
--> statement-breakpoint
CREATE TABLE `aurionNpcControllerBindings` (
  `npcId` varchar(96) NOT NULL,
  `bindingHash` varchar(71) NOT NULL,
  `genesisReceiptId` varchar(128) NOT NULL,
  `bindingJson` text NOT NULL,
  PRIMARY KEY (`npcId`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcControllerBindings_no_update` BEFORE UPDATE ON `aurionNpcControllerBindings` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NPC_REGISTRY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcControllerBindings_no_delete` BEFORE DELETE ON `aurionNpcControllerBindings` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NPC_REGISTRY_APPEND_ONLY';
--> statement-breakpoint
CREATE TABLE `aurionNpcControllerShadowReceipts` (
  `actionReceiptId` varchar(128) NOT NULL,
  `npcId` varchar(96) NOT NULL,
  `receiptHash` varchar(71) NOT NULL,
  `payloadJson` text NOT NULL,
  PRIMARY KEY (`actionReceiptId`)
);
--> statement-breakpoint
CREATE TRIGGER `aurionNpcControllerShadowReceipts_no_update` BEFORE UPDATE ON `aurionNpcControllerShadowReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NPC_REGISTRY_APPEND_ONLY';
--> statement-breakpoint
CREATE TRIGGER `aurionNpcControllerShadowReceipts_no_delete` BEFORE DELETE ON `aurionNpcControllerShadowReceipts` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'NPC_REGISTRY_APPEND_ONLY';
