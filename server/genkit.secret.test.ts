import { describe, expect, it } from "vitest";

describe("Genkit model access secret", () => {
  const apiKey = process.env.GEMINI_API_KEY;

  it.skipIf(!apiKey)("authenticates the configured Gemini key against the read-only models endpoint", async () => {
    expect(apiKey).toBeTruthy();

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models", {
      headers: { "x-goog-api-key": apiKey },
    });

    expect(response.ok).toBe(true);
  }, 20_000);
});
