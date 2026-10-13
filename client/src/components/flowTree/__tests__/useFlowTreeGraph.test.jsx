import { renderHook } from '@testing-library/react';
import dagre from '@dagrejs/dagre';
import useFlowTreeGraph from '../useFlowTreeGraph';

const levels = [];
vi.mock('../../../contexts/GoalLevelsContext', () => ({
    useGoalLevels: () => ({ goalLevels: levels, getGoalColor: () => '#00ff00' }),
    resolveGoalLevel: () => null,
}));

it('reuses geometry for presentation changes and relayouts a changed visible lineage', () => {
    const layout = vi.spyOn(dagre, 'layout');
    const treeData = { id: 'root', name: 'Root', type: 'UltimateGoal', children: [
        { id: 'a', name: 'A', type: 'LongTermGoal', children: [] },
        { id: 'b', name: 'B', type: 'LongTermGoal', children: [] },
    ] };
    const initial = { treeData, onNodeClick: vi.fn(), onAddChild: vi.fn(), viewSettings: {}, evidenceGoalIds: new Set() };
    const { result, rerender } = renderHook((props) => useFlowTreeGraph(props), { initialProps: initial });
    expect(layout).toHaveBeenCalledTimes(1);
    const positions = result.current.nodes.map(({ position }) => position);
    const click = vi.fn();
    rerender({ ...initial, onNodeClick: click, viewSettings: { fadeInactiveBranches: true }, metricsSummary: {} });
    expect(layout).toHaveBeenCalledTimes(1);
    expect(result.current.nodes.map(({ position }) => position)).toEqual(positions);
    result.current.nodes.find(({ id }) => id === 'a').data.onClick();
    expect(click).toHaveBeenCalledWith(treeData.children[0]);
    rerender({ ...initial, selectedNodeId: 'a' });
    expect(result.current.nodes.map(({ id }) => id)).toEqual(['root', 'a']);
    expect(layout).toHaveBeenCalledTimes(2);
    layout.mockRestore();
});
