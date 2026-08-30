export const starterCharacters = [
  { id: "wayfinder", name: "Wayfinder", role: "BEWEGLICHER EXPEDITIONSSCOUT", detail: "Elfenbein · Bronze · Cyan-Sigil", assetPath: undefined },
  { id: "veilguard", name: "Veilguard", role: "STERNWARTEN-WÄCHTERIN", detail: "Oxidbronze · Nachtteal · Amber", assetPath: undefined },
] as const;

export type StarterCharacter = (typeof starterCharacters)[number];
