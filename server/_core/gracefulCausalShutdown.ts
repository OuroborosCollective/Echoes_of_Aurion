export type AurionShutdownDependencies = Readonly<{
  closeZoneGateway: () => void;
  stopObservers: readonly (() => void)[];
  flushCausalPersistence: () => Promise<void>;
  closeHttpServer: () => Promise<void>;
  /** Causal persistence queue status; failed or pending writes fail the shutdown. */
  persistenceStatus?: () => Readonly<{ pending: number; failures: number }>;
}>;

/**
 * Drain order for process shutdown.
 *
 * Gameplay production is stopped before durable evidence is flushed so no new
 * 10 Hz receipt can be enqueued after the flush boundary. Observer services are
 * stopped next because they are never mutation authority. Only after causal
 * persistence is durable do we close the HTTP listener.
 */
export async function drainAurionRuntimeForShutdown(
  dependencies: AurionShutdownDependencies,
): Promise<void> {
  const before = dependencies.persistenceStatus?.();
  console.info("[Aurion] shutdown stage: zone-gateway-close");
  // A failed final presence-leave tick must fail the shutdown, but only after every
  // already-enqueued causal write has been flushed.
  let gatewayError: unknown;
  try { dependencies.closeZoneGateway(); }
  catch (error) { gatewayError = error; console.error("[Aurion] shutdown zone-gateway-close failed", error); }
  console.info("[Aurion] shutdown stage: observer-stop");
  for (const stop of dependencies.stopObservers) stop();
  console.info("[Aurion] shutdown stage: persistence-flush");
  await dependencies.flushCausalPersistence();
  const after = dependencies.persistenceStatus?.();
  // The recorder counts failed writes instead of rejecting the flush. A final tick
  // (e.g. the shutdown presence leaves) that did not persist must not be reported
  // as a clean shutdown; the next start recovers the persisted head instead.
  if (before && after && (after.failures > before.failures || after.pending > 0)) {
    throw new Error(`CAUSAL_SHUTDOWN_PERSISTENCE_INCOMPLETE:failures=${after.failures - before.failures},pending=${after.pending}`);
  }
  if (gatewayError !== undefined) throw new Error("CAUSAL_SHUTDOWN_ZONE_CLOSE_FAILED", { cause: gatewayError });
  console.info("[Aurion] shutdown stage: http-close");
  await dependencies.closeHttpServer();
  console.info("[Aurion] shutdown stage: complete");
}
