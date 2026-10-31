import { describe, expect, it } from 'vitest';

import fixture from '../../../../tests/fixtures/goal_condition_validation_cases.json';
import { conditionToDraft, validateConditionDraft } from '../goalConditions';

// The server runs the same cases (tests/integration/test_goal_condition_tags_api.py), so the
// editor rejects what the API would, in the same words.
const activity = {
    id: 'bench',
    name: 'Bench Press',
    has_sets: true,
    metric_definitions: [
        { id: 'weight', name: 'Weight', unit: 'lbs' },
        { id: 'reps', name: 'Reps', unit: '' },
    ],
};

describe('condition validation parity with the server', () => {
    it.each(fixture.cases.map((testCase) => [testCase.name, testCase]))('%s', (_name, testCase) => {
        const draft = conditionToDraft({ ...testCase.condition, activity_definition_id: activity.id });
        expect(Object.values(validateConditionDraft(draft, activity))).toContain(testCase.message);
    });
});
