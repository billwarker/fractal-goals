import { buildReviewTemplate, describeCadence, describeReview, isReviewDue } from '../goalReview';

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

    it('describes each review state', () => {
        expect(describeReview(review(), TODAY)).toBe('Review every 3 months · next Nov 12');
        expect(describeReview(review({ deferred_until: '2026-11-12' }), TODAY)).toBe('Review every 3 months · deferred to Nov 12');
        expect(describeReview(review({ next_review_on: '2026-10-01' }), TODAY)).toBe('Review every 3 months · review due');
        expect(describeReview(review({ status: 'off', next_review_on: null }), TODAY)).toBe('Reviews off');
        expect(describeReview(review({ status: 'none', cadence: null }), TODAY)).toBe('No review cadence');
        expect(describeReview(review({ status: 'complete' }), TODAY)).toBeNull();
        expect(describeReview(null, TODAY)).toBeNull();
    });

    it('starts a review from the description, progress and due status', () => {
        const text = buildReviewTemplate({
            name: 'Play in a band', description: 'Gig monthly', lastReviewOn: '2026-07-19',
            childrenTotal: 4, childrenCompleted: 1, dueLabel: 'Due Dec 31, 2026 (in 73 days)', today: TODAY,
        });
        expect(text).toContain('## Review: Play in a band');
        expect(text).toContain('**The goal**\nGig monthly');
        expect(text).toContain('**Progress since the last review (Jul 19)**');
        expect(text).toContain('- 1 of 4 child goals complete');
        expect(text).toContain('- Due Dec 31, 2026 (in 73 days)');
    });
});
