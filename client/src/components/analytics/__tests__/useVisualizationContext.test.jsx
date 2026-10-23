import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import useVisualizationContext from '../useVisualizationContext';

const wrapper = ({ children }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } })}>{children}</QueryClientProvider>
);

const bench = { id: 'bench', name: 'Bench', metric_definitions: [{ id: 'weight', name: 'Weight' }] };
const squat = { id: 'squat', name: 'Squat', metric_definitions: [] };
const data = {
    rootId: 'root-1',
    sessions: [],
    goalAnalytics: null,
    activities: [bench, squat],
    activityGroups: [],
    activityInstances: { bench: [{ id: 'i1', completed: true }], squat: [{ id: 'i2', completed: true }] },
};

describe('useVisualizationContext', () => {
    it("resolves a saved view's selected activity and visualization", () => {
        const windowState = { selectedCategory: 'activities', selectedVisualization: 'metricTrends', selectedActivity: { id: 'bench' } };
        const { result } = renderHook(() => useVisualizationContext({ data, windowState }), { wrapper });

        expect(result.current.selectedVisualizationMeta.id).toBe('metricTrends');
        expect(result.current.effectiveSelectedActivity).toBe(bench);
        expect(result.current.scopedActivities).toEqual([bench, squat]);
        expect(result.current.hasActiveDateRange).toBe(false);
    });

    it('drops a selected activity that the filters leave out of scope', () => {
        const windowState = { selectedCategory: 'activities', selectedVisualization: 'metricTrends', selectedActivity: { id: 'gone' } };
        const { result } = renderHook(() => useVisualizationContext({ data, windowState }), { wrapper });

        expect(result.current.effectiveSelectedActivity?.id).not.toBe('gone');
    });
});
