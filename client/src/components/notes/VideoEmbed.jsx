/**
 * VideoEmbed — inline YouTube / Instagram player rendered from a note's markdown.
 *
 * Receives an already-validated embed descriptor from `videoEmbeds.parseVideoUrl`.
 * The iframe is lazy-mounted once the container nears the viewport so notes with
 * many embeds don't load every player at once.
 */

import React, { useEffect, useRef, useState } from 'react';
import styles from './VideoEmbed.module.css';

const PROVIDER_LABEL = {
    youtube: 'YouTube video',
    instagram: 'Instagram video',
    googleDrive: 'Google Drive video',
};

function VideoEmbed({ provider, embedUrl }) {
    const containerRef = useRef(null);
    const [isVisible, setIsVisible] = useState(
        typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined'
    );

    useEffect(() => {
        if (isVisible || !containerRef.current) return undefined;

        const observer = new window.IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setIsVisible(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '400px 0px' }
        );
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [isVisible]);

    // Instagram embeds are portrait cards; everything else is a 16:9 player.
    const isInstagram = provider === 'instagram';

    return (
        <div
            ref={containerRef}
            className={[styles.embed, isInstagram ? styles.instagram : styles.landscape]
                .filter(Boolean)
                .join(' ')}
        >
            {isVisible && (
                <iframe
                    className={styles.frame}
                    src={embedUrl}
                    title={PROVIDER_LABEL[provider] || 'Embedded video'}
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                    allowFullScreen
                />
            )}
        </div>
    );
}

export default VideoEmbed;
