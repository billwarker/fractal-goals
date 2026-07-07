/**
 * VideoEmbed — inline video player rendered from a note's markdown.
 *
 * Receives a validated descriptor from `videoEmbeds.parseVideoUrl`. Behaviour:
 *  - native files (kind: 'native')  → <video controls preload="none">
 *  - iframe providers (kind: 'iframe') → a lightweight *facade*: a poster/button
 *    is shown first and the heavy third-party iframe is only mounted on click.
 *    This keeps note timelines with many videos cheap to render.
 *  - Instagram additionally tries the backend oEmbed proxy (official embed HTML)
 *    and falls back to the plain /embed iframe when the proxy is unconfigured.
 *
 * A caption/source footer with an "open original" link is always shown, so the
 * evidence link survives even if the embed itself fails to load.
 */

import React, { useState } from 'react';
import { PlayIcon, AlertTriangleIcon } from '../atoms/AppIcons';
import { useInstagramOembed } from '../../hooks/useInstagramOembed';
import styles from './VideoEmbed.module.css';

const PROVIDER_LABEL = {
    youtube: 'YouTube',
    instagram: 'Instagram',
    googleDrive: 'Google Drive',
    file: 'Video',
};

const IFRAME_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
// Third-party players need scripts + same-origin (for their own storage) and
// presentation/fullscreen; deny form submission, top-navigation, downloads.
const IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox';

function EmbedFooter({ provider, sourceUrl, caption }) {
    return (
        <div className={styles.footer}>
            {caption && <span className={styles.caption}>{caption}</span>}
            <span className={styles.provider}>{PROVIDER_LABEL[provider] || 'Video'}</span>
            {sourceUrl && (
                <>
                    <span className={styles.footerSep} aria-hidden="true">·</span>
                    <a
                        className={styles.sourceLink}
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                    >
                        open original ↗
                    </a>
                </>
            )}
        </div>
    );
}

function FailureCard({ provider, sourceUrl, label }) {
    return (
        <div className={[styles.embed, styles.failedBox].join(' ')}>
            <div className={styles.failed}>
                <AlertTriangleIcon size={20} />
                <span className={styles.failedText}>
                    {label || `This ${PROVIDER_LABEL[provider] || 'video'} isn't publicly viewable.`}
                </span>
            </div>
            <EmbedFooter provider={provider} sourceUrl={sourceUrl} />
        </div>
    );
}

/** Native <video> playback for direct file links. */
function NativeVideo({ src, sourceUrl, caption }) {
    return (
        <div className={[styles.embed, styles.landscape].join(' ')}>
            {/* User-supplied evidence video; no caption track is available. */}
            <video className={styles.frame} src={src} controls preload="none" />
            <EmbedFooter provider="file" sourceUrl={sourceUrl} caption={caption} />
        </div>
    );
}

/** Facade → iframe for YouTube / Drive / Instagram. */
function IframeEmbed({ descriptor, caption, ratioClass, title, posterUrl: posterOverride }) {
    const { provider, embedUrl, sourceUrl } = descriptor;
    const posterUrl = posterOverride || descriptor.posterUrl;
    const [isPlaying, setIsPlaying] = useState(false);
    const [hasFailed, setHasFailed] = useState(false);

    if (hasFailed) {
        return <FailureCard provider={provider} sourceUrl={sourceUrl} />;
    }

    if (!isPlaying) {
        const label = caption || `Play ${PROVIDER_LABEL[provider] || 'video'}`;
        return (
            <div className={[styles.embed, ratioClass].join(' ')}>
                <button
                    type="button"
                    className={styles.poster}
                    onClick={() => setIsPlaying(true)}
                    aria-label={label}
                    style={posterUrl ? { backgroundImage: `url(${posterUrl})` } : undefined}
                >
                    <span className={styles.playBadge}>
                        <PlayIcon size={26} />
                    </span>
                    {!posterUrl && <span className={styles.posterLabel}>{label}</span>}
                </button>
                <EmbedFooter provider={provider} sourceUrl={sourceUrl} caption={caption} />
            </div>
        );
    }

    return (
        <div className={[styles.embed, ratioClass].join(' ')}>
            <iframe
                className={styles.frame}
                src={embedUrl}
                title={title}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox={IFRAME_SANDBOX}
                allow={IFRAME_ALLOW}
                allowFullScreen
                onError={() => setHasFailed(true)}
            />
            <EmbedFooter provider={provider} sourceUrl={sourceUrl} caption={caption} />
        </div>
    );
}

/**
 * Instagram: consult the oEmbed proxy for an official thumbnail (fixing the
 * guessed aspect ratio / fragile card), then play via the /embed iframe facade.
 * We deliberately do NOT inject Instagram's raw oEmbed HTML (no client-side
 * sanitizer available); we only use its structured thumbnail_url. When the
 * proxy is unconfigured or errors, the plain /embed facade still works.
 */
function InstagramEmbed({ descriptor, caption, title }) {
    const { data } = useInstagramOembed(descriptor.permalink);
    const posterUrl = data?.configured === true ? data?.thumbnail_url : undefined;
    return (
        <IframeEmbed
            descriptor={descriptor}
            caption={caption}
            ratioClass={styles.instagram}
            title={title}
            posterUrl={posterUrl}
        />
    );
}

function VideoEmbed({ descriptor, caption }) {
    if (!descriptor) return null;

    const { provider, kind } = descriptor;
    const title = caption || `${PROVIDER_LABEL[provider] || 'Embedded'} video`;

    if (kind === 'native') {
        return <NativeVideo src={descriptor.src} sourceUrl={descriptor.sourceUrl} caption={caption} />;
    }

    if (provider === 'instagram') {
        return <InstagramEmbed descriptor={descriptor} caption={caption} title={title} />;
    }

    const ratioClass = provider === 'instagram' ? styles.instagram : styles.landscape;
    return <IframeEmbed descriptor={descriptor} caption={caption} ratioClass={ratioClass} title={title} />;
}

export default VideoEmbed;
