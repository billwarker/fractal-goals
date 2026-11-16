import { describeDayCompletion } from '../programDayRules';

describe('describeDayCompletion', () => {
    it.each([
        [{ requiredSessions: 1, itemCount: 2 }, 'Done when its 1 required session is completed.'],
        [{ requiredSessions: 2, requiredActivities: 1, itemCount: 4 }, 'Done when its 2 required sessions and 1 required activity are completed.'],
        [{ requiredActivities: 2, minimum: 3, itemCount: 5 }, 'Done when its 2 required activities are completed, and at least 3 of 5 in all.'],
        [{ minimum: 2, itemCount: 3 }, 'Done when at least 2 of 3 are completed.'],
        [{ itemCount: 2 }, 'Done when any one of them is completed.'],
        [{ itemCount: 0 }, ''],
    ])('%j', (rule, sentence) => {
        expect(describeDayCompletion(rule)).toBe(sentence);
    });
});
