import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
const SCRYPT_COST = 16_384;
const KEY_BYTES = 64;

function deriveLocalPassword(password: string, salt: Buffer, cost: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, KEY_BYTES, { N: cost, r: 8, p: 1 }, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

export const LOCAL_HANDLE_PATTERN = /^[a-z0-9_-]{3,32}$/;

export function normalizeLocalHandle(value: string) {
  return value.trim().toLowerCase();
}

export function assertLocalHandle(value: string) {
  const handle = normalizeLocalHandle(value);
  if (!LOCAL_HANDLE_PATTERN.test(handle)) {
    throw new Error("Der Rufname muss 3–32 Zeichen lang sein und darf nur Kleinbuchstaben, Ziffern, _ und - enthalten.");
  }
  return handle;
}

export function assertLocalPassword(value: string) {
  if (value.length < 12 || value.length > 128) {
    throw new Error("Das Passwort muss zwischen 12 und 128 Zeichen lang sein.");
  }
  return value;
}

export async function hashLocalPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await deriveLocalPassword(password, salt, SCRYPT_COST);
  return `scrypt$${SCRYPT_COST}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyLocalPassword(password: string, encoded: string) {
  const [algorithm, cost, saltEncoded, hashEncoded] = encoded.split("$");
  if (algorithm !== "scrypt" || !cost || !saltEncoded || !hashEncoded) return false;
  const parsedCost = Number(cost);
  if (!Number.isInteger(parsedCost) || parsedCost < 16_384 || parsedCost > 65_536) return false;
  try {
    const salt = Buffer.from(saltEncoded, "base64");
    const expected = Buffer.from(hashEncoded, "base64");
    if (salt.length < 16 || expected.length !== KEY_BYTES) return false;
    const actual = await deriveLocalPassword(password, salt, parsedCost);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
