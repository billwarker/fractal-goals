import { useEffect, useState } from 'react';

/**
 * Activates a heavy section once it enters (or approaches) its page scroller.
 * Unsupported browsers render eagerly so progressive enhancement never hides
 * content or creates a navigation dead end.
 */
export default function useDeferredSection(targetRef, rootRef, rootMargin = '0px') {
    const supportsIntersectionObserver = (
        typeof window !== 'undefined'
        && typeof window.IntersectionObserver === 'function'
    );
    const [isReady, setIsReady] = useState(() => !supportsIntersectionObserver);

    useEffect(() => {
        if (isReady) return undefined;
        if (!supportsIntersectionObserver) return undefined;

        const target = targetRef.current;
        if (!target) return undefined;
        const observer = new window.IntersectionObserver((entries) => {
            if (!entries.some((entry) => entry.isIntersecting)) return;
            setIsReady(true);
            observer.disconnect();
        }, {
            root: rootRef.current || null,
            rootMargin,
            threshold: 0.01,
        });
        observer.observe(target);
        return () => observer.disconnect();
    }, [isReady, rootMargin, rootRef, supportsIntersectionObserver, targetRef]);

    return isReady;
}
