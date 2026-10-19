import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import CompletionConditionEditor from '../CompletionConditionEditor';

const benchPress = {
    id: 'bench',
    name: 'Bench Press',
    metric_definitions: [
        { id: 'weight', name: 'Weight', unit: 'lbs', is_multiplicative: true },
        { id: 'reps', name: 'Reps', unit: '', is_multiplicative: true },
    ],
};
const run = {
    id: 'run',
    name: 'Run',
    metric_definitions: [{ id: 'pace', name: 'Pace', unit: 'min/km', higher_is_better: false }],
};

function Harness({ initialCondition = 'manual', initialDraft = null, onState, ...props }) {
    const [completionCondition, setCompletionCondition] = useState(initialCondition);
    const [draft, setDraft] = useState(initialDraft);
    onState?.({ completionCondition, draft });
    return (
        <CompletionConditionEditor
            completionCondition={completionCondition}
            onCompletionConditionChange={setCompletionCondition}
            draft={draft}
            onDraftChange={setDraft}
            activityDefinitions={[run, benchPress]}
            {...props}
        />
    );
}

const conditionTabs = () => within(screen.getByRole('tablist', { name: 'How this goal completes' }));

describe('CompletionConditionEditor', () => {
    it('offers all three conditions and hides "All child goals" for goals that cannot have children', () => {
        const { rerender } = render(<Harness />);
        expect(conditionTabs().getAllByRole('tab').map((tab) => tab.textContent))
            .toEqual(['Activity threshold', 'All child goals', 'Manually']);
        expect(screen.getByText('Completes when you mark it complete.')).toBeInTheDocument();

        rerender(<Harness canCompleteViaChildren={false} />);
        expect(conditionTabs().queryByRole('tab', { name: 'All child goals' })).not.toBeInTheDocument();
    });

    it('keeps "All child goals" visible on a saved children goal even when the level has no children', () => {
        render(<Harness initialCondition="children" canCompleteViaChildren={false} />);
        expect(conditionTabs().getByRole('tab', { name: 'All child goals' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText(/You can always complete it yourself\./)).toBeInTheDocument();
    });

    it('starts a threshold on the first linked activity and previews the sentence as it is edited', () => {
        let state;
        render(<Harness associatedActivityIds={['bench']} onState={(next) => { state = next; }} />);

        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));

        expect(state.completionCondition).toBe('activity_threshold');
        expect(screen.getByLabelText('Activity')).toHaveValue('bench');
        expect(within(screen.getByLabelText('Activity')).getByRole('group', { name: 'Linked to this goal' })).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Rule 1 value'), { target: { value: '225' } });
        fireEvent.click(screen.getByRole('button', { name: '+ Add a metric rule' }));
        fireEvent.change(screen.getByLabelText('Rule 2 value'), { target: { value: '6' } });
        fireEvent.change(screen.getByLabelText('Sets'), { target: { value: '3' } });

        expect(screen.getByTestId('condition-preview'))
            .toHaveTextContent('Bench Press: 3 sets of Weight ≥ 225 lbs and Reps ≥ 6 in one session');
        expect(screen.queryByRole('button', { name: '+ Add a metric rule' })).not.toBeInTheDocument();
        expect(state.draft.rules.map((rule) => rule.metric_definition_id)).toEqual(['weight', 'reps']);
    });

    it('defaults lower-is-better metrics to "at most"', () => {
        render(<Harness />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        expect(screen.getByLabelText('Activity')).toHaveValue('run');
        expect(screen.getByLabelText('Rule 1 comparison')).toHaveValue('<=');
    });

    it('switches kinds and disables total yield for activities without one', () => {
        render(<Harness />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        const kindTabs = within(screen.getByRole('tablist', { name: 'Threshold kind' }));

        fireEvent.click(kindTabs.getByRole('tab', { name: 'Cumulative' }));
        expect(screen.getByRole('radio', { name: 'Total yield' })).toBeDisabled();
        expect(screen.getByText('Total yield needs two or more multiplied metrics.')).toBeInTheDocument();
        expect(screen.getByLabelText('Metric to total')).toHaveValue('pace');

        fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'bench' } });
        expect(screen.getByRole('radio', { name: 'Total yield' })).toBeEnabled();
        fireEvent.click(screen.getByRole('radio', { name: 'Total yield' }));
        fireEvent.change(screen.getByLabelText('Total'), { target: { value: '20000' } });
        expect(screen.getByTestId('condition-preview')).toHaveTextContent('Bench Press: total yield ≥ 20,000 across sessions');

        fireEvent.click(kindTabs.getByRole('tab', { name: 'Consistency' }));
        expect(screen.getByLabelText('Times')).toBeInTheDocument();
        expect(screen.queryByRole('radiogroup', { name: 'Measure' })).not.toBeInTheDocument();
    });

    it('lets consistency drop every rule to count completed sessions', () => {
        render(<Harness />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        fireEvent.click(within(screen.getByRole('tablist', { name: 'Threshold kind' })).getByRole('tab', { name: 'Consistency' }));
        // The single-session rule carries over; consistency may remove it.
        expect(screen.getByText('sessions with a set where')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
        expect(screen.getByText('completed sessions')).toBeInTheDocument();
        expect(screen.getByTestId('condition-preview')).toHaveTextContent('Run: 3 sessions');
        expect(screen.getByRole('button', { name: '+ Add a metric rule' })).toBeInTheDocument();
    });

    it('shows field errors from validation', () => {
        render(
            <Harness
                initialCondition="activity_threshold"
                initialDraft={{
                    activity_definition_id: 'bench',
                    kind: 'single_session',
                    measure: 'sets',
                    min_sets: '0',
                    required_count: '3',
                    metric_definition_id: 'weight',
                    operator: '>=',
                    target_value: '',
                    rules: [{ metric_definition_id: 'weight', operator: '>=', value: '' }],
                }}
                errors={{ 'rule-0': "'Weight' value must be a number", min_sets: 'Sets must be between 1 and 100' }}
            />
        );
        expect(screen.getByText("'Weight' value must be a number")).toHaveAttribute('role', 'alert');
        expect(screen.getByLabelText('Rule 1 value')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByLabelText('Sets')).toHaveAttribute('aria-invalid', 'true');
    });

    it('asks for an activity first when the fractal has none', () => {
        render(<Harness activityDefinitions={[]} />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        expect(screen.getByLabelText('Activity')).toHaveValue('');
        expect(screen.queryByRole('tablist', { name: 'Threshold kind' })).not.toBeInTheDocument();
        expect(screen.getByText('Create an activity first to complete this goal on a threshold.')).toBeInTheDocument();
    });
});
