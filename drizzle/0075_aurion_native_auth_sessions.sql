CREATE TABLE aurionNativeAuthTransactions (
  id varchar(64) NOT NULL PRIMARY KEY,
  requestStateDigest varchar(64) NOT NULL,
  codeChallenge varchar(43) NOT NULL,
  appBuild varchar(120) NOT NULL,
  createdAtMs bigint NOT NULL,
  expiresAtMs bigint NOT NULL,
  verifiedUserId int NULL,
  handoffCodeDigest varchar(64) NULL,
  handoffExpiresAtMs bigint NULL,
  issuedAtMs bigint NULL,
  consumedAtMs bigint NULL,
  UNIQUE KEY aurionNativeAuthTransactions_handoff_uq (handoffCodeDigest),
  INDEX aurionNativeAuthTransactions_expiry_idx (expiresAtMs)
);
--> statement-breakpoint
CREATE TABLE aurionNativeAuthSessions (
  id varchar(64) NOT NULL PRIMARY KEY,
  userId int NOT NULL,
  appBuild varchar(120) NOT NULL,
  currentRefreshDigest varchar(64) NOT NULL,
  createdAtMs bigint NOT NULL,
  absoluteExpiresAtMs bigint NOT NULL,
  idleExpiresAtMs bigint NOT NULL,
  revokedAtMs bigint NULL,
  INDEX aurionNativeAuthSessions_user_idx (userId)
);
--> statement-breakpoint
CREATE TABLE aurionNativeAuthRefreshTokens (
  tokenDigest varchar(64) NOT NULL PRIMARY KEY,
  sessionId varchar(64) NOT NULL,
  issuedAtMs bigint NOT NULL,
  expiresAtMs bigint NOT NULL,
  consumedAtMs bigint NULL,
  INDEX aurionNativeAuthRefreshTokens_session_idx (sessionId)
);
--> statement-breakpoint
CREATE TABLE aurionNativeAuthAccessTokens (
  tokenDigest varchar(64) NOT NULL PRIMARY KEY,
  sessionId varchar(64) NOT NULL,
  issuedAtMs bigint NOT NULL,
  expiresAtMs bigint NOT NULL,
  INDEX aurionNativeAuthAccessTokens_session_idx (sessionId)
);
