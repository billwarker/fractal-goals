import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { bucketStarts } from '../../../utils/chartGrain';
import { migrateSplitLayoutToGrid } from '../ProfileWindowLayout';
import { createEdgeGroup } from './edgeGroup';
import { panelGroups } from './panelGroups';
import { mergeSlots, sharedRanges } from './slots';

const AlignedAxesContext = createContext(null);
const WindowIdContext = createContext(null);

const slotSignature = (declaration) => `${declaration.identity}|${declaration.points.map((point) => point.key).join(',')}`;
const rangeSignature = (declaration) => JSON.stringify(declaration.axes);

/** A store of what each panel declares, updated only when a declaration really changes. */
function useDeclarations(signatureOf) {
    const [declarations, setDeclarations] = useState({});
    // Stable, since charts declare in effects that depend on them and changing declarations re-renders.
    const actions = useMemo(() => ({
        declare(windowId, declaration) {
            setDeclarations((current) => {
                const existing = current[windowId];
                if (existing && signatureOf(existing) === signatureOf(declaration)) return current;
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
    }), [signatureOf]);
    return [declarations, actions];
}

/**
 * Lines up matching axes across a dashboard's panels. Charts declare what their axes mean; stacked
 * panels whose x axes mean the same thing share slots and left and right plot edges, and side-by-side
 * panels whose y axes do share a range and top and bottom plot edges. Worked out from the layout and
 * the charts each time, so nothing is saved.
 */
export function AlignedAxesProvider({ layout, enabled = true, children }) {
    const [slotDeclarations, slotActions] = useDeclarations(slotSignature);
    const [rangeDeclarations, rangeActions] = useDeclarations(rangeSignature);
    const edgeGroups = useRef(new Map());

    const { stacked, sideBySide } = useMemo(() => {
        const panels = enabled ? migrateSplitLayoutToGrid(layout)?.panels || [] : [];
        return { stacked: panelGroups(panels, 'stacked'), sideBySide: panelGroups(panels, 'sideBySide') };
    }, [enabled, layout]);

    const value = useMemo(() => {
        const edgesFor = (key, property) => {
            if (!edgeGroups.current.has(key)) edgeGroups.current.set(key, createEdgeGroup(property));
            return edgeGroups.current.get(key);
        };
        return {
            slotActions,
            rangeActions,
            slotsFor(windowId) {
                const own = slotDeclarations[windowId];
                const group = own && stacked.find((ids) => ids.includes(windowId));
                if (!group) return null;
                const peers = group.filter((id) => slotDeclarations[id]?.identity === own.identity);
                if (peers.length < 2) return null;
                return {
                    slots: mergeSlots(peers.map((id) => slotDeclarations[id].points)),
                    edges: edgesFor(`x|${own.identity}|${peers.join(',')}`, '$alignedEdges'),
                };
            },
            rangesFor(windowId) {
                const own = rangeDeclarations[windowId];
                const group = own && sideBySide.find((ids) => ids.includes(windowId));
                if (!group) return null;
                const identities = new Set(own.axes.map((axis) => axis.identity));
                const peers = group.filter((id) => id !== windowId
                    && rangeDeclarations[id]?.axes.some((axis) => identities.has(axis.identity)));
                if (!peers.length) return null;
                const members = [...new Set([...peers, windowId])].sort().join(',');
                return {
                    ranges: sharedRanges(own.axes, peers.map((id) => rangeDeclarations[id].axes)),
                    edges: edgesFor(`y|${group.join(',')}|${members}`, '$alignedRows'),
                };
            },
        };
    }, [rangeActions, rangeDeclarations, sideBySide, slotActions, slotDeclarations, stacked]);

    return <AlignedAxesContext.Provider value={value}>{children}</AlignedAxesContext.Provider>;
}

/** Which dashboard panel the charts inside belong to. */
export function AlignedAxisWindow({ windowId, children }) {
    return <WindowIdContext.Provider value={windowId}>{children}</WindowIdContext.Provider>;
}

/** Declares `declaration` for this panel while it holds, keyed by `signature` so it only changes when it really does. */
function useDeclared(actions, windowId, declaration, signature) {
    const latest = useRef(declaration);
    useEffect(() => {
        latest.current = declaration;
    });
    const declare = actions?.declare;
    const withdraw = actions?.withdraw;
    useEffect(() => {
        if (!signature) return undefined;
        declare(windowId, latest.current);
        return () => withdraw(windowId);
    }, [declare, signature, windowId, withdraw]);
}

/**
 * Shares a group's plot edges with the chart itself, which pageGridSnap reads on each layout. Checked
 * every render, since the chart instance can change under a stable group: goal markers loading wrap the
 * chart in a new element, which rebuilds it.
 */
function useSharedEdges(chartRef, edges) {
    const joined = useRef(null);
    useEffect(() => {
        const chart = edges ? chartRef?.current : null;
        if (joined.current?.chart === chart && joined.current?.edges === edges) return;
        joined.current?.edges.leave(joined.current.chart);
        joined.current = chart ? { chart, edges } : null;
        if (chart) edges.join(chart);
    });
    useEffect(() => () => {
        joined.current?.edges.leave(joined.current.chart);
        joined.current = null;
    }, []);
}

/**
 * Declares what a chart's x axis means, and returns its shared slots when a panel stacked with it means
 * the same thing, else null (always null outside a dashboard).
 *
 * @param {{ chartRef: { current: any }, identity: string | null, points: Array<{ key: string, at: number, label: string }> }} input
 * @returns {Array<{ key: string, at: number, label: string }> | null}
 */
export function useAlignedAxis({ chartRef, identity, points }) {
    const context = useContext(AlignedAxesContext);
    const windowId = useContext(WindowIdContext);
    const active = Boolean(context && windowId && identity);
    useDeclared(context?.slotActions, windowId, { identity, points }, active ? slotSignature({ identity, points }) : null);
    const alignment = active ? context.slotsFor(windowId) : null;
    useSharedEdges(chartRef, alignment?.edges || null);
    return alignment?.slots || null;
}

/**
 * The same for calendar buckets: every bucket from the earliest to the latest across the panels, so
 * quiet periods stay as gaps, or null when not aligned.
 *
 * @param {{ chartRef: { current: any }, grain: string, keys: string[], enabled?: boolean }} input
 * @returns {string[] | null}
 */
export function useAlignedBuckets({ chartRef, grain, keys, enabled = true }) {
    const points = useMemo(() => keys.map((key) => ({ key, at: Date.parse(key), label: key })), [keys]);
    const slots = useAlignedAxis({ chartRef, identity: enabled && keys.length ? `buckets:${grain}` : null, points });
    const first = slots?.[0]?.key;
    const last = slots?.[slots.length - 1]?.key;
    return useMemo(() => (first ? bucketStarts(first, last, grain) : null), [first, grain, last]);
}

/**
 * Declares what a chart's value axes mean and the values each must hold, and returns the range for each
 * axis shared with a panel beside it, as `{ [scaleId]: { min, max } }`, else null.
 *
 * @param {{ chartRef: { current: any }, axes: Array<{ scaleId: string, identity: string, min: number, max: number }> }} input
 * @returns {Record<string, { min: number, max: number }> | null}
 */
export function useAlignedRanges({ chartRef, axes }) {
    const context = useContext(AlignedAxesContext);
    const windowId = useContext(WindowIdContext);
    const active = Boolean(context && windowId && axes.length);
    useDeclared(context?.rangeActions, windowId, { axes }, active ? rangeSignature({ axes }) : null);
    const alignment = active ? context.rangesFor(windowId) : null;
    useSharedEdges(chartRef, alignment?.edges || null);
    return alignment?.ranges || null;
}
