import React from 'react';
import useIsMobile from '../../hooks/useIsMobile';
import styles from './PageHeader.module.css';

function PageHeader({
    title,
    subtitle,
    actions,
    className = '',
    hideTitleOnMobile = true,
    titleAccessory = null,
    style,
    compactMobileContext = false,
}) {
    const isMobile = useIsMobile();
    const hideHeaderCopyVisually = isMobile && hideTitleOnMobile;
    const headerClassName = [
        styles.pageHeader,
        compactMobileContext ? styles.compactMobileContext : '',
        className,
    ].filter(Boolean).join(' ');

    return (
        <div className={headerClassName} style={style}>
            <div className={`${styles.headerCopy} ${hideHeaderCopyVisually ? styles.mobileHiddenCopy : ''}`.trim()}>
                <div className={styles.titleRow}>
                    <h1 className={styles.pageTitle}>{title}</h1>
                    {titleAccessory ? (
                        <span className={styles.titleAccessory}>{titleAccessory}</span>
                    ) : null}
                </div>
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
