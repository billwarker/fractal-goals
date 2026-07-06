/**
 * videoEmbeds — parse YouTube, Instagram, and Google Drive URLs into safe,
 * embeddable player URLs.
 *
 * Used by the notes markdown pipeline to turn a bare video URL (pasted on its own
 * line) into an inline player. Only allowlisted hosts produce an embed; everything
 * else returns null and is rendered as an ordinary link.
 *
 * Note: an embed only *displays* if the underlying content is viewable without the
 * viewer's credentials. Private Instagram posts and Drive files set to "Restricted"
 * will render the provider's own access-denied placeholder; use "anyone with the
 * link" (Drive) or unlisted/public content for evidence that must be viewable.
 */

const YOUTUBE_HOSTS = new Set([
    'youtube.com',
    'www.youtube.com',
    'm.youtube.com',
    'music.youtube.com',
    'youtu.be',
    'www.youtu.be',
]);

const INSTAGRAM_HOSTS = new Set([
    'instagram.com',
    'www.instagram.com',
]);

const GOOGLE_DRIVE_HOSTS = new Set([
    'drive.google.com',
    'docs.google.com',
]);

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const INSTAGRAM_TYPES = new Set(['p', 'reel', 'reels', 'tv']);
const INSTAGRAM_SHORTCODE_PATTERN = /^[A-Za-z0-9_-]+$/;
const GOOGLE_DRIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Convert a YouTube `t`/`start` timestamp value into whole seconds.
 * Supports raw seconds ("90"), and "1h2m3s" style values.
 */
function parseYoutubeStart(raw) {
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
        const seconds = parseInt(raw, 10);
        return seconds > 0 ? seconds : null;
    }
    const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
    if (!match || (!match[1] && !match[2] && !match[3])) return null;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    const total = hours * 3600 + minutes * 60 + seconds;
    return total > 0 ? total : null;
}

function extractYoutubeId(url) {
    const host = url.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'www.youtu.be') {
        return url.pathname.slice(1).split('/')[0] || null;
    }

    const segments = url.pathname.split('/').filter(Boolean);
    // /watch?v=<id>
    if (segments[0] === 'watch') {
        return url.searchParams.get('v');
    }
    // /shorts/<id>, /embed/<id>, /live/<id>
    if (['shorts', 'embed', 'live'].includes(segments[0]) && segments[1]) {
        return segments[1];
    }
    return null;
}

function parseYoutube(url) {
    const id = extractYoutubeId(url);
    if (!id || !YOUTUBE_ID_PATTERN.test(id)) return null;

    const start = parseYoutubeStart(
        url.searchParams.get('start') || url.searchParams.get('t')
    );
    // youtube-nocookie is the privacy-enhanced embed host.
    let embedUrl = `https://www.youtube-nocookie.com/embed/${id}`;
    if (start) {
        embedUrl += `?start=${start}`;
    }
    return { provider: 'youtube', id, embedUrl };
}

function parseInstagram(url) {
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length < 2) return null;

    const type = segments[0].toLowerCase();
    const shortcode = segments[1];
    if (!INSTAGRAM_TYPES.has(type)) return null;
    if (!INSTAGRAM_SHORTCODE_PATTERN.test(shortcode)) return null;

    // Instagram serves posts, reels and IGTV under /p|reel|tv/<shortcode>/embed.
    const normalizedType = type === 'reels' ? 'reel' : type;
    return {
        provider: 'instagram',
        id: shortcode,
        embedUrl: `https://www.instagram.com/${normalizedType}/${shortcode}/embed`,
    };
}

/**
 * Extract a Google Drive *file* id. Only individual files have a playable
 * `/preview` embed — folder links (`/drive/folders/<id>`) return null so they
 * fall through to a plain link.
 */
function extractDriveFileId(url) {
    const segments = url.pathname.split('/').filter(Boolean);
    // /file/d/<id>/(view|preview|edit)
    const fileIdx = segments.indexOf('file');
    if (fileIdx !== -1 && segments[fileIdx + 1] === 'd' && segments[fileIdx + 2]) {
        return segments[fileIdx + 2];
    }
    // /open?id=<id> and /uc?id=<id>
    if ((segments[0] === 'open' || segments[0] === 'uc') && url.searchParams.get('id')) {
        return url.searchParams.get('id');
    }
    return null;
}

function parseGoogleDrive(url) {
    const id = extractDriveFileId(url);
    if (!id || !GOOGLE_DRIVE_ID_PATTERN.test(id)) return null;

    // Google's sanctioned embed player for a Drive file.
    return {
        provider: 'googleDrive',
        id,
        embedUrl: `https://drive.google.com/file/d/${id}/preview`,
    };
}

/**
 * parseVideoUrl(url) → { provider, id, embedUrl } | null
 * Returns an embed descriptor for allowlisted YouTube/Instagram/Google Drive
 * URLs, else null.
 */
export function parseVideoUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;

    let url;
    try {
        url = new URL(rawUrl.trim());
    } catch {
        return null;
    }

    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname.toLowerCase();
    if (YOUTUBE_HOSTS.has(host)) {
        return parseYoutube(url);
    }
    if (INSTAGRAM_HOSTS.has(host)) {
        return parseInstagram(url);
    }
    if (GOOGLE_DRIVE_HOSTS.has(host)) {
        return parseGoogleDrive(url);
    }
    return null;
}

export default parseVideoUrl;
