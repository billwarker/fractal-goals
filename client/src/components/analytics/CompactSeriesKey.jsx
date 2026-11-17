import React from 'react';

import styles from './CompactSeriesKey.module.css';

/**
 * A compact chart's caption: a colour swatch and name for each line (with its detail, such as a
 * goal), then a note such as the session count. Stands in for the legend compact charts hide.
 */
export default function CompactSeriesKey({ series = [], note = null }) {
    return (
        <span className={styles.key}>
            {series.map((item) => (
                <span key={item.key ?? item.label} className={styles.item}>
                    <span className={styles.swatch} style={{ background: item.color }} aria-hidden="true" />
                    {item.label}
                    {item.detail ? ` ${item.detail}` : null}
                </span>
            ))}
            {note ? <span className={styles.note}>{note}</span> : null}
        </span>
    );
}
