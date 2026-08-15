import React, { useMemo, useRef } from 'react';
import { act, render, screen } from '@testing-library/react';

import useGoalHierarchyConnectors from '../useGoalHierarchyConnectors';

const childNode = { id: 'goal-child', children: [] };
const parentNode = { id: 'goal-root', children: [childNode] };
const sessionRows = [{ node: parentNode }, { node: childNode }];

function ConnectorHarness() {
    const listRef = useRef(null);
    const iconRefs = useRef(new Map());
    const rowById = useMemo(() => new Map([
        ['goal-root', sessionRows[0]],
        ['goal-child', sessionRows[1]],
    ]), []);
    const connectorEdges = useGoalHierarchyConnectors({
        listRef,
        iconRefs,
        sessionRows,
        rowById,
    });

    return (
        <div ref={listRef}>
            <span ref={(element) => element && iconRefs.current.set('goal-root', element)}>Root</span>
            <span ref={(element) => element && iconRefs.current.set('goal-child', element)}>Child</span>
            <output aria-label="connector count">{connectorEdges.length}</output>
        </div>
    );
}

describe('useGoalHierarchyConnectors', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('coalesces observer storms into one connector measurement per frame', () => {
        const frameCallbacks = new Map();
        let nextFrameId = 1;
        let observerCallback;
        const requestAnimationFrame = vi.fn((callback) => {
            const frameId = nextFrameId;
            nextFrameId += 1;
            frameCallbacks.set(frameId, callback);
            return frameId;
        });
        vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
        vi.stubGlobal('cancelAnimationFrame', (frameId) => frameCallbacks.delete(frameId));
        vi.stubGlobal('ResizeObserver', class ResizeObserver {
            constructor(callback) {
                observerCallback = callback;
            }
            observe() {}
            disconnect() {}
        });

        render(<ConnectorHarness />);
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

        act(() => {
            for (let index = 0; index < 100; index += 1) observerCallback([]);
        });
        expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

        act(() => {
            const [frameId, callback] = frameCallbacks.entries().next().value;
            frameCallbacks.delete(frameId);
            callback();
        });
        expect(screen.getByLabelText('connector count')).toHaveTextContent('1');

        act(() => {
            for (let index = 0; index < 100; index += 1) observerCallback([]);
        });
        expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    });
});
