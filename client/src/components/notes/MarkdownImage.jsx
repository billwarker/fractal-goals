import React, { useState } from 'react';

import styles from './MediaAttachment.module.css';

export default function MarkdownImage({ src, alt = '' }) {
    const [failed, setFailed] = useState(false);
    if (!src || !/^https:\/\//i.test(src)) return <span>{alt || 'Image link unavailable'}</span>;
    return <span className={styles.markdownImage}>
        {failed ? <a href={src} target="_blank" rel="noopener noreferrer">{alt || 'Open image'}</a>
            : <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />}
    </span>;
}
