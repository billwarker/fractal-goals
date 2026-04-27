import React from 'react';
import styles from './SidePaneHeader.module.css';

function SidePaneHeader({
    title,
    subtitle,
    actions,
    children,
    className = '',
}) {
    const hasCopy = Boolean(title || subtitle);

    return (
        <div className={`${styles.header} ${className}`.trim()}>
            {hasCopy ? (
                <div className={styles.copy}>
                    {title ? <div className={styles.title}>{title}</div> : null}
                    {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
                </div>
            ) : children ? (
                <div className={styles.content}>{children}</div>
            ) : null}

            {actions ? (
                <div className={styles.actions}>{actions}</div>
            ) : null}

            {hasCopy && children ? (
                <div className={styles.contentFull}>{children}</div>
            ) : null}
        </div>
    );
}

export default SidePaneHeader;
