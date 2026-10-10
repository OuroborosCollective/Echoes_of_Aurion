CREATE TABLE `aurionProductionProbeSessionFence` (
  `fenceName` varchar(64) NOT NULL,
  `ownerId` varchar(32) NOT NULL,
  `createdAtMs` bigint NOT NULL,
  CONSTRAINT `aurionProductionProbeSessionFence_fenceName` PRIMARY KEY (`fenceName`)
);
