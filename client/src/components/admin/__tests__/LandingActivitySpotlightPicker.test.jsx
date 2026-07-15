import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import LandingActivitySpotlightPicker from '../LandingActivitySpotlightPicker';

describe('LandingActivitySpotlightPicker', () => {
    it('reuses hierarchical session activity navigation for one spotlight selection', () => {
        const onChange = vi.fn();
        render(
            <LandingActivitySpotlightPicker
                activities={[
                    { id: 'rows', name: 'Bodyweight Rows', group_id: 'pull' },
                    { id: 'push-ups', name: 'Push Ups', group_id: 'push' },
                ]}
                activityGroups={[
                    { id: 'pull', name: 'Pull', parent_id: null },
                    { id: 'push', name: 'Push', parent_id: null },
                ]}
                onChange={onChange}
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Pull' }));
        expect(screen.getByRole('heading', { name: 'Pull' })).toBeInTheDocument();
        expect(screen.queryByText('Push Ups')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Select Bodyweight Rows' }));
        expect(onChange).toHaveBeenCalledWith('rows');
    });
});
