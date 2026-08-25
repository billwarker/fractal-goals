import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import useAnchoredPortalPosition from '../../hooks/useAnchoredPortalPosition';
import DropdownMenu, { DropdownMenuItem } from '../atoms/DropdownMenu';
import HeaderButton from '../layout/HeaderButton';
import styles from './ManageActivitiesCreateMenu.module.css';


const CREATE_OPTIONS = [
    {
        key: 'activity',
        label: 'Activity',
        description: 'Create a reusable activity definition.',
    },
    {
        key: 'group',
        label: 'Activity Group',
        description: 'Organize activities and circuits.',
    },
    {
        key: 'circuit',
        label: 'Activity Circuit',
        description: 'Repeat an ordered sequence of activities.',
    },
];

export default function ManageActivitiesCreateMenu({
    onCreateActivity,
    onCreateGroup,
    onCreateCircuit,
    triggerClassName = '',
}) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const menuRef = useRef(null);

    useAnchoredPortalPosition({
        open: isOpen,
        anchorRef: containerRef,
        anchorSelector: 'button',
        overlayRef: menuRef,
    });

    useEffect(() => {
        if (isOpen) menuRef.current?.querySelector('[role="menuitem"]')?.focus();
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return undefined;

        const closeOnOutsidePointer = (event) => {
            if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
                setIsOpen(false);
            }
        };
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape') return;
            setIsOpen(false);
            containerRef.current?.querySelector('button')?.focus();
        };

        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, [isOpen]);

    const handlers = {
        activity: onCreateActivity,
        group: onCreateGroup,
        circuit: onCreateCircuit,
    };

    const selectOption = (key) => {
        setIsOpen(false);
        handlers[key]?.();
    };

    const toggleMenu = () => setIsOpen((open) => !open);

    const menu = isOpen ? createPortal(
        <DropdownMenu
            ref={menuRef}
            className={styles.menu}
            align="left"
            aria-label="Create"
        >
            {CREATE_OPTIONS.map((option) => (
                <DropdownMenuItem
                    key={option.key}
                    aria-label={option.label}
                    onClick={() => selectOption(option.key)}
                >
                    <span className={styles.optionCopy}>
                        <strong>{option.label}</strong>
                        <span>{option.description}</span>
                    </span>
                </DropdownMenuItem>
            ))}
        </DropdownMenu>,
        document.body,
    ) : null;

    return (
        <div className={styles.container} ref={containerRef}>
            <HeaderButton
                variant="primary"
                className={triggerClassName}
                onClick={toggleMenu}
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                <span aria-hidden="true">+</span>
                Create
                <span className={styles.chevron} aria-hidden="true">▾</span>
            </HeaderButton>
            {menu}
        </div>
    );
}
