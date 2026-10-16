CREATE TABLE `aurionProductionProbeApprovals` (
  `approvalId` varchar(32) NOT NULL,
  `runKey` varchar(64) NOT NULL,
  `runJson` text NOT NULL,
  `scope` varchar(64) NOT NULL,
  `approvedByUserId` int NOT NULL,
  `purpose` varchar(240) NOT NULL,
  `approvedAtMs` bigint NOT NULL,
  `expiresAtMs` bigint NOT NULL,
  `consumedAtMs` bigint,
  `revokedAtMs` bigint,
  CONSTRAINT `aurionProductionProbeApprovals_pk` PRIMARY KEY(`approvalId`),
  CONSTRAINT `aurionProductionProbeApprovals_run_scope_uq` UNIQUE(`runKey`,`scope`)
);
