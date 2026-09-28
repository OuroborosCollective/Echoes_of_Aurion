import { describe, expect, it } from "vitest";
import { browserSha256 } from "./aurionBrowserHash";
import {
  createCanonicalAvatarProfile,
  verifyCanonicalAvatarProfile,
  type CanonicalAvatarProfileInput,
} from "./aurionCanonicalAvatarContract";

const input = (): CanonicalAvatarProfileInput => ({
  avatarProfileId: "avatar:reference",
  avatarProfileVersion: "aurion-avatar-profile.v1",
  skeletonRevision: "sha256:" + "a".repeat(64),
  bones: [
    {
      boneId: "a",
      sourceName: "Root",
      parentBoneId: null,
      restPositionNormalized: [0, 0, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "b",
      sourceName: "Head",
      parentBoneId: "a",
      restPositionNormalized: [0, 1, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "c",
      sourceName: "HandL",
      parentBoneId: "a",
      restPositionNormalized: [-0.2, 0.5, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "d",
      sourceName: "HandR",
      parentBoneId: "a",
      restPositionNormalized: [0.2, 0.5, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "e",
      sourceName: "FootL",
      parentBoneId: "a",
      restPositionNormalized: [-0.1, 0, 0],
      restQuaternion: [0, 0, 0, 1],
    },
    {
      boneId: "f",
      sourceName: "FootR",
      parentBoneId: "a",
      restPositionNormalized: [0.1, 0, 0],
      restQuaternion: [0, 0, 0, 1],
    },
  ],
  bodyRegions: [
    {
      regionId: "head",
      boneId: "b",
      normalizedBounds: { min: [-0.1, 0.9, -0.1], max: [0.1, 1.1, 0.1] },
      clearanceRadiusNormalized: 0.1,
    },
  ],
  attachmentSockets: [
    {
      equipmentSlot: "weapon",
      socketId: "aurion:weapon",
      boneId: "d",
      positionNormalized: [0.2, 0.5, 0],
    },
  ],
  normalizedBounds: { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
  armorClearanceEnvelopes: [{ regionId: "head", radiusNormalized: 0.1 }],
  supportedEquipmentSlots: ["weapon"],
  surfaceLandmarks: [
    { landmarkId: "head_top", boneId: "b", positionNormalized: [0, 1, 0] },
  ],
  deformationMode: "skinned",
});

describe("aurion canonical avatar contract", () => {
  it("matches the standard SHA-256 reference vector in browser-safe code", () => {
    expect(browserSha256("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("creates the same fingerprint for the same profile input", () => {
    const first = createCanonicalAvatarProfile(input());
    const replay = createCanonicalAvatarProfile(input());
    expect(first.profileFingerprint).toBe(replay.profileFingerprint);
    expect(verifyCanonicalAvatarProfile(first)).toBe(true);
  });

  it("fails closed for duplicate ordering and dangling topology", () => {
    expect(() =>
      createCanonicalAvatarProfile({
        ...input(),
        supportedEquipmentSlots: ["weapon", "weapon"],
      })
    ).toThrow("CANONICAL_AVATAR_SLOTS_NOT_CANONICAL");
    expect(() =>
      createCanonicalAvatarProfile({
        ...input(),
        attachmentSockets: [
          { ...input().attachmentSockets[0]!, boneId: "missing" },
        ],
      })
    ).toThrow("CANONICAL_AVATAR_SOCKET_INVALID");
  });

  it("does not accept a changed fingerprint", () => {
    const profile = createCanonicalAvatarProfile(input());
    expect(
      verifyCanonicalAvatarProfile({
        ...profile,
        avatarProfileVersion: "changed",
      })
    ).toBe(false);
  });
});
