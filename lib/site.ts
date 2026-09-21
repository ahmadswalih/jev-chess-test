/**
 * The canonical public origin.
 *
 * Absolute URLs are required for Open Graph and Twitter cards -- a relative
 * image path silently fails to unfurl. Vercel exposes the deployment host, so
 * preview builds get correct (if temporary) URLs without extra configuration,
 * and production uses the real domain.
 */

const FALLBACK = "https://beatjev.loopengine.tech";

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // Set by Vercel on every deployment; production aliases resolve to the
  // project's primary domain.
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;

  return FALLBACK;
}
