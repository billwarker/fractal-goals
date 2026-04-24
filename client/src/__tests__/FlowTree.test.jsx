import React from 'react';
import { act, render, screen } from '@testing-library/react';
import FlowTree from '../FlowTree';

const fitViewMock = vi.hoisted(() => vi.fn());
const onInitMock = vi.hoisted(() => vi.fn());

vi.mock('reactflow', async () => {
    const ReactModule = await vi.importActual('react');

    return {
        default: ({ onInit, nodes = [], children }) => {
            const initCallCountRef = ReactModule.useRef(0);

            ReactModule.useEffect(() => {
                if (initCallCountRef.current >= 3) {
                    return;
                }

                initCallCountRef.current += 1;
                onInitMock();
                onInit?.({ fitView: fitViewMock });
            });

            return (
                <div data-testid="react-flow">
                    <span data-testid="node-count">{nodes.length}</span>
                    {children}
                </div>
            );
        },
        useNodesState: (initialNodes) => {
            const [nodes, setNodes] = ReactModule.useState(initialNodes);
            return [nodes, setNodes, vi.fn()];
        },
        useEdgesState: (initialEdges) => {
            const [edges, setEdges] = ReactModule.useState(initialEdges);
            return [edges, setEdges, vi.fn()];
        },
        Handle: () => null,
        Position: {
            Top: 'top',
            Bottom: 'bottom',
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
        onInitMock.mockClear();
    });

    afterEach(() => {
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
});
