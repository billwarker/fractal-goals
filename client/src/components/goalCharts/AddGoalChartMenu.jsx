import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import Button from '../atoms/Button';
import DropdownMenu, { DropdownMenuItem } from '../atoms/DropdownMenu';
import useAnchoredPortalPosition from '../../hooks/useAnchoredPortalPosition';
import { useAnalyticsViews } from '../../hooks/useDashboardQueries';
import { useGoalChartMutations, viewAttachProblem } from '../../hooks/useGoalCharts';
import { viewChartKey } from './goalChartItems';
import styles from './GoalCharts.module.css';

/**
 * "Add chart": the fractal's saved views not yet on this goal. Views that can't show on a goal
 * (session charts, empty views) are listed disabled with the reason.
 */
export default function AddGoalChartMenu({ rootId, goalId, attachedIds, onAdded, label = 'Add chart', portalTarget = null }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);
    const menuRef = useRef(null);
    const { analyticsViewItems, isLoading } = useAnalyticsViews(isOpen ? rootId : null);
    const { attach, isSaving } = useGoalChartMutations(rootId, goalId);
    const candidates = analyticsViewItems.filter((view) => !attachedIds.has(view.id));

    useAnchoredPortalPosition({ open: isOpen, anchorRef: containerRef, anchorSelector: 'button', overlayRef: menuRef });

    useEffect(() => {
        if (!isOpen) return undefined;
        const closeOnOutsidePointer = (event) => {
            if (!containerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setIsOpen(false);
        };
        const closeOnEscape = (event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setIsOpen(false);
            containerRef.current?.querySelector('button')?.focus();
        };
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        document.addEventListener('keydown', closeOnEscape, true);
        return () => {
            document.removeEventListener('pointerdown', closeOnOutsidePointer);
            document.removeEventListener('keydown', closeOnEscape, true);
        };
    }, [isOpen]);

    const add = async (view) => {
        setIsOpen(false);
        if (await attach(view.id)) onAdded?.(viewChartKey(view.id));
    };

    const menu = isOpen ? createPortal(
        <DropdownMenu ref={menuRef} className={styles.menu} align="left" aria-label="Saved views">
            {isLoading ? <p className={styles.menuNote} role="status">Loading saved views…</p> : null}
            {!isLoading && candidates.length === 0 ? (
                <p className={styles.menuNote}>No saved views to add. Save a view in Analytics first.</p>
            ) : null}
            {candidates.map((view) => {
                const problem = viewAttachProblem(view);
                return (
                    <DropdownMenuItem key={view.id} disabled={Boolean(problem) || isSaving} onClick={() => add(view)}>
                        <span className={styles.menuItemCopy}>
                            <strong>{view.name}</strong>
                            {problem ? <span>{problem}</span> : null}
                        </span>
                    </DropdownMenuItem>
                );
            })}
        </DropdownMenu>,
        portalTarget || document.body,
    ) : null;

    return (
        <div className={styles.menuAnchor} ref={containerRef}>
            <Button variant="ghost" size="sm"
                onClick={() => setIsOpen((open) => !open)}
                aria-haspopup="menu"
                aria-expanded={isOpen}
            >
                + {label}
            </Button>
            {menu}
        </div>
    );
}
