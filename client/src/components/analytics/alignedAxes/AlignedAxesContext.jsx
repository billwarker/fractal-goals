import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { migrateSplitLayoutToGrid } from '../ProfileWindowLayout';
import { createEdgeGroup } from './edgeGroup';
import { panelGroups } from './panelGroups';
import { mergeSlots } from './slots';

const AlignedAxesContext = createContext(null);
const WindowIdContext = createContext(null);

const signature = (declaration) => `${declaration.identity}|${declaration.points.map((point) => point.key).join(',')}`;

/**
 * Lines up matching axes across a dashboard's panels. Charts declare what their axis means
 * (`useAlignedAxis`); panels in line with each other whose axes mean the same thing share slots and
 * plot edges. Worked out from the layout and the charts each time, so nothing is saved.
 */
export function AlignedAxesProvider({ layout, enabled = true, children }) {
    const [declarations, setDeclarations] = useState({});
    const edgeGroups = useRef(new Map());

    const groups = useMemo(() => {
        const panels = enabled ? migrateSplitLayoutToGrid(layout)?.panels || [] : [];
        return panelGroups(panels, 'stacked');
    }, [enabled, layout]);

    // Stable, since charts declare in effects that depend on them and changing declarations re-renders.
    const actions = useMemo(() => ({
        declare(windowId, declaration) {
            setDeclarations((current) => {
                const existing = current[windowId];
                if (existing && signature(existing) === signature(declaration)) return current;
                return { ...current, [windowId]: declaration };
            });
        },
        withdraw(windowId) {
            setDeclarations((current) => {
                if (!current[windowId]) return current;
                const { [windowId]: _removed, ...rest } = current;
                return rest;
            });
        },
    }), []);

    const value = useMemo(() => ({
        ...actions,
        alignmentFor(windowId) {
            const own = declarations[windowId];
            const group = own && groups.find((ids) => ids.includes(windowId));
            if (!group) return null;
            const peers = group.filter((id) => declarations[id]?.identity === own.identity);
            if (peers.length < 2) return null;
            const key = `${own.identity}|${peers.join(',')}`;
            if (!edgeGroups.current.has(key)) edgeGroups.current.set(key, createEdgeGroup());
            return {
                key,
                slots: mergeSlots(peers.map((id) => declarations[id].points)),
                edges: edgeGroups.current.get(key),
            };
        },
    }), [actions, declarations, groups]);

    return <AlignedAxesContext.Provider value={value}>{children}</AlignedAxesContext.Provider>;
}

/** Which dashboard panel the charts inside belong to. */
export function AlignedAxisWindow({ windowId, children }) {
    return <WindowIdContext.Provider value={windowId}>{children}</WindowIdContext.Provider>;
}

/**
 * Declares what a chart's x axis means, and returns its shared slots when a panel in line with it means
 * the same thing, else null (always null outside a dashboard).
 *
 * @param {{ chartRef: { current: any }, identity: string | null, points: Array<{ key: string, at: number, label: string }> }} input
 * @returns {Array<{ key: string, at: number, label: string }> | null}
 */
export function useAlignedAxis({ chartRef, identity, points }) {
    const context = useContext(AlignedAxesContext);
    const windowId = useContext(WindowIdContext);
    const declare = context?.declare;
    const withdraw = context?.withdraw;
    const active = Boolean(context && windowId && identity);
    const keys = active ? signature({ identity, points }) : null;
    const pointsRef = useRef(points);
    useEffect(() => {
        pointsRef.current = points;
    });

    useEffect(() => {
        if (!keys) return undefined;
        declare(windowId, { identity, points: pointsRef.current });
        return () => withdraw(windowId);
    }, [declare, identity, keys, windowId, withdraw]);

    const alignment = active ? context.alignmentFor(windowId) : null;
    const edges = alignment?.edges || null;

    // The plot edges are shared with the chart itself, which pageGridSnap reads on each layout.
    useEffect(() => {
        const chart = chartRef?.current;
        if (!chart || !edges) return undefined;
        edges.join(chart);
        return () => edges.leave(chart);
    }, [chartRef, edges]);

    return alignment?.slots || null;
}
