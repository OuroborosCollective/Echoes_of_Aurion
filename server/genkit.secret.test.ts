import { describe, expect, it } from "vitest";

describe("Genkit model access secret", () => {
  it("authenticates a configured Gemini key against the read-only models endpoint", async () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return;
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
    });

    expect(response.ok).toBe(true);
  }, 20_000);
});
