import { buildLiveSmartGoal } from '../goalDetailUtils';
import { calculateSMARTStatus, isSMART } from '../../../utils/smartHelpers';

const savedSmartGoal = {
    id: 'goal-1',
    description: 'Saved description',
    deadline: '2026-12-01T00:00:00Z',
    is_smart: true,
    smart_status: { specific: true, measurable: true, achievable: true, reviewed: true, time_bound: true },
    attributes: { is_smart: true, smart_status: { specific: true, measurable: true, achievable: true, reviewed: true, time_bound: true } },
};

const edits = (overrides = {}) => ({
    description: 'Saved description',
    completionCondition: 'activity_threshold',
    associatedActivityIds: ['a1'],
    deadline: '2026-12-01T00:00:00Z',
    inheritParentActivities: false,
    ...overrides,
});

describe('buildLiveSmartGoal', () => {
    it('recomputes SMART from unsaved edits instead of the saved server status', () => {
        const live = buildLiveSmartGoal(savedSmartGoal, edits({ description: '', deadline: null }));

        expect(isSMART(live)).toBe(false);
        expect(calculateSMARTStatus(live)).toMatchObject({ specific: false, timeBound: false });
    });

    it('reports SMART when the edited values satisfy every criterion', () => {
        expect(isSMART(buildLiveSmartGoal(savedSmartGoal, edits()))).toBe(true);
    });

    it('is only measurable once the goal completes on its own', () => {
        const manual = buildLiveSmartGoal(savedSmartGoal, edits({ completionCondition: 'manual' }));
        const viaChildren = buildLiveSmartGoal(savedSmartGoal, edits({ completionCondition: 'children' }));

        expect(calculateSMARTStatus(manual).measurable).toBe(false);
        expect(calculateSMARTStatus(viaChildren).measurable).toBe(true);
    });

    it('recomputes R from the review settings being edited', () => {
        const level = { uses_reviews: true, review_cadence_value: 3 };
        const upcoming = { ...savedSmartGoal, review: { status: 'upcoming', next_review_on: '2999-01-01' } };

        expect(calculateSMARTStatus(buildLiveSmartGoal(upcoming, edits({ reviewLevel: level }))).reviewed).toBe(true);
        expect(calculateSMARTStatus(buildLiveSmartGoal(upcoming, edits({ reviewLevel: level, reviewsOn: false }))).reviewed).toBe(false);
        expect(calculateSMARTStatus(buildLiveSmartGoal(upcoming, edits({ reviewLevel: { uses_reviews: false }, reviewsOn: false }))).reviewed).toBe(true);
        const due = { ...savedSmartGoal, review: { status: 'due', next_review_on: '2000-01-01' } };
        // A due review takes R away until one is written.
        expect(calculateSMARTStatus(buildLiveSmartGoal(due, edits({ reviewLevel: level }))).reviewed).toBe(false);
    });
});

