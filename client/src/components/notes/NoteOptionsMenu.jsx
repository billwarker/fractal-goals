import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import BodyPortal from '../layout/BodyPortal';
import styles from './NoteCard.module.css';

const GAP = 4;

/**
 * Note "···" menu. The menu renders in a body portal at a fixed position, so the card keeps
 * its `content-visibility`/paint containment while it is open. Toggling that containment on
 * the card during a click crashed Chrome's renderer.
 */
export default function NoteOptionsMenu({ items }) {
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState(null);
    const trigger = useRef(null);
    const menu = useRef(null);
    const menuId = useId();

    useLayoutEffect(() => {
        if (!open || !trigger.current) return;
        const bounds = trigger.current.getBoundingClientRect();
        const height = menu.current?.offsetHeight || 0;
        const below = bounds.bottom + GAP + height <= window.innerHeight;
        setPosition({
            right: Math.max(8, window.innerWidth - bounds.right),
            ...(below ? { top: bounds.bottom + GAP } : { bottom: window.innerHeight - bounds.top + GAP }),
        });
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        menu.current?.querySelector('[role="menuitem"]')?.focus();
        const close = (event) => {
            if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
        };
        const dismiss = () => setOpen(false);
        const keys = (event) => {
            const entries = Array.from(menu.current?.querySelectorAll('[role="menuitem"]') || []);
            const index = entries.indexOf(document.activeElement);
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
            if (event.key === 'ArrowDown') { event.preventDefault(); entries[(index + 1) % entries.length]?.focus(); }
            if (event.key === 'ArrowUp') { event.preventDefault(); entries[(index - 1 + entries.length) % entries.length]?.focus(); }
            if (event.key === 'Tab') setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', keys);
        // A fixed menu would drift from its button; close instead of following the scroll.
        window.addEventListener('scroll', dismiss, true);
        window.addEventListener('resize', dismiss);
        return () => {
            document.removeEventListener('pointerdown', close);
            document.removeEventListener('keydown', keys);
            window.removeEventListener('scroll', dismiss, true);
            window.removeEventListener('resize', dismiss);
        };
    }, [open]);

    return (
        <div className={styles.optionsWrapper}>
            <button
                ref={trigger}
                type="button"
                className={styles.optionsBtn}
                onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
                title="Options"
                aria-label="Note options"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
            >
                ···
            </button>
            <BodyPortal when={open}>
                <div
                    ref={menu}
                    id={menuId}
                    role="menu"
                    aria-label="Note options"
                    className={styles.optionsMenu}
                    style={position || { visibility: 'hidden', top: 0, right: 0 }}
                    onClick={(event) => event.stopPropagation()}
                >
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            className={`${styles.optionsMenuItem} ${item.danger ? styles.optionsMenuItemDanger : ''}`}
                            onClick={(event) => { setOpen(false); item.onSelect(event); }}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </BodyPortal>
        </div>
    );
}
