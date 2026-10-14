import cases from '../../../../tests/fixtures/program_goal_window_cases.json';
import { isGoalInProgramWindow } from '../programGoalWindow';

describe('program goal eligibility shared contract', () => {
    it.each(cases)('$name', ({ completed, completed_at, eligible }) => {
        expect(isGoalInProgramWindow({ completed, completed_at }, '2026-05-22', '2026-08-31'))
            .toBe(eligible);
    });
});
