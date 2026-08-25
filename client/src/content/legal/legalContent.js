import privacySource from './privacy.md?raw';
import termsSource from './terms.md?raw';

/**
 * Legal documents are authored as markdown so copy can be revised without
 * touching JSX. Each file carries an HTML comment header holding its version
 * and effective date; those values are the record of what a user accepted, so
 * they are parsed from the document itself rather than duplicated here.
 *
 * A version bump must also update legalVersions.js and the backend Config
 * constants. Tests keep the display and browser submission versions aligned;
 * the API rejects stale or fabricated versions.
 */

const METADATA_PATTERN = /<!--([\s\S]*?)-->/;

function readMetadata(source) {
    const match = METADATA_PATTERN.exec(source || '');
    if (!match) return {};

    return match[1].split('\n').reduce((accumulated, line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) return accumulated;

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();
        if (key && value) accumulated[key] = value;
        return accumulated;
    }, {});
}

/** Strips the metadata comment so it never renders as an empty node. */
function readBody(source) {
    return (source || '').replace(METADATA_PATTERN, '').trimStart();
}

function buildDocument(source, { id, title, path }) {
    const metadata = readMetadata(source);
    return {
        id,
        title,
        path,
        version: metadata.version || '1.0',
        effective: metadata.effective || '',
        body: readBody(source),
    };
}

export const PRIVACY_DOCUMENT = buildDocument(privacySource, {
    id: 'privacy',
    title: 'Privacy Policy',
    path: '/privacy',
});

export const TERMS_DOCUMENT = buildDocument(termsSource, {
    id: 'terms',
    title: 'Terms of Service',
    path: '/terms',
});

export const LEGAL_DOCUMENTS = [TERMS_DOCUMENT, PRIVACY_DOCUMENT];

export const PRIVACY_VERSION = PRIVACY_DOCUMENT.version;
export const TERMS_VERSION = TERMS_DOCUMENT.version;

export function getLegalDocument(id) {
    return LEGAL_DOCUMENTS.find((document) => document.id === id) || null;
}

/** Formats an ISO effective date for display, tolerating a malformed header. */
export function formatEffectiveDate(effective) {
    if (!effective) return '';
    const parsed = new Date(`${effective}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return effective;

    return parsed.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });
}
