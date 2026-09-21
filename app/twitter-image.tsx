/**
 * X / Twitter uses the same card as Open Graph.
 *
 * Declared explicitly rather than relying on the og:image fallback, so the
 * `twitter:image` tag is actually present in the markup.
 */

export { default, alt, size, contentType, runtime } from "./opengraph-image";
