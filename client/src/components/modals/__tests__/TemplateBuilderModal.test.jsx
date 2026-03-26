import React, { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import TemplateBuilderModal from '../TemplateBuilderModal';

vi.mock('../../common/ActivityModeSelector', () => ({
    default: ({ selectedModeIds = [], onChange }) => (
        <button type="button" onClick={() => onChange(['mode-1'])}>
            Modes:{selectedModeIds.join(',')}
        </button>
    ),
}));

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

    it('saves updated mode ids for quick template activities', () => {
        const onSave = vi.fn();

        render(
            <TemplateBuilderModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={onSave}
                editingTemplate={{
                    id: 'template-quick-1',
                    name: 'Quick Strength',
                    description: '',
                    template_data: {
                        session_type: 'quick',
                        activities: [
                            {
                                activity_id: 'activity-1',
                                name: 'Squat',
                                mode_ids: ['mode-0'],
                            },
                        ],
                    },
                }}
                activities={[]}
                activityGroups={[]}
                rootId="root-1"
            />
        );

        fireEvent.click(screen.getByRole('button', { name: 'Modes:mode-0' }));
        fireEvent.click(screen.getByRole('button', { name: 'Update Template' }));

        expect(onSave).toHaveBeenCalledWith({
            name: 'Quick Strength',
            description: '',
            template_data: {
                session_type: 'quick',
                template_color: '#4A90E2',
                activities: [
                    {
                        activity_id: 'activity-1',
                        name: 'Squat',
                        mode_ids: ['mode-1'],
                    },
                ],
            },
        }, 'template-quick-1');
    });
});
