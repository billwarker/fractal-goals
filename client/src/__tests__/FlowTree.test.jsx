import React from 'react';
import { act, render, screen } from '@testing-library/react';
import FlowTree from '../FlowTree';

const fitViewMock = vi.hoisted(() => vi.fn());
const setCenterMock = vi.hoisted(() => vi.fn());
const setViewportMock = vi.hoisted(() => vi.fn());
const onInitMock = vi.hoisted(() => vi.fn());

vi.mock('reactflow', async () => {
    const ReactModule = await vi.importActual('react');

    const MockReactFlow = ({ onInit, nodes = [], children }) => {
        const initCallCountRef = ReactModule.useRef(0);

        ReactModule.useEffect(() => {
            if (initCallCountRef.current >= 3) {
                return;
            }

            initCallCountRef.current += 1;
            onInitMock();
            onInit?.({ fitView: fitViewMock, setCenter: setCenterMock, setViewport: setViewportMock });
        });

        return (
            <div data-testid="react-flow">
                <span data-testid="node-count">{nodes.length}</span>
                {children}
            </div>
        );
    };

    return {
        default: MockReactFlow,
        useNodesState: (initialNodes) => {
            const [nodes, setNodes] = ReactModule.useState(initialNodes);
            return [nodes, setNodes, vi.fn()];
        },
        useEdgesState: (initialEdges) => {
            const [edges, setEdges] = ReactModule.useState(initialEdges);
            return [edges, setEdges, vi.fn()];
        },
        getViewportForBounds: ({ x, y, width, height }, viewportWidth, viewportHeight, minZoom, maxZoom, padding) => ({
            x: viewportWidth / 2 - (x + width / 2),
            y: viewportHeight / 2 - (y + height / 2),
            zoom: Math.min(maxZoom, Math.max(minZoom, 1 - padding)),
        }),
        Handle: () => null,
        Position: {
            Top: 'top',
            Bottom: 'bottom',
            Left: 'left',
            Right: 'right',
        },
    };
});

vi.mock('../contexts/ThemeContext', () => ({
    useTheme: () => ({ animatedIcons: false }),
}));

vi.mock('../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({
        getGoalColor: () => '#38bdf8',
        getGoalSecondaryColor: () => '#0f766e',
        getLevelByName: () => null,
        getCompletionColor: () => '#22c55e',
        getGoalIcon: () => 'circle',
    }),
}));

vi.mock('../hooks/useIsMobile', () => ({
    default: () => false,
}));

