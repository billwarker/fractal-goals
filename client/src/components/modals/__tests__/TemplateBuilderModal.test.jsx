import React, { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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
        expect(screen.queryByRole('button', { name: 'Select Finisher' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));
        fireEvent.click(screen.getByRole('button', { name: 'Select Finisher' }));
        fireEvent.click(screen.getByRole('button', { name: 'Update Template' }));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSave.mock.calls[0][0].template_data.sections[0].items).toEqual([
            { type: 'activity', activity_definition_id: 'activity-1', name: 'Squat' },
            { type: 'circuit', circuit_definition_id: 'circuit-1' },
        ]);
        expect(onSave.mock.calls[0][0].template_data.sections[0].activities).toBeUndefined();
    });

    it('mounts the section editor and alerts on the body, outside a host stacking context', () => {
        const host = document.createElement('div');
        host.style.transform = 'translateY(0)';
        document.body.appendChild(host);

        render(
            <TemplateBuilderModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                editingTemplate={null}
                activities={[]}
                activityGroups={[]}
            />,
            { container: host },
        );

        fireEvent.click(screen.getByRole('button', { name: '+ Add Section' }));
        const sectionName = screen.getByLabelText('Section Name');
        expect(host.contains(sectionName)).toBe(false);
        expect(document.body.contains(sectionName)).toBe(true);

        fireEvent.change(sectionName, { target: { value: 'Warm-up' } });
        fireEvent.click(screen.getAllByRole('button', { name: 'Add Section' }).at(-1));
        expect(screen.queryByLabelText('Section Name')).not.toBeInTheDocument();
        expect(screen.getByText('Warm-up')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Save Template' }));
        const alertTitle = screen.getByText('Validation Error');
        expect(host.contains(alertTitle)).toBe(false);

        host.remove();
    });
    it('creates a circuit from a section picker and adds it to that section', async () => {
        const onSave = vi.fn();
        const onCreateCircuitDefinition = vi.fn().mockResolvedValue({
            id: 'circuit-new',
            name: 'Push Pair',
            slots: [{ activity_definition_id: 'activity-1' }],
        });
        render(
            <TemplateBuilderModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={onSave}
                onCreateCircuitDefinition={onCreateCircuitDefinition}
                editingTemplate={{
                    id: 'template-1',
                    name: 'Mixed Work',
                    description: '',
                    template_data: { sections: [{ name: 'Main', duration_minutes: 20, items: [] }] },
                }}
                activities={[{ id: 'activity-1', name: 'Press', type: 'strength' }]}
                activityGroups={[]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Create New Activity Circuit' }));

        fireEvent.change(screen.getByText('Name').parentElement.querySelector('input'), { target: { value: 'Push Pair' } });
        fireEvent.click(screen.getAllByRole('button', { name: '+ Add Activity' }).at(-1));
        fireEvent.click(screen.getByRole('button', { name: 'Select Press' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save Circuit' }));

        await waitFor(() => expect(screen.queryByRole('button', { name: 'Save Circuit' })).not.toBeInTheDocument());
        expect(onCreateCircuitDefinition).toHaveBeenCalledWith(expect.objectContaining({
            name: 'Push Pair',
            slots: [{ activity_definition_id: 'activity-1' }],
        }));

        fireEvent.click(screen.getByRole('button', { name: 'Update Template' }));
        expect(onSave.mock.calls[0][0].template_data.sections[0].items).toEqual([
            { type: 'circuit', circuit_definition_id: 'circuit-new' },
        ]);
    });

    it('keeps the circuit builder open with the error when creation fails', async () => {
        render(
            <TemplateBuilderModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                onCreateCircuitDefinition={vi.fn().mockRejectedValue(new Error('Circuit name taken'))}
                editingTemplate={{
                    id: 'template-1',
                    name: 'Mixed Work',
                    description: '',
                    template_data: { sections: [{ name: 'Main', duration_minutes: 20, items: [] }] },
                }}
                activities={[{ id: 'activity-1', name: 'Press', type: 'strength' }]}
                activityGroups={[]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));
        fireEvent.click(screen.getByRole('button', { name: '+ Create New Activity Circuit' }));
        fireEvent.change(screen.getByText('Name').parentElement.querySelector('input'), { target: { value: 'Push Pair' } });
        fireEvent.click(screen.getAllByRole('button', { name: '+ Add Activity' }).at(-1));
        fireEvent.click(screen.getByRole('button', { name: 'Select Press' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save Circuit' }));

        expect(await screen.findByText('Circuit name taken')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Save Circuit' })).toBeInTheDocument();
    });

    it('hides circuit creation when the host cannot create circuits', () => {
        render(
            <TemplateBuilderModal
                isOpen={true}
                onClose={vi.fn()}
                onSave={vi.fn()}
                editingTemplate={{
                    id: 'template-1',
                    name: 'Mixed Work',
                    description: '',
                    template_data: { sections: [{ name: 'Main', duration_minutes: 20, items: [] }] },
                }}
                activities={[]}
                activityGroups={[]}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: '+ Add Activity' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Activity Circuits' }));
        expect(screen.queryByRole('button', { name: '+ Create New Activity Circuit' })).not.toBeInTheDocument();
    });
});
