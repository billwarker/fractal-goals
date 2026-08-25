/**
 * Document versions, split out from `legalContent.js` so consent capture does
 * not pull the full markdown of both documents into whatever bundle imports
 * it. `AuthProvider` is part of the public landing provider envelope, which
 * has a hard gzip budget enforced by the production build.
 *
 * These MUST match the `version:` headers in privacy.md and terms.md. The
 * legalContent test asserts that they agree, so a bump in one place without
 * the other fails the suite rather than silently recording a wrong version.
 */
export const TERMS_VERSION = '1.0';
export const PRIVACY_VERSION = '1.0';
