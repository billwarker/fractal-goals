import React from 'react';
import styles from './PageHeader.module.css';

function PageHeader({ title, subtitle, actions, className = '' }) {
    return (
        <div className={`${styles.pageHeader} ${className}`.trim()}>
            <div className={styles.headerCopy}>
                <h1 className={styles.pageTitle}>{title}</h1>
                {subtitle ? <p className={styles.pageSubtitle}>{subtitle}</p> : null}
            </div>

            {actions ? <div className={styles.headerActions}>{actions}</div> : null}
        </div>
    );
}

export default PageHeader;
