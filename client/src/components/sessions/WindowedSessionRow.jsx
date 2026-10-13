import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Keep measured spacers while expensive cards are outside the scroll viewport. */
export default function WindowedSessionRow({ children, label, pinned = false }) {
    const row = useRef(null);
    const focusFromSpacer = useRef(false);
    const [nearViewport, setNearViewport] = useState(true);
    const [focused, setFocused] = useState(false);
    const [height, setHeight] = useState(260);
    const mounted = nearViewport || pinned || focused;
    useLayoutEffect(() => {
        if (typeof IntersectionObserver === 'undefined') return undefined;
        const bounds = row.current.getBoundingClientRect();
        if (bounds.height > 0) setHeight(bounds.height);
        setNearViewport(bounds.bottom >= -800 && bounds.top <= window.innerHeight + 800);
        const observer = new IntersectionObserver(([entry]) => setNearViewport(entry.isIntersecting), { rootMargin: '800px' });
        observer.observe(row.current);
        return () => observer.disconnect();
    }, []);
    useEffect(() => {
        if (!mounted || typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(([entry]) => {
            const measured = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
            if (measured > 0) setHeight(measured);
        });
        observer.observe(row.current);
        return () => observer.disconnect();
    }, [mounted]);
    useEffect(() => {
        if (mounted && focusFromSpacer.current) {
            focusFromSpacer.current = false;
            row.current?.querySelector('a[href], button:not([disabled])')?.focus();
        }
    }, [mounted]);
    return <div ref={row}
        style={mounted ? undefined : { height }}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
        data-session-window-row
    >
        {mounted ? children : <button type="button" style={{ width: '100%', height: '100%' }} onFocus={() => { focusFromSpacer.current = true; setFocused(true); }}>
            View session {label}
        </button>}
    </div>;
}