describe('FlowTree', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        fitViewMock.mockClear();
        setCenterMock.mockClear();
        setViewportMock.mockClear();
        onInitMock.mockClear();
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 1200,
            height: 800,
            top: 0,
            left: 0,
            right: 1200,
            bottom: 800,
            x: 0,
            y: 0,
            toJSON: () => {},
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.clearAllTimers();
        vi.useRealTimers();
    });

    it('treats repeated ReactFlow initialization as idempotent', () => {
        render(
            <FlowTree
                treeData={{
                    id: 'root-1',
                    name: 'Root Goal',
                    type: 'UltimateGoal',
                    children: [],
                }}
                onNodeClick={vi.fn()}
                onAddChild={vi.fn()}
            />
        );

        expect(screen.getByTestId('node-count')).toHaveTextContent('1');

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByTestId('react-flow')).toBeInTheDocument();
        expect(onInitMock).toHaveBeenCalled();
        expect(fitViewMock).toHaveBeenCalled();
    });

    it('centers the viewport on a search zoom target without selecting the node', () => {
        render(
            <FlowTree
                treeData={{
                    id: 'root-1',
                    name: 'Root Goal',
                    type: 'UltimateGoal',
                    children: [
                        {
                            id: 'goal-2',
                            name: 'Target Goal',
                            type: 'LongTermGoal',
                            children: [],
                        },
                    ],
                }}
                onNodeClick={vi.fn()}
                onAddChild={vi.fn()}
                zoomTargetNodeId="goal-2"
            />
        );

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(setCenterMock).toHaveBeenCalledWith(
            expect.any(Number),
            expect.any(Number),
            { zoom: 1.1, duration: 260 }
        );
    });

    it('recenters hierarchy layout when the selected goal clears', () => {
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'goal-1',
                    name: 'Parent Goal',
                    type: 'LongTermGoal',
                    children: [
                        {
                            id: 'goal-2',
                            name: 'Child Goal',
                            type: 'MidTermGoal',
                            children: [],
                        },
                    ],
                },
            ],
        };

        const { rerender } = render(
            <FlowTree
                treeData={treeData}
                layoutMode="hierarchy"
                selectedNodeId="goal-2"
                onNodeClick={vi.fn()}
                onAddChild={vi.fn()}
            />
        );

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(setViewportMock).toHaveBeenCalledWith(
            expect.objectContaining({
                x: expect.any(Number),
                y: expect.any(Number),
                zoom: expect.any(Number),
            }),
            { duration: 200 }
        );
        setViewportMock.mockClear();

        act(() => {
            rerender(
                <FlowTree
                    treeData={treeData}
                    layoutMode="hierarchy"
                    selectedNodeId={null}
                    onNodeClick={vi.fn()}
                    onAddChild={vi.fn()}
                />
            );
        });

        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(setViewportMock).toHaveBeenCalledWith(
            expect.objectContaining({
                x: expect.any(Number),
                y: expect.any(Number),
                zoom: expect.any(Number),
            }),
            { duration: 200 }
        );
        expect(fitViewMock).not.toHaveBeenCalledWith(expect.objectContaining({
            duration: 220,
        }));
    });

    it('fits re-scoped tree nodes instantly before revealing them', () => {
        const ref = React.createRef();
        const treeData = {
            id: 'root-1',
            name: 'Root Goal',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'active-goal',
                    name: 'Active Goal',
                    type: 'LongTermGoal',
                    children: [],
                },
                {
                    id: 'inactive-goal',
                    name: 'Inactive Goal',
                    type: 'LongTermGoal',
                    children: [],
                },
            ],
        };

        const { rerender } = render(
            <FlowTree
                ref={ref}
                treeData={treeData}
                evidenceGoalIds={new Set(['active-goal'])}
                viewSettings={{ hideInactiveGoals: false }}
                scopeTransitionKey={0}
                onNodeClick={vi.fn()}
                onAddChild={vi.fn()}
            />
        );

        act(() => {
            vi.advanceTimersByTime(500);
        });
        fitViewMock.mockClear();

        act(() => {
            ref.current.startFadeOut();
        });

        act(() => {
            rerender(
                <FlowTree
                    ref={ref}
                    treeData={treeData}
                    evidenceGoalIds={new Set(['active-goal'])}
                    viewSettings={{ hideInactiveGoals: true }}
                    scopeTransitionKey={1}
                    onNodeClick={vi.fn()}
                    onAddChild={vi.fn()}
                />
            );
        });

        act(() => {
            vi.advanceTimersByTime(100);
        });

        expect(setViewportMock).toHaveBeenCalledWith(
            expect.objectContaining({
                x: expect.any(Number),
                y: expect.any(Number),
                zoom: expect.any(Number),
            }),
            { duration: 0 }
        );
        expect(fitViewMock).not.toHaveBeenCalledWith(expect.objectContaining({
            duration: 220,
        }));
    });

    it('shows an empty state when hiding inactive goals removes every goal', () => {
        render(
            <FlowTree
                treeData={{
                    id: 'root-1',
                    name: 'Root Goal',
                    type: 'UltimateGoal',
                    children: [],
                }}
                evidenceGoalIds={new Set()}
                viewSettings={{ hideInactiveGoals: true }}
                onNodeClick={vi.fn()}
                onAddChild={vi.fn()}
            />
        );

        expect(screen.getByTestId('node-count')).toHaveTextContent('0');
        expect(screen.getByRole('status')).toHaveTextContent('No active goals exist');
    });
});
