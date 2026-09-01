import { useEffect, useRef } from 'react';

import { useModalBackdropDismiss } from '../../hooks/useModalBackdropDismiss';
import styles from './ModalBackdrop.module.css';

function ModalBackdrop({
    children,
    className,
    closeOnBackdrop = true,
    constrainToVisualViewport = true,
    guardTextEditing = true,
    onClose,
    ...rest
}) {
    const backdropRef = useRef(null);
    const backdropDismissHandlers = useModalBackdropDismiss(onClose, { guardTextEditing });

    useEffect(() => {
        if (!constrainToVisualViewport) return undefined;

        const visualViewport = window.visualViewport;
        const syncVisualViewport = () => {
            if (!backdropRef.current) return;

            const viewportHeight = visualViewport?.height || window.innerHeight;
            const viewportWidth = visualViewport?.width || window.innerWidth;
            const viewportTop = visualViewport?.offsetTop || 0;
            const viewportLeft = visualViewport?.offsetLeft || 0;

            backdropRef.current.style.setProperty('--modal-viewport-height', `${viewportHeight}px`);
            backdropRef.current.style.setProperty('--modal-viewport-width', `${viewportWidth}px`);
            backdropRef.current.style.setProperty('--modal-viewport-top', `${viewportTop}px`);
            backdropRef.current.style.setProperty('--modal-viewport-left', `${viewportLeft}px`);
        };

        syncVisualViewport();
        window.addEventListener('resize', syncVisualViewport);
        visualViewport?.addEventListener('resize', syncVisualViewport);
        visualViewport?.addEventListener('scroll', syncVisualViewport);

        return () => {
            window.removeEventListener('resize', syncVisualViewport);
            visualViewport?.removeEventListener('resize', syncVisualViewport);
            visualViewport?.removeEventListener('scroll', syncVisualViewport);
        };
    }, [constrainToVisualViewport]);

    return (
        <div
            {...rest}
            ref={backdropRef}
            className={`${constrainToVisualViewport ? styles.visualViewport : ''} ${className || ''}`.trim()}
            {...(closeOnBackdrop ? backdropDismissHandlers : {})}
        >
            {children}
        </div>
    );
}

export default ModalBackdrop;
