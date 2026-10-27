import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

import BodyPortal from '../layout/BodyPortal';
import styles from './NoteCard.module.css';

const GAP = 4;
const EDGE = 8; // Minimum distance from the viewport edge.

/**
 * Note "···" menu. The menu renders in a body portal at a fixed position, so the card keeps
 * its `content-visibility`/paint containment while it is open. Toggling that containment on
 * the card during a click crashed Chrome's renderer.
 */
export default function NoteOptionsMenu({ items, label = 'Note options', className = styles.optionsWrapper }) {
    const [open, setOpen] = useState(false);
    const trigger = useRef(null);
    const menu = useRef(null);
    const menuId = useId();

    // Position the open menu beside its button. This is DOM measurement, so it writes the
    // menu's style directly; the menu renders hidden until placed.
    useLayoutEffect(() => {
        const node = menu.current;
        if (!open || !trigger.current || !node) return;
        const bounds = trigger.current.getBoundingClientRect();
        const height = node.offsetHeight || 0;
        const width = node.offsetWidth || 0;
        const below = bounds.bottom + GAP + height <= window.innerHeight;
        // Right-align to the button unless that would push the menu off the left edge.
        const fitsLeftward = bounds.right - width >= EDGE;
        Object.assign(node.style, {
            left: fitsLeftward ? '' : `${Math.max(EDGE, Math.min(bounds.left, window.innerWidth - width - EDGE))}px`,
            right: fitsLeftward ? `${Math.max(EDGE, window.innerWidth - bounds.right)}px` : '',
            top: below ? `${bounds.bottom + GAP}px` : '',
            bottom: below ? '' : `${window.innerHeight - bounds.top + GAP}px`,
            visibility: 'visible',
        });
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        menu.current?.querySelector('[role="menuitem"]:not(:disabled)')?.focus();
        const close = (event) => {
            if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false);
        };
        const dismiss = () => setOpen(false);
        const keys = (event) => {
            const entries = Array.from(menu.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
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
        <div className={className}>
            <button
                ref={trigger}
                type="button"
                className={styles.optionsBtn}
                onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
                title="Options"
                aria-label={label}
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
                    aria-label={label}
                    className={styles.optionsMenu}
                    style={{ visibility: 'hidden', top: 0, right: 0 }}
                    onClick={(event) => event.stopPropagation()}
                >
                    {items.map((item) => (
                        <button
                            key={item.label}
                            type="button"
                            role="menuitem"
                            disabled={item.disabled}
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
