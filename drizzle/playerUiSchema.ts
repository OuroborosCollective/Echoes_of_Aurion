import { int, mysqlTable, text } from "drizzle-orm/mysql-core";

export const aurionPlayerUiSettings = mysqlTable("aurionPlayerUiSettings", {
  userId: int("userId").primaryKey(),
  revision: int("revision").notNull().default(0),
  autoLoot: int("autoLoot").notNull().default(1),
  analyticsConsent: int("analyticsConsent").notNull().default(0),
  hotbarJson: text("hotbarJson").notNull(),
});
