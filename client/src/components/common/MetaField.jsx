import React from 'react';

import styles from './MetaField.module.css';

function MetaField({
    label,
    value,
    muted = false,
    emphasize = false,
    className = '',
    valueClassName = '',
}) {
    return (
        <div className={`${styles.field} ${className}`.trim()}>
            <div className={styles.label}>{label}</div>
            <div
                className={[
                    muted ? styles.valueMuted : styles.value,
                    emphasize ? styles.valueEmphasized : '',
                    valueClassName,
                ].filter(Boolean).join(' ')}
            >
                {value}
            </div>
        </div>
    );
}

export default MetaField;
