import { TRPCError } from "@trpc/server";

const DOMAIN_CODE = /^[A-Z][A-Z0-9_]{2,95}$/;

/**
 * Response boundary for admin/world procedures: stable domain codes with one of the
 * given prefixes (e.g. WORLD_VISUAL_REVISION_CONFLICT) reach the client unchanged;
 * anything else (driver errors with SQL and parameters, stack-bearing failures) is
 * logged server-side and answered with a fixed `<label>_FAILED` code.
 */
export async function withDomainErrors<T>(label: string, prefixes: readonly string[], work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (DOMAIN_CODE.test(message) && prefixes.some(prefix => message.startsWith(prefix))) {
      const conflict = /_(CONFLICT|CHANGED)$/.test(message);
      throw new TRPCError({ code: conflict ? "CONFLICT" : "BAD_REQUEST", message });
    }
    console.error(`[${label}] unexpected failure`, error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `${label}_FAILED` });
  }
}
