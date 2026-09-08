import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("AIM-227 classless Aurion boundary", () => {
  it("removes class and fixed weapon mutation routes from the active tRPC player API", () => {
    const routers = read("server/routers.ts");
    expect(routers).not.toMatch(/\bchooseClass\s*:\s*protectedProcedure/);
    expect(routers).not.toMatch(/\bsetWeaponLoadout\s*:\s*protectedProcedure/);
    expect(routers).toContain("readConfirmedProgressionTracks");
  });

  it("keeps active character surfaces read-only and classless", () => {
    for (const file of [
      "client/src/pages/Account.tsx",
      "client/src/pages/Operations.tsx",
      "client/src/xaurion/components/CharacterModal.tsx",
      "client/src/xaurion/integration/AurionAuthorityHud.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toContain("trpc.player.chooseClass");
      expect(source).not.toContain("trpc.player.setWeaponLoadout");
    }
    expect(read("client/src/pages/Account.tsx")).toContain("klassenlos");
    expect(read("client/src/xaurion/components/CharacterModal.tsx")).toContain("progression.tracks");
  });

  it("projects dynamic receipt identities without adding an Aurion XP rule", () => {
    const persistence = read("server/progressionReceiptPersistence.ts");
    expect(persistence).toContain("readConfirmedProgressionTracks");
    expect(persistence).toContain("BigInt(candidate.levelExact)");
    expect(persistence).not.toContain("xpRequiredForNextLevel");
    expect(persistence).not.toContain("levelFromTotalXp");
  });
});
