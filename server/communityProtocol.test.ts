import { describe, expect, it } from "vitest";
import { activeTeamMemberKey, assertDistinctTeammates, mayPublishForumCategory, normalizeCommunityBody, normalizeCommunityText } from "./communityProtocol";

describe("community protocol", () => {
  it("normalisiert kurze Chat- und Gesuchstexte ohne leere Eingaben zu akzeptieren", () => {
    expect(normalizeCommunityText("  Wir  suchen\n einen  zweiten Explorer. ", 280, "Gesuch")).toBe("Wir suchen einen zweiten Explorer.");
    expect(() => normalizeCommunityText("   ", 500, "Chat")).toThrow("Chat darf nicht leer sein.");
  });

  it("bewahrt bewusste Zeilenumbrüche in Forumstexten", () => {
    expect(normalizeCommunityBody("  Erste Zeile\r\nZweite Zeile  ", 8000, "Beitrag")).toBe("Erste Zeile\nZweite Zeile");
  });

  it("verhindert Selbstannahmen und reserviert aktive Teamkennungen pro Spieler", () => {
    expect(() => assertDistinctTeammates(14, 14)).toThrow("Ein eigenes Partnergesuch kann nicht angenommen werden.");
    expect(() => assertDistinctTeammates(14, 15)).not.toThrow();
    expect(activeTeamMemberKey(37)).toBe("expedition-active-37");
  });

  it("erlaubt redaktionelle Kategorien nur Administratoren", () => {
    expect(mayPublishForumCategory("user", "general")).toBe(true);
    expect(mayPublishForumCategory("user", "events")).toBe(false);
    expect(mayPublishForumCategory("admin", "patch_notes")).toBe(true);
  });
});
