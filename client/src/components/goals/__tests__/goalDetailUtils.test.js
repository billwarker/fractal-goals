import { buildLiveSmartGoal } from '../goalDetailUtils';
import { calculateSMARTStatus, isSMART } from '../../../utils/smartHelpers';

const savedSmartGoal = {
    id: 'goal-1',
    description: 'Saved description',
    deadline: '2026-12-01T00:00:00Z',
    is_smart: true,
    smart_status: { specific: true, measurable: true, achievable: true, relevant: true, time_bound: true },
    attributes: { is_smart: true, smart_status: { specific: true, measurable: true, achievable: true, relevant: true, time_bound: true } },
};

const edits = (overrides = {}) => ({
    description: 'Saved description',
    completionCondition: 'activity_threshold',
    associatedActivityIds: ['a1'],
    deadline: '2026-12-01T00:00:00Z',
    relevanceStatement: 'Because',
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
});
