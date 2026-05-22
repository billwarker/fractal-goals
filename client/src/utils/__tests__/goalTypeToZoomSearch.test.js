import {
    fuzzyGoalNameMatches,
    getGoalSearchMatches,
    getVisibleGoalSearchCandidates,
    normalizeGoalSearchText,
} from '../goalTypeToZoomSearch';

describe('goalTypeToZoomSearch', () => {
    it('normalizes search text case and punctuation', () => {
        expect(normalizeGoalSearchText('Project: Plan, v2!')).toBe('projectplanv2');
    });

    it('matches goal names case-insensitively', () => {
        expect(fuzzyGoalNameMatches('Learn Piano', 'lp')).toBe(true);
        expect(fuzzyGoalNameMatches('Learn Piano', 'LEARN')).toBe(true);
    });

    it('ignores punctuation while matching', () => {
        expect(fuzzyGoalNameMatches('Project: Plan, v2!', 'projectplanv2')).toBe(true);
        expect(fuzzyGoalNameMatches('Project: Plan, v2!', 'prjpln')).toBe(true);
    });

    it('does not match when query characters are out of order', () => {
        expect(fuzzyGoalNameMatches('Project Plan', 'lnap')).toBe(false);
    });

    it('returns duplicate same-name match groups', () => {
        const candidates = [
            { id: 'a', name: 'Practice Scales', normalizedName: 'practicescales' },
            { id: 'b', name: 'Practice-Scales', normalizedName: 'practicescales' },
            { id: 'c', name: 'Practice Schedule', normalizedName: 'practiceschedule' },
        ];

        const result = getGoalSearchMatches(candidates, 'practice scales');

        expect(result.matches.map((match) => match.id)).toEqual(['a', 'b']);
        expect(result.activeDuplicateGroup.map((match) => match.id)).toEqual(['a', 'b']);
    });

    it('only returns candidates visible under current graph settings', () => {
        const tree = {
            id: 'root',
            name: 'Root',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'completed',
                    name: 'Completed Parent',
                    type: 'LongTermGoal',
                    completed: true,
                    children: [
                        {
                            id: 'hidden-child',
                            name: 'Hidden Child',
                            type: 'MidTermGoal',
                            children: [],
                        },
                    ],
                },
                {
                    id: 'visible',
                    name: 'Visible Child',
                    type: 'LongTermGoal',
                    children: [],
                },
            ],
        };

        const candidates = getVisibleGoalSearchCandidates(tree, { hideCompletedGoals: true });

        expect(candidates.map((candidate) => candidate.id)).toEqual(['root', 'visible']);
    });

    it('omits hidden inactive candidates', () => {
        const tree = {
            id: 'root',
            name: 'Root',
            type: 'UltimateGoal',
            children: [
                {
                    id: 'inactive',
                    name: 'Inactive Goal',
                    type: 'LongTermGoal',
                    children: [],
                },
                {
                    id: 'active',
                    name: 'Active Goal',
                    type: 'LongTermGoal',
                    children: [],
                },
            ],
        };

        const candidates = getVisibleGoalSearchCandidates(tree, {
            hiddenInactiveGoalIds: new Set(['inactive']),
        });

        expect(candidates.map((candidate) => candidate.id)).toEqual(['root', 'active']);
    });
});
