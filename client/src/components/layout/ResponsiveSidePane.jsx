import React from 'react';

import ModalBackdrop from '../atoms/ModalBackdrop';
import BodyPortal from './BodyPortal';
import SheetHandle from './SheetHandle';
import styles from './ResponsiveSidePane.module.css';

/**
 * A page's right-hand side pane: inline on desktop, and on mobile a bottom sheet
 * portalled to the body with a dismissing backdrop. The sheet entrance classes
 * only animate inside the mobile media query.
 */
export default function ResponsiveSidePane({
    open,
    isMobile,
    onClose,
    panelClassName,
    backdropClassName,
    constrainToVisualViewport = true,
    children,
}) {
    if (!open) return null;
    if (!isMobile) return <div className={`${panelClassName} mobile-sheet-enter`}>{children}</div>;
    return (
        <BodyPortal>
            <ModalBackdrop
                className={`${backdropClassName} mobile-sheet-backdrop-enter`}
                constrainToVisualViewport={constrainToVisualViewport}
                onClose={onClose}
                aria-hidden="true"
            />
            <div className={`${panelClassName} ${styles.sheet} mobile-sheet-enter`}>
                <SheetHandle onDismiss={onClose} />
                {children}
            </div>
        </BodyPortal>
    );
}
