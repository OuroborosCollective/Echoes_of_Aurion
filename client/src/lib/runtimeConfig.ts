const configuredApiOrigin = String(import.meta.env.VITE_AURION_API_ORIGIN ?? "").trim().replace(/\/$/, "");

/**
 * Resolve API routes for both the first-party SPA and the cross-origin itch.io
 * HTML5 iframe. Empty configuration intentionally keeps local development same-origin.
 */
export function aurionApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return configuredApiOrigin ? `${configuredApiOrigin}${normalizedPath}` : normalizedPath;
}

export function aurionApiOrigin(): string {
  return configuredApiOrigin;
}
