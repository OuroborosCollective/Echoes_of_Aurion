export function verifyAcegResolution(resolution: AcegResolution): boolean {
  try {
    if (resolution.protocol !== AURION_ACEG_PROTOCOL) return false;
    const { resolutionHash, ...unsigned } = resolution;
    return (
      SHA256.test(resolutionHash) &&
      resolutionHash ===
        browserCanonicalSha256({
          domain: AURION_ACEG_PROTOCOL,
          resolution: unsigned,
        })
    );
  } catch {
    return false;
  }
}
