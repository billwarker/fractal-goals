import React, { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import TemplateBuilderModal from '../TemplateBuilderModal';

describe('TemplateBuilderModal', () => {
    it('uses a tab-style session type toggle instead of a dropdown', () => {
        render(
            <TemplateBuilderModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                editingTemplate={null}
                activities={[{ id: 'activity-1', name: 'Squat', type: 'strength' }]}
                activityGroups={[]}
            />
        );

        expect(screen.queryByRole('combobox', { name: 'Session Type' })).not.toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Normal Session' })).toHaveAttribute('aria-selected', 'true');

        fireEvent.click(screen.getByRole('tab', { name: 'Quick Session' }));

        expect(screen.getByRole('tab', { name: 'Quick Session' })).toHaveAttribute('aria-selected', 'true');
    });

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
        fireEvent.click(screen.getByRole('button', { name: 'Select Squat' }));

        expect(screen.getAllByText('Squat')).toHaveLength(1);
    });

    it('selects circuits through Add Activity and saves one typed ordered item list', () => {
        const onSave = vi.fn();
        render(
            <TemplateBuilderModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={onSave}
                editingTemplate={{
                    id: 'template-1',
                    name: 'Mixed Work',
                    description: '',
                    template_data: {
                        sections: [{
                            name: 'Main',
                            duration_minutes: 20,
                            items: [{ type: 'activity', activity_definition_id: 'activity-1', name: 'Squat' }],
                        }],
                    },
                }}
                activities={[
                    { id: 'activity-1', name: 'Squat', type: 'strength' },
                    {
                        id: 'circuit:circuit-1',
                        circuit_definition_id: 'circuit-1',
                        item_type: 'circuit',
                        name: 'Finisher',
                        type: 'Circuit',
                    },
                ]}
                activityGroups={[]}
            />,
        );

        expect(screen.queryByText('Add circuit:')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select Finisher' }));
        fireEvent.click(screen.getByRole('button', { name: 'Update Template' }));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave.mock.calls[0][0].template_data.sections[0].items).toEqual([
            { type: 'activity', activity_definition_id: 'activity-1', name: 'Squat' },
            { type: 'circuit', circuit_definition_id: 'circuit-1' },
        ]);
        expect(onSave.mock.calls[0][0].template_data.sections[0].activities).toBeUndefined();
    });

});
