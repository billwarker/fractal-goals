import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import QuickSessionSection from '../QuickSessionSection';

vi.mock('../../prescriptions/PlanItemPicker', () => ({
    default: ({ onAdd, activities, allowCircuits }) => (
        <button type="button" onClick={() => onAdd(activities[0])}>
            + Add activity{allowCircuits ? ' or circuit' : ''}
        </button>
    ),
}));

const weighIn = {
    id: 'weigh', name: 'Weigh-in', has_sets: false,
    metric_definitions: [{ id: 'weight', name: 'Weight', unit: 'kg', input_type: 'number', precision: 1 }],
};
const scales = {
    id: 'scales', name: 'Scales', has_sets: true,
    metric_definitions: [{ id: 'bpm', name: 'Tempo', unit: 'bpm', input_type: 'integer' }],
    tags: [{ id: 'tag-1', name: 'Clean' }],
};

function renderSection(items, handlers = {}) {
    const props = {
        rootId: 'root-1',
        draft: { version: 3, startedAt: null, items },
        activityDefinitions: [weighIn, scales],
        activityGroups: [],
        onAddActivity: vi.fn(),
        onRemoveActivity: vi.fn(),
        onMoveActivity: vi.fn(),
        onChangeValue: vi.fn(),
        ...handlers,
    };
    render(<QuickSessionSection {...props} />);
    return props;
}

describe('QuickSessionSection', () => {
    it('explains an empty quick session and adds activities only, no circuits', () => {
        const { onAddActivity } = renderSection([]);
        expect(screen.getByRole('region', { name: 'Select Activities' })).toHaveTextContent(/^2Select Activities/);
        expect(screen.getByText(/Every activity is completed when you complete the session/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '+ Add activity' }));
        expect(onAddActivity).toHaveBeenCalledWith(weighIn);
    });

    it('logs values in the plan editor, with last time\'s values as placeholders', () => {
        const { onChangeValue } = renderSection([{
            key: 'item-1', activity_definition_id: 'weigh', name: 'Weigh-in', has_sets: false, value: null,
            previous: { metrics: [{ metric_id: 'weight', value: 82.4 }] },
        }]);

        const input = screen.getByRole('textbox', { name: 'logged Weight' });
        expect(input).toHaveAttribute('placeholder', '82.4');
        fireEvent.change(input, { target: { value: '81.9' } });
        fireEvent.blur(input);
        expect(onChangeValue).toHaveBeenCalledWith('item-1', expect.objectContaining({
            metrics: [{ metric_id: 'weight', split_id: null, value: 81.9 }],
        }));
        expect(screen.getByText('1 / 20')).toBeInTheDocument();

        // Selecting the activity offers no note field: a quick session logs values only.
        fireEvent.click(screen.getByText('Weigh-in'));
        expect(screen.queryByRole('textbox', { name: /note/i })).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/note/i)).not.toBeInTheDocument();
    });

    it('logs sets without tags, and moves and removes activities', () => {
        const { onMoveActivity, onRemoveActivity } = renderSection([
            { key: 'item-1', activity_definition_id: 'weigh', name: 'Weigh-in', has_sets: false, value: null, previous: null },
            {
                key: 'item-2', activity_definition_id: 'scales', name: 'Scales', has_sets: true,
                value: { sets: [{ metrics: [], notes: null }] }, previous: null,
            },
        ]);

        expect(screen.getByRole('group', { name: 'Logged sets' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ Add set' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /tag/i })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Move Weigh-in up' })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: 'Move Scales up' }));
        expect(onMoveActivity).toHaveBeenCalledWith(1, -1);
        fireEvent.click(screen.getByRole('button', { name: 'Remove Scales' }));
        expect(onRemoveActivity).toHaveBeenCalledWith('item-2');
    });

    it('stops offering activities at the limit', () => {
        renderSection(Array.from({ length: 20 }, (_, index) => ({
            key: `item-${index}`, activity_definition_id: 'weigh', name: 'Weigh-in', has_sets: false, value: null, previous: null,
        })));
        expect(screen.queryByRole('button', { name: '+ Add activity' })).not.toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('up to 20 activities');
    });
});
