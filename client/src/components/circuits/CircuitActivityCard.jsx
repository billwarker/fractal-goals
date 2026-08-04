import React from 'react';

import styles from './CircuitActivityCard.module.css';


export default function CircuitActivityCard({ name, compact = false, className = '' }) {
    return (
        <div className={`${styles.card} ${compact ? styles.compact : ''} ${className}`}>
            <strong>{name || 'Unavailable activity'}</strong>
        </div>
    );
}
