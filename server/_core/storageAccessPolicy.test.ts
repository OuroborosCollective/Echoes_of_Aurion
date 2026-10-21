import { describe, expect, it, vi } from "vitest";
import { mayPresignSubmissionKey, type SubmissionAccess } from "./storageAccessPolicy";

const privateSubmission = "aurion/submissions/glb/73/submission-a.glb";

describe("Manus storage submission authorization", () => {
  it("never presigns private player submissions for anonymous or other players", async () => {
    const lookup = vi.fn(async () => ({ ownerId: 73, visibility: "private" as const }));
    expect(await mayPresignSubmissionKey(privateSubmission, null, lookup)).toBe(false);
    expect(await mayPresignSubmissionKey(privateSubmission, 74, lookup)).toBe(false);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("permits the submitting owner but does not expose unknown keys", async () => {
    const lookup = vi.fn(async () => ({ ownerId: 73, visibility: "private" as const }));
    expect(await mayPresignSubmissionKey(privateSubmission, 73, lookup)).toBe(true);
    expect(await mayPresignSubmissionKey(privateSubmission, 73, async () => null)).toBe(false);
  });

  it("preserves deliberately public submissions", async () => {
    expect(await mayPresignSubmissionKey(privateSubmission, null, async (): Promise<SubmissionAccess> =>
      ({ ownerId: 73, visibility: "public" }))).toBe(true);
  });

  it("does not alter existing public game art URLs", async () => {
    const lookup = vi.fn();
    expect(await mayPresignSubmissionKey("aurion-world-assets/tree.glb", null, lookup)).toBe(true);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("refuses untrusted traversal and noncanonical submission keys", async () => {
    const lookup = vi.fn(async () => ({ ownerId: 73, visibility: "public" as const }));
    for (const key of [
      "../aurion/submissions/glb/73/asset.glb",
      "aurion/submissions/glb/../other.glb",
      "aurion/submissions/glb/73/%2e%2e/asset.glb",
      "aurion/submissions/glb/73/asset.glb?x=1",
      "aurion\\submissions\\glb\\73\\asset.glb",
    ]) {
      expect(await mayPresignSubmissionKey(key, null, lookup)).toBe(false);
    }
    expect(lookup).not.toHaveBeenCalled();
  });
});
