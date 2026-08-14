import { aurionAssets } from "@/lib/aurionAssets";

export const starterCharacters = [
  { id: "wayfinder", name: "Wayfinder", role: "BEWEGLICHER EXPEDITIONSSCOUT", detail: "Elfenbein · Bronze · Cyan-Sigil", assetPath: aurionAssets.wayfinder },
  { id: "veilguard", name: "Veilguard", role: "STERNWARTEN-WÄCHTERIN", detail: "Oxidbronze · Nachtteal · Amber", assetPath: aurionAssets.veilguard },
] as const;

export type StarterCharacter = (typeof starterCharacters)[number];
