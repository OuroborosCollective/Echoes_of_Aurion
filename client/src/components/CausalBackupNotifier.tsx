/**
 * Reserved mount point for future server-authored backup receipts.
 *
 * The previous implementation converted a browser event into a success claim
 * without verifying any archive/checkpoint on the server. Until a concrete
 * CausalBackupReceipt is delivered to the client, this component is deliberately
 * silent rather than presenting synthetic evidence.
 */
export function CausalBackupNotifier() {
  return null;
}
