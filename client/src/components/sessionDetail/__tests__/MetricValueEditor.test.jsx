import React, { useEffect, useMemo } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import MetricValueEditor from '../MetricValueEditor';
import useMetricDrafts from '../useMetricDrafts';


describe('MetricValueEditor draft performance', () => {
    it('keeps keystroke rendering local while preserving the draft for commit', () => {
        const updateExercise = vi.fn();
        const onActivityOwnerRender = vi.fn();
        const onMetricEditorRender = vi.fn();

        function Harness() {
            const exercise = useMemo(() => ({
                sets: [{ id: 'set-1', metrics: [{ metric_id: 'metric-1', value: '1' }] }],
            }), []);
            const metricDef = useMemo(() => ({
                id: 'metric-1',
                input_type: 'number',
                precision: 2,
                unit: 'kg',
            }), []);
            const drafts = useMetricDrafts({ exercise, updateExercise });

            useEffect(() => {
                onActivityOwnerRender();
            });

            return (
                <React.Profiler id="metric-editor" onRender={onMetricEditorRender}>
                    <MetricValueEditor
                        metricDef={metricDef}
                        value={drafts.getSetMetricDisplayValue(0, exercise.sets[0].metrics, metricDef.id)}
                        inputClassName="metric-input"
                        metaClassName="metric-meta"
                        unitClassName="metric-unit"
                        isDraft={drafts.hasSetMetricDraft(0, metricDef.id)}
                        onDraftChange={(value) => drafts.handleSetMetricDraftChange(0, metricDef.id, value)}
                        onCommit={(value) => drafts.commitSetMetricChange(0, metricDef.id, null, value)}
                    />
                </React.Profiler>
            );
        }

        render(<Harness />);
        const input = screen.getByRole('textbox');

        expect(input).toHaveValue('1.00');
        expect(onActivityOwnerRender).toHaveBeenCalledTimes(1);
        expect(onMetricEditorRender).toHaveBeenCalledTimes(1);

        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: '12.34' } });

        expect(input).toHaveValue('12.34');
        expect(onActivityOwnerRender).toHaveBeenCalledTimes(1);
        expect(onMetricEditorRender).toHaveBeenCalledTimes(1);

        fireEvent.blur(input);
        expect(updateExercise).toHaveBeenCalledWith('sets', [{
            id: 'set-1',
            metrics: [{ metric_id: 'metric-1', value: '12.34' }],
        }]);
    });
});
