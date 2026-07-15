import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LandingTargetManagerModal from '../LandingTargetManagerModal';

const targetAnalyticsMock = vi.fn();

vi.mock('../../goalDetail/TargetAnalyticsModal', () => ({
    default: (props) => {
        targetAnalyticsMock(props);
        return <div role="dialog" aria-label={`Target analytics — ${props.target.name}`} />;
    },
}));

describe('LandingTargetManagerModal', () => {
    it('scopes the canonical read-only target analytics modal to the selected example and goal', () => {
        const target = { id: 'target-1', name: 'Ten reps', activity_id: 'activity-target' };
        const goal = {
            id: 'goal-1',
            name: 'Build strength',
            type: 'ShortTermGoal',
            attributes: { associated_activity_ids: ['activity-associated'] },
        };
        const activityDefinitions = [{ id: 'activity-target', name: 'Pull ups' }];
        const analyticsData = { target, instances: [{ id: 'instance-1' }] };

        render(
            <LandingTargetManagerModal
                exampleId="example-1"
                goal={goal}
                target={target}
                activityDefinitions={activityDefinitions}
                analyticsData={analyticsData}
                onClose={() => {}}
            />
        );

        expect(screen.getByRole('dialog', { name: 'Target analytics — Ten reps' }).parentElement)
            .toHaveAttribute('data-example-id', 'example-1');
        expect(targetAnalyticsMock).toHaveBeenCalledWith(expect.objectContaining({
            rootId: 'example-1',
            goalId: 'goal-1',
            target,
            analyticsData,
            readOnly: true,
        }));
    });

    it('populates the read model from legacy published activity history', () => {
        const target = { id: 'target-1', name: 'Ten reps', activity_id: 'activity-target' };
        const history = [
            { id: 'newer', session_date: '2026-07-02T00:00:00Z' },
            { id: 'older', session_date: '2026-07-01T00:00:00Z' },
        ];
        render(<LandingTargetManagerModal exampleId="example-1" goal={{ id: 'goal-1' }}
            target={target} activityDefinitions={[{ id: 'activity-target', name: 'Pull ups' }]}
            historicalInstances={history} portalTarget={document.body} onClose={() => {}} />);

        expect(targetAnalyticsMock).toHaveBeenLastCalledWith(expect.objectContaining({
            analyticsData: expect.objectContaining({
                instances: [history[1], history[0]],
                summary: expect.objectContaining({ total_count: 2 }),
            }),
            portalTarget: document.body,
        }));
    });
});
