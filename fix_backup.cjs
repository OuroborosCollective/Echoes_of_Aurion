const fs = require('fs');
let file = fs.readFileSync('server/causality/archivingService.ts', 'utf8');
file = file.replace(
  /async triggerZoneBackup[\s\S]*?return true;\n  }/m,
  `async triggerZoneBackup(zoneId: string): Promise<boolean> {
    console.log(\`[Archiving] Manual backup triggered for zone \${zoneId}\`);
    try {
      const db = await getDb();
      if (!db) return false;
      
      // Look for the latest checkpoint
      const { aurionCausalCheckpoints } = await import("../../drizzle/aurionCausalitySchema");
      const { eq, desc } = await import("drizzle-orm");
      const checkpoints = await db.select()
        .from(aurionCausalCheckpoints)
        .where(eq(aurionCausalCheckpoints.zoneId, zoneId))
        .orderBy(desc(aurionCausalCheckpoints.tick))
        .limit(1);
        
      if (checkpoints.length > 0) {
        const latestTick = checkpoints[0].tick;
        await (globalCausalPersistence as any).archiveOldReceipts(zoneId, latestTick);
      }
      return true;
    } catch (error) {
      console.error("[Archiving] Manual backup failed:", error);
      return false;
    }
  }`
);
fs.writeFileSync('server/causality/archivingService.ts', file);
