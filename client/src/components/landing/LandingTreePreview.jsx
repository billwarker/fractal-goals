import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import FlowTree from '../../FlowTree';
import { GoalLevelsProvider } from '../../contexts/GoalLevelsContext';
import styles from './LandingTreePreview.module.css';

// The landing's background grid (Landing.module.css: 20px cells, lines at each multiple).
const GRID = 20;
// Room kept clear right of and below the frame.
const RIGHT_GAP = 48;
const BOTTOM_GAP = 20;

/**
 * The tree's frame inside the panel, with every edge on a line of the page's grid, so the
 * outline shown while visitors use the tree sits exactly on the background.
 */
function useGridFrame(panelRef) {
    const [frame, setFrame] = useState(null);
    useLayoutEffect(() => {
        const panel = panelRef.current;
        const page = panel?.closest('[data-landing-ready-surface]');
        if (!panel || !page) return undefined;
        const measure = () => {
            const box = panel.getBoundingClientRect();
            const origin = page.getBoundingClientRect();
            const left = box.left - origin.left;
            const top = box.top - origin.top;
            const snappedLeft = Math.ceil(left / GRID) * GRID;
            const snappedTop = Math.ceil(top / GRID) * GRID;
            const snappedRight = Math.floor((left + box.width - RIGHT_GAP) / GRID) * GRID;
            const snappedBottom = Math.floor((top + box.height - BOTTOM_GAP) / GRID) * GRID;
            setFrame({
                left: snappedLeft - left,
                top: snappedTop - top,
                width: Math.max(GRID, snappedRight - snappedLeft),
                height: Math.max(GRID, snappedBottom - snappedTop),
            });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(panel);
        observer.observe(page);
        return () => observer.disconnect();
    }, [panelRef]);
    return frame;
}

/**
 * A demo example's goal tree, drawn by the app's own flow tree from the published preview
 * (services/landing_publish_service.py). Visitors can pan and zoom it; clicking a goal opens
 * the live demo on that goal.
 */
export default function LandingTreePreview({ example, goalHref, onOpen }) {
    const { tree, levels } = example.preview;
    const panelRef = useRef(null);
    const frame = useGridFrame(panelRef);
    const openGoal = useCallback((node) => {
        onOpen?.();
        window.location.assign(goalHref(node.id));
    }, [goalHref, onOpen]);

    return (
        <section ref={panelRef} className={styles.panel} aria-label={`${example.label} goal tree`} onMouseEnter={onOpen}>
            {/* The frame is 1px wider and taller so its border lands on the grid lines at both edges. */}
            <div
                className={styles.tree}
                style={frame ? { left: frame.left, top: frame.top, width: frame.width + 1, height: frame.height + 1 } : undefined}
            >
                <GoalLevelsProvider seedLevels={levels} seedAppearance={example.appearance}>
                    {/* Keyed so switching examples fades the new tree in from its own fit. */}
                    <FlowTree key={example.id} treeData={tree} onNodeClick={openGoal} />
                </GoalLevelsProvider>
                <span className={styles.frame} aria-hidden="true" />
            </div>
            <p className={styles.hint} style={frame ? { top: frame.top + 8, right: `calc(100% - ${frame.left + frame.width - 10}px)` } : undefined}>
                Drag to pan · scroll to zoom · click a goal to open it
            </p>
        </section>
    );
}
