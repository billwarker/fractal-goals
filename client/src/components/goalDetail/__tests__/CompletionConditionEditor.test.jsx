import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import CompletionConditionEditor from '../CompletionConditionEditor';

const previewState = vi.hoisted(() => ({ progress: null, calls: [] }));
vi.mock('../../../hooks/useGoalConditionQueries', () => ({
    useGoalConditionPreview: (rootId, goalId, condition) => {
        previewState.calls.push({ rootId, goalId, condition });
        return { progress: goalId ? previewState.progress : null, isPending: false };
    },
}));

// The session page's tag picker has its own tests; here it only needs to run controlled.
const tagEditorProps = vi.hoisted(() => ({ current: null }));
vi.mock('../../sessionDetail/ActivityTagEditor', () => ({
    default: (props) => {
        tagEditorProps.current = props;
        return (
            <div>
                {props.leading}
                {props.editable ? (
                    <button type="button" onClick={() => props.onChangeTags([...props.selectedTagIds, 'strict'])}>
                        Add tag
                    </button>
                ) : null}
            </div>
        );
    },
}));

vi.mock('../../../hooks/useActivityTagCatalog', () => ({
    useActivityTagCatalog: () => ({
        data: {
            families: [],
            tags: [
                { id: 'strict', name: 'Strict', color: null, family_id: null, sort_order: 0, archived: false },
                { id: 'paused', name: 'Paused', color: null, family_id: null, sort_order: 1, archived: false },
            ],
        },
    }),
}));

