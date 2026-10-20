import React from 'react';
import { useTimezone } from '../../contexts/TimezoneContext';
import { getISOYMDInTimezone } from '../../utils/dateUtils';
import { getGoalReview } from '../../utils/goalReview';
import Linkify from '../atoms/Linkify';
import GoalReviewCadence from '../goalDetail/GoalReviewCadence';

function GoalSmartSection({ goal, mode, usesReviews = false }) {
    const { timezone } = useTimezone();
    const today = getISOYMDInTimezone(new Date(), timezone || 'UTC');
    // Reviewed levels show their review schedule (SMART's R) under the description.
    const showReview = usesReviews && mode !== 'create';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Description (Specific) */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
                    Description
                </label>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                    <Linkify>{goal.attributes?.description || goal.description || ""}</Linkify>
                    {(!goal.attributes?.description && !goal.description) && (
                        <span style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>No description</span>
                    )}
                </div>
            </div>

            {/* Review schedule (SMART's R) */}
            {showReview && (
                <div style={{ marginTop: '-8px' }}>
                    <GoalReviewCadence review={getGoalReview(goal)} today={today} />
                </div>
            )}
        </div>
    );
}

export default GoalSmartSection;
