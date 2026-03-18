import React from 'react';

import styles from './SectionHeader.module.css';

function SectionHeader({
    title,
    meta = null,
    actions = null,
    className = '',
    contentClassName = '',
    actionsClassName = '',
}) {
    return (
        <div className={`${styles.header} ${className}`.trim()}>
            <div className={`${styles.content} ${contentClassName}`.trim()}>
                <div className={styles.title}>{title}</div>
                {meta ? <div className={styles.meta}>{meta}</div> : null}
            </div>
            {actions ? <div className={`${styles.actions} ${actionsClassName}`.trim()}>{actions}</div> : null}
        </div>
    );
}

export default SectionHeader;