const benchPress = {
    id: 'bench',
    name: 'Bench Press',
    metric_definitions: [
        { id: 'weight', name: 'Weight', unit: 'lbs', is_multiplicative: true },
        { id: 'reps', name: 'Reps', unit: '', is_multiplicative: true },
    ],
};
const plank = {
    id: 'plank',
    name: 'Plank',
    has_sets: false,
    metric_definitions: [{ id: 'hold', name: 'Hold', unit: 's' }],
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
            activityDefinitions={[run, benchPress, plank]}
            associatedActivityIds={['run', 'bench', 'plank']}
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
        expect(within(screen.getByLabelText('Activity')).getAllByRole('option').map((option) => option.textContent))
            .toEqual(['Bench Press']);

        fireEvent.change(screen.getByLabelText('Rule 1 value'), { target: { value: '225' } });
        fireEvent.click(screen.getByRole('button', { name: '+ Add a metric rule' }));
        fireEvent.change(screen.getByLabelText('Rule 2 value'), { target: { value: '6' } });
        fireEvent.change(screen.getByLabelText('Sets'), { target: { value: '3' } });

        expect(screen.getByTestId('condition-preview'))
            .toHaveTextContent('Bench Press: at least 3 sets of Weight ≥ 225 lbs and Reps ≥ 6 within one session');
        expect(screen.queryByRole('button', { name: '+ Add a metric rule' })).not.toBeInTheDocument();
        expect(state.draft.rules.map((rule) => rule.metric_definition_id)).toEqual(['weight', 'reps']);
    });

    it('defaults lower-is-better metrics to "at most"', () => {
        render(<Harness />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        expect(screen.getByLabelText('Activity')).toHaveValue('run');
        expect(screen.getByLabelText('Rule 1 comparison')).toHaveValue('<=');
    });

    it('switches kinds and offers total yield only for activities with one', () => {
        render(<Harness />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        const kindTabs = within(screen.getByRole('tablist', { name: 'Threshold kind' }));

        fireEvent.click(kindTabs.getByRole('tab', { name: 'Cumulative' }));
        expect(screen.queryByRole('radio', { name: 'Total yield' })).not.toBeInTheDocument();
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
        expect(screen.getByText('sessions with at least')).toBeInTheDocument();
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

    it('asks for a linked activity first when the goal has none', () => {
        render(<Harness associatedActivityIds={[]} />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        expect(screen.queryByLabelText('Activity')).not.toBeInTheDocument();
        expect(screen.queryByRole('tablist', { name: 'Threshold kind' })).not.toBeInTheDocument();
        expect(screen.getByText('Link an activity to this goal to complete it on a threshold.')).toBeInTheDocument();
    });

    it('keeps a prefilled activity the goal is not linked to yet', () => {
        render(
            <Harness
                associatedActivityIds={['run']}
                initialCondition="activity_threshold"
                initialDraft={{
                    activity_definition_id: 'bench', name: '', kind: 'consistency', measure: 'sets',
                    min_sets: '1', required_count: '3', metric_definition_id: '', operator: '>=', target_value: '', rules: [],
                }}
            />
        );
        expect(screen.getByLabelText('Activity')).toHaveValue('bench');
        expect(within(screen.getByLabelText('Activity')).getAllByRole('option').map((option) => option.textContent))
            .toEqual(['Run', 'Bench Press']);
    });

    it('names the threshold, defaulting to the goal name', () => {
        let state;
        render(<Harness goalName="Bench 225" onState={(next) => { state = next; }} />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));

        const name = screen.getByLabelText('Name');
        expect(name).toHaveValue('');
        expect(name).toHaveAttribute('placeholder', 'Bench 225');

        fireEvent.change(name, { target: { value: 'Heavy triple' } });
        expect(state.draft.name).toBe('Heavy triple');
        fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'bench' } });
        expect(state.draft.name).toBe('Heavy triple');
    });

    it('never talks about sets for an activity without them', () => {
        render(<Harness />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'plank' } });

        expect(screen.queryByLabelText('Sets')).not.toBeInTheDocument();
        expect(screen.getByText('In one session, where')).toBeInTheDocument();
        fireEvent.change(screen.getByLabelText('Rule 1 value'), { target: { value: '60' } });
        expect(screen.getByTestId('condition-preview')).toHaveTextContent('Plank: Hold ≥ 60 s within one session');

        fireEvent.click(within(screen.getByRole('tablist', { name: 'Threshold kind' })).getByRole('tab', { name: 'Consistency' }));
        expect(screen.getByText('sessions where')).toBeInTheDocument();
        expect(screen.getByTestId('condition-preview')).toHaveTextContent('Plank: 3 sessions with Hold ≥ 60 s');
        expect(screen.queryByText(/\bset\b/)).not.toBeInTheDocument();
    });

    it('offers a streak on consistency only, and saves it on the draft', () => {
        let state;
        render(<Harness onState={(next) => { state = next; }} />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        expect(screen.queryByRole('checkbox', { name: /In a row/ })).not.toBeInTheDocument();

        fireEvent.click(within(screen.getByRole('tablist', { name: 'Threshold kind' })).getByRole('tab', { name: 'Consistency' }));
        fireEvent.click(screen.getByRole('checkbox', { name: /In a row/ }));
        expect(state.draft.consecutive).toBe(true);
        expect(screen.getByTestId('condition-preview')).toHaveTextContent('Run: 3 sessions in a row with');

        fireEvent.click(within(screen.getByRole('tablist', { name: 'Threshold kind' })).getByRole('tab', { name: 'Single session' }));
        expect(state.draft.consecutive).toBe(false);
    });

    it('requires chosen tags when the editor knows the fractal', () => {
        let state;
        const { unmount } = render(<Harness onState={(next) => { state = next; }} />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        expect(screen.queryByRole('checkbox', { name: 'Only count sets when tagged' })).not.toBeInTheDocument();
        unmount();

        render(<Harness rootId="root-1" onState={(next) => { state = next; }} />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        fireEvent.change(screen.getByLabelText('Activity'), { target: { value: 'bench' } });
        expect(screen.queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Only count sets when tagged' }));
        expect(tagEditorProps.current).toEqual(expect.objectContaining({
            rootId: 'root-1', activityId: 'bench', selectedTagIds: [], editable: true,
        }));
        fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));

        expect(state.draft.tag_ids).toEqual(['strict']);
        expect(tagEditorProps.current.selectedTagIds).toEqual(['strict']);
        expect(tagEditorProps.current.showSelected).toBe(false);
        expect(screen.getByText(/Only sets with every chosen tag \(others allowed\) count/)).toBeInTheDocument();
        const preview = screen.getByTestId('condition-preview');
        expect(preview).toHaveTextContent('Bench Press: at least 1 set of');
        expect(preview).toHaveTextContent('tagged');
        expect(within(preview).getByLabelText('Required tags')).toHaveTextContent('Strict');

        fireEvent.click(within(screen.getByRole('tablist', { name: 'Containing or exactly these tags' })).getByRole('tab', { name: 'Exactly' }));
        expect(state.draft.tag_match).toBe('exact');
        expect(screen.getByText(/Only sets with exactly the chosen tags, and no others, count/)).toBeInTheDocument();
        expect(screen.getByTestId('condition-preview')).toHaveTextContent('tagged exactly');

        fireEvent.click(screen.getByRole('checkbox', { name: 'Only count sets when tagged' }));
        expect(state.draft.tag_ids).toEqual([]);
        expect(screen.queryByRole('button', { name: 'Add tag' })).not.toBeInTheDocument();
    });

    it('seeds blank values with the best so far', () => {
        previewState.progress = {
            met: false, evidence_count: 2, current: 0, required: 1,
            rule_bests: [{ metric_definition_id: 'weight', operator: '>=', value: 300, best: 185 }],
        };
        render(<Harness rootId="root-1" goalId="goal-1" associatedActivityIds={['bench']} />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));

        expect(previewState.calls.at(-1).condition.rules[0].value).toBe(0);
        expect(screen.getByLabelText('Rule 1 value')).toHaveAttribute('placeholder', 'Best 185');
        expect(screen.queryByText(/Your best so far/)).not.toBeInTheDocument();
    });

    it('lets a threshold count each set or the average across sets', () => {
        let state;
        render(<Harness associatedActivityIds={['bench']} onState={(next) => { state = next; }} />);
        fireEvent.click(conditionTabs().getByRole('tab', { name: 'Activity threshold' }));
        fireEvent.change(screen.getByLabelText('Sets'), { target: { value: '3' } });
        fireEvent.change(screen.getByLabelText('Rule 1 value'), { target: { value: '5' } });
        const aggregate = within(screen.getByRole('tablist', { name: 'Best or average' }));
        expect(aggregate.getByRole('tab', { name: 'Best' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByText('sets where')).toBeInTheDocument();
        expect(screen.getByText('is')).toBeInTheDocument();

        fireEvent.click(aggregate.getByRole('tab', { name: 'Average' }));

        expect(state.draft.set_aggregate).toBe('average');
        expect(screen.getByText('The average across every counted set must meet each rule.')).toBeInTheDocument();
        expect(screen.getByTestId('condition-preview'))
            .toHaveTextContent('Bench Press: average Weight ≥ 5 lbs across at least 3 sets within one session');

        fireEvent.click(within(screen.getByRole('tablist', { name: 'Threshold kind' })).getByRole('tab', { name: 'Consistency' }));
        expect(screen.getByTestId('condition-preview'))
            .toHaveTextContent('Bench Press: 3 sessions averaging Weight ≥ 5 lbs across at least 3 sets');
    });

});
