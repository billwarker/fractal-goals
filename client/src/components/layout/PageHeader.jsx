import React from 'react';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './PageHeader.module.css';

function PageHeader({ title, subtitle, actions, className = '', hideTitleOnMobile = true }) {
    const isMobile = useIsMobile();
    const hideHeaderCopyVisually = isMobile && hideTitleOnMobile;

    return (
        <div className={`${styles.pageHeader} ${className}`.trim()}>
            <div className={`${styles.headerCopy} ${hideHeaderCopyVisually ? styles.mobileHiddenCopy : ''}`.trim()}>
                <h1 className={styles.pageTitle}>{title}</h1>
                {subtitle ? <p className={styles.pageSubtitle}>{subtitle}</p> : null}
            </div>

            {actions ? (
                <div className={`${styles.headerActions} ${isMobile ? styles.headerActionsMobile : ''}`.trim()}>
                    {actions}
                </div>
            ) : null}
        </div>
    );
}

export default PageHeader;
