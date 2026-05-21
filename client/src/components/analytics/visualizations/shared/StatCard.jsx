import React from 'react';

import styles from '../../ProfileWindow.module.css';

export default function StatCard({ value, label, subLabel, color }) {
    return (
        <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color }}>
                {value}
            </div>
            <div>
                <div className={styles.statLabel}>{label}</div>
                {subLabel && <div className={styles.statSubLabel}>{subLabel}</div>}
            </div>
        </div>
    );
}
