import React from 'react';

import styles from './LoadingSkeleton.module.css';

const SHAPES = {
    list: { rows: 5, className: 'list' },
    cards: { rows: 6, className: 'cards' },
    chart: { rows: 12, className: 'chart' },
    detail: { rows: 6, className: 'detail' },
    tree: { rows: 6, className: 'tree' },
};

// Varied bar heights so a chart placeholder reads as a chart.
const CHART_HEIGHTS = [45, 70, 55, 85, 60, 40, 75, 90, 50, 65, 80, 58];

/** Grey placeholder shapes roughly matching the content that is loading. Decorative only. */
function LoadingSkeleton({ kind = 'list' }) {
    const shape = SHAPES[kind] || SHAPES.list;
    return (
        <div className={`${styles.skeleton} ${styles[shape.className]}`} aria-hidden="true">
            {Array.from({ length: shape.rows }, (_, index) => (
                <span
                    key={index}
                    className={styles.block}
                    style={{ '--index': index, ...(kind === 'chart' ? { height: `${CHART_HEIGHTS[index]}%` } : null) }}
                />
            ))}
        </div>
    );
}

export default LoadingSkeleton;
