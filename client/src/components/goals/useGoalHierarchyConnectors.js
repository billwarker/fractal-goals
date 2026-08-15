import { useLayoutEffect, useState } from 'react';

const normalizeCoordinate = (value) => Math.round(value * 2) / 2;

function edgesAreEqual(currentEdges, nextEdges) {
    if (currentEdges.length !== nextEdges.length) return false;
    return nextEdges.every((edge, index) => {
        const currentEdge = currentEdges[index];
        return currentEdge
            && currentEdge.key === edge.key
            && currentEdge.active === edge.active
            && currentEdge.state === edge.state
            && currentEdge.from.x === edge.from.x
            && currentEdge.from.y === edge.from.y
            && currentEdge.to.x === edge.to.x
            && currentEdge.to.y === edge.to.y;
    });
}

export default function useGoalHierarchyConnectors({
    listRef,
    iconRefs,
    sessionRows,
    rowById,
    getGoalConnectorEdgeHighlightState,
    getGoalConnectorEdgeState,
}) {
    const [connectorEdges, setConnectorEdges] = useState([]);

    useLayoutEffect(() => {
        const listElement = listRef.current;
        if (!listElement) return undefined;

        const measureConnectors = () => {
            const listRect = listElement.getBoundingClientRect();
            const nextEdges = [];

            sessionRows.forEach(({ node }) => {
                const parentElement = iconRefs.current.get(String(node.id));
                if (!parentElement) return;

                const parentRect = parentElement.getBoundingClientRect();
                const from = {
                    x: normalizeCoordinate(parentRect.left - listRect.left + (parentRect.width / 2)),
                    y: normalizeCoordinate(parentRect.top - listRect.top + (parentRect.height / 2)),
                };

                node.children.forEach((child) => {
                    const childElement = iconRefs.current.get(String(child.id));
                    if (!childElement) return;

                    const childRect = childElement.getBoundingClientRect();
                    const to = {
                        x: normalizeCoordinate(childRect.left - listRect.left + (childRect.width / 2)),
                        y: normalizeCoordinate(childRect.top - listRect.top + (childRect.height / 2)),
                    };
                    const childRow = rowById.get(String(child.id));
                    const active = getGoalConnectorEdgeHighlightState
                        ? Boolean(getGoalConnectorEdgeHighlightState(node.originalGoal || node, child.originalGoal || child))
                        : Boolean(childRow?.currentTopActive || childRow?.currentHorizontalActive);
                    const state = getGoalConnectorEdgeState
                        ? (getGoalConnectorEdgeState(node.originalGoal || node, child.originalGoal || child) || 'dashed')
                        : (active ? 'selected' : 'solid');

                    nextEdges.push({
                        key: `${node.id}-${child.id}`,
                        parentId: node.id,
                        childId: child.id,
                        from,
                        to,
                        active,
                        state,
                    });
                });
            });

            setConnectorEdges((currentEdges) => (
                edgesAreEqual(currentEdges, nextEdges) ? currentEdges : nextEdges
            ));
        };

        let pendingFrameId = null;
        const timeoutIds = [];
        const scheduleMeasure = () => {
            if (pendingFrameId !== null) return;
            pendingFrameId = window.requestAnimationFrame(() => {
                pendingFrameId = null;
                measureConnectors();
            });
        };

        scheduleMeasure();
        timeoutIds.push(window.setTimeout(scheduleMeasure, 80));
        timeoutIds.push(window.setTimeout(scheduleMeasure, 220));

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(scheduleMeasure)
            : null;
        resizeObserver?.observe(listElement);
        const modalElement = listElement.closest('[role="dialog"]') || listElement.closest('[class*="modal"]');
        window.addEventListener('resize', scheduleMeasure);
        modalElement?.addEventListener('transitionend', scheduleMeasure);
        modalElement?.addEventListener('animationend', scheduleMeasure);

        return () => {
            if (pendingFrameId !== null) window.cancelAnimationFrame(pendingFrameId);
            timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
            resizeObserver?.disconnect();
            window.removeEventListener('resize', scheduleMeasure);
            modalElement?.removeEventListener('transitionend', scheduleMeasure);
            modalElement?.removeEventListener('animationend', scheduleMeasure);
        };
    }, [
        getGoalConnectorEdgeHighlightState,
        getGoalConnectorEdgeState,
        iconRefs,
        listRef,
        rowById,
        sessionRows,
    ]);

    return connectorEdges;
}
