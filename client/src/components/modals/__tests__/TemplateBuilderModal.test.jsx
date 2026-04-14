import React, { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import TemplateBuilderModal from '../TemplateBuilderModal';

describe('TemplateBuilderModal', () => {
    it('adds a selected activity to a section once', () => {
        render(
            <StrictMode>
                <TemplateBuilderModal
                    isOpen={true}
                    onClose={vi.fn()}
                    onSave={vi.fn()}
                    editingTemplate={{
                        id: 'template-1',
                        name: 'Strength Day',
                        description: '',
                        template_data: {
                            sections: [
                                {
                                    name: 'Main Work',
                                    duration_minutes: 20,
                                    activities: [],
                                },
                            ],
                        },
                    }}
                    activities={[
                        {
                            id: 'activity-1',
                            name: 'Squat',
                            type: 'strength',
                            group_id: 'group-1',
                        },
                    ]}
                    activityGroups={[
                        {
                            id: 'group-1',
                            name: 'Lower Body',
                            parent_id: null,
                        },
                    ]}
                />
            </StrictMode>
        );

        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('button', { name: /Lower Body/ }));
        fireEvent.click(screen.getByRole('button', { name: /\+ Squat/ }));

        expect(screen.getAllByText('Squat')).toHaveLength(1);
    });

});
