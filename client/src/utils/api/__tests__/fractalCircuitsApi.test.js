import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('../core', () => ({
    API_BASE: '/api',
    axios: { post: vi.fn() },
}));

import { axios } from '../core';
import { fractalCircuitsApi } from '../fractalCircuitsApi';


beforeEach(() => {
    axios.post.mockReset();
});

it('posts the exact circuit member metric cascade contract', () => {
    fractalCircuitsApi.cascadeCircuitMemberMetric(
        'root-1',
        'run-1',
        'member-1',
        'metric-1',
        'split-1',
    );

    expect(axios.post).toHaveBeenCalledWith(
        '/api/root-1/circuit-runs/run-1/members/member-1/metrics/cascade',
        { metric_id: 'metric-1', split_id: 'split-1' },
    );
});
