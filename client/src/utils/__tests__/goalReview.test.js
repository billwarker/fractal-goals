// @vitest-environment node
import cases from '../../../../tests/fixtures/goal_review_cases.json';
import { describeCadence, describeNextReview, isReviewDue, nextReviewDate, reviewContext } from '../goalReview';

const TODAY = '2026-10-19';
const review = (fields) => ({ cadence: { value: 3, unit: 'months', source: 'level' }, status: 'upcoming', next_review_on: '2026-11-12', ...fields });

describe('goal review wording', () => {
    it('words cadences', () => {
        expect(describeCadence({ value: 1, unit: 'months' })).toBe('every month');
        expect(describeCadence({ value: 3, unit: 'months' })).toBe('every 3 months');
        expect(describeCadence(null)).toBe('');
    });

    it('re-checks due against the user’s today', () => {
        expect(isReviewDue(review({ next_review_on: '2026-10-19' }), TODAY)).toBe(true);
        expect(isReviewDue(review({ next_review_on: '2026-10-20' }), TODAY)).toBe(false);
    });

    it.each(cases.map((testCase) => [testCase.name, testCase]))('next review: %s', (_name, testCase) => {
        expect(nextReviewDate(testCase.anchor, testCase.cadence, testCase.pauses, testCase.today)).toEqual({
            nextReviewOn: testCase.expected.next_review_on, pausedDays: testCase.expected.paused_days,
        });
    });

    it('previews the next review under the cadence being edited', () => {
        const monthly = { value: 1, unit: 'months' };
        const next = (fields) => describeNextReview({ cadence: monthly, today: TODAY, startedAt: '2026-10-01', ...fields });
        expect(next({})).toBe('Next review Nov 1 · 1 month after the start date (Oct 1)');
        expect(next({ cadence: { value: 3, unit: 'weeks' }, review: { last_review_on: '2026-10-10' } }))
            .toBe('Next review Oct 31 · 3 weeks after the last review (Oct 10)');
        expect(next({ review: { pauses: [{ paused_on: '2026-10-05', resumed_on: '2026-10-12' }] } }))
            .toBe('Next review Nov 8 · 1 month after the start date (Oct 1), plus 7 days paused');
        expect(next({ review: { deferred_until: '2026-11-20' } })).toBe('Next review Nov 20 · deferred from Nov 1');
        expect(next({ startedAt: '2026-09-19' })).toBe('Review due today · 1 month after the start date (Sep 19)');
        expect(next({ startedAt: '2026-08-01' })).toBe('Review due since Sep 1 · 1 month after the start date (Aug 1)');
        // Before a start date is set, the goal's creation counts.
        expect(next({ startedAt: '', createdAt: '2026-10-05T12:00:00Z' })).toBe('Next review Nov 5 · 1 month after the start date (Oct 5)');
    });

    it('holds the next review while the goal is paused', () => {
        const paused = (startedAt) => describeNextReview({
            cadence: { value: 1, unit: 'months' }, today: TODAY, startedAt, paused: true,
            review: { pauses: [{ paused_on: '2026-10-09', resumed_on: null }] },
        });
        expect(paused('2026-10-01')).toBe('Next review on hold while the goal is paused · 23 days left when it resumes');
        expect(paused('2026-08-01')).toBe('Next review on hold while the goal is paused · due when it resumes');
        expect(describeNextReview({ cadence: null, today: TODAY })).toBeNull();
    });

    it('summarizes what changed since the last review', () => {
        const context = reviewContext({
            description: ' Gig monthly ', lastReviewOn: '2026-07-19', today: TODAY,
            children: [
                { completed: true, completed_at: '2026-08-02T10:00:00Z' },
                { completed: true, completed_at: '2026-07-19T10:00:00Z' },
                { completed: false }, { completed: false },
            ],
            activityDays: [
                { date: '2026-07-19', activities: 2 }, { date: '2026-07-20', activities: 1 },
                { date: '2026-08-01', activities: 0 }, { date: '2026-08-02', activities: 3 },
            ],
            dueLabel: 'Due Dec 31, 2026 (in 73 days)',
        });
        expect(context).toEqual({
            since: 'Since the last review (Jul 19)',
            description: 'Gig monthly',
            facts: ['Active on 2 days', '1 of 4 child goals completed', 'Due Dec 31, 2026 (in 73 days)'],
        });
    });

    it('counts from the start before a first review', () => {
        const context = reviewContext({
            today: TODAY, children: [{ completed: true, completed_at: null }],
            activityDays: [{ date: '2026-01-02', activities: 1 }],
        });
        expect(context).toEqual({
            since: 'So far', description: '', facts: ['Active on 1 day', '1 of 1 child goal completed', 'No due date'],
        });
    });
});
