import React from 'react';

import styles from './ProgramSidePane.module.css';

export function alignmentSentence(alignment) {
    if (alignment?.aligned_ratio == null) return 'No completed activities to align';
    const percent = Math.round(alignment.aligned_ratio * 100);
    return alignment.basis === 'duration'
        ? `${percent}% of activity time aligned to program goals`
        : `${percent}% of activities aligned to program goals`;
}

/** Aligned-versus-other evidence bar; geometry lives in SVG attributes, not inline styles. */
export default function ProgramDayAlignmentBar({ alignment }) {
    const ratio = Math.max(0, Math.min(1, alignment?.aligned_ratio ?? 0));
    return (
        <span className={styles.alignmentCompact}>
            <svg
                className={styles.alignmentBar}
                viewBox="0 0 100 6"
                preserveAspectRatio="none"
                role="img"
                aria-label={alignmentSentence(alignment)}
            >
                <rect className={styles.alignmentTrack} x="0" y="0" width="100" height="6" rx="3" />
                {ratio > 0 ? (
                    <rect className={styles.alignmentFill} x="0" y="0" width={ratio * 100} height="6" rx="3" />
                ) : null}
            </svg>
            {alignment?.aligned_ratio != null ? (
                <span className={styles.alignmentText} aria-hidden="true">
                    {Math.round(alignment.aligned_ratio * 100)}% aligned
                </span>
            ) : null}
        </span>
    );
}
