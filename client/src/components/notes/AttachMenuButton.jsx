import React, { useEffect, useId, useRef, useState } from 'react';

import { PaperclipIcon } from '../atoms/AppIcons';
import DropdownMenu, { DropdownMenuItem } from '../atoms/DropdownMenu';
import { AttachmentFileInput, CloudPicker } from './NoteAttachmentsEditor';
import styles from './AttachMenuButton.module.css';

/**
 * Quick-bar paperclip: one button whose menu offers this device or cloud storage.
 * Pasting or dropping files onto the bar bypasses the menu.
 */
export default function AttachMenuButton({ draft, disabled = false, className = styles.button, placement = 'up', onPickerClosed }) {
    const [open, setOpen] = useState(false);
    const [choosing, setChoosing] = useState(false);
    const container = useRef(null);
    const trigger = useRef(null);
    const menu = useRef(null);
    const fileInput = useRef(null);
    const menuId = useId();

    useEffect(() => {
        if (!open) return undefined;
        menu.current?.querySelector('[role="menuitem"]')?.focus();
        const close = (event) => { if (!container.current?.contains(event.target)) setOpen(false); };
        const keys = (event) => {
            const items = Array.from(menu.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || []);
            const index = items.indexOf(document.activeElement);
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
            if (event.key === 'ArrowDown') { event.preventDefault(); items[(index + 1) % items.length]?.focus(); }
            if (event.key === 'ArrowUp') { event.preventDefault(); items[(index - 1 + items.length) % items.length]?.focus(); }
            if (event.key === 'Tab') setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        document.addEventListener('keydown', keys);
        return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', keys); };
    }, [open]);

    const blocked = disabled || !draft.canAdd;
    return (
        <span className={styles.attach} ref={container}>
            <button
                ref={trigger}
                type="button"
                className={className}
                disabled={blocked}
                aria-label="Attach pictures, video or audio"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                title={draft.canAdd ? 'Attach pictures, video or audio (you can also paste or drop them)' : 'Up to 8 attachments per note'}
                onClick={() => setOpen((value) => !value)}
            >
                <PaperclipIcon size={20} />
            </button>
            {open && (
                <DropdownMenu ref={menu} id={menuId} className={placement === 'down' ? styles.menuDown : styles.menu} align="right" aria-label="Attach from">
                    <DropdownMenuItem onClick={() => { setOpen(false); fileInput.current?.click(); }}>
                        <span className={styles.item}>
                            <span>From this device</span>
                            {draft.destinationLabel && <span className={styles.detail}>Saved to {draft.destinationLabel}</span>}
                        </span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setOpen(false); setChoosing(true); }}>
                        From cloud storage
                    </DropdownMenuItem>
                </DropdownMenu>
            )}
            <AttachmentFileInput ref={fileInput} draft={draft} />
            {choosing && <CloudPicker draft={draft} onClose={() => { setChoosing(false); onPickerClosed?.(); }} />}
        </span>
    );
}
