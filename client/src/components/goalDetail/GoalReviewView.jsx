import React, { useMemo } from 'react';

import { useTimezone } from '../../contexts/TimezoneContext';
import { getISOYMDInTimezone } from '../../utils/dateUtils';
import { describeGoalDue } from '../../utils/goalDueFormat';
import { buildReviewTemplate, getGoalReview } from '../../utils/goalReview';
import { NoteComposer } from '../notes';

const read = (goal, key) => goal?.[key] ?? goal?.attributes?.[key];

/**
 * Writing a goal review: a goal_review note that starts from the goal's description, progress since the
 * last review and the due status. Saving restarts the review cadence.
 */
export default function GoalReviewView({ rootId, goal, goalId, onSubmit, onCancel, isSaving = false }) {
    const { timezone } = useTimezone();
    const today = getISOYMDInTimezone(new Date(), timezone || 'UTC');
    const initialContent = useMemo(() => {
        const children = (goal?.children || []).filter((child) => !read(child, 'deleted_at'));
        const due = describeGoalDue(read(goal, 'deadline'), today);
        return buildReviewTemplate({
            name: read(goal, 'name') || 'Goal',
            description: read(goal, 'description'),
            lastReviewOn: getGoalReview(goal)?.last_review_on,
            childrenTotal: children.length,
            childrenCompleted: children.filter((child) => read(child, 'completed')).length,
            dueLabel: due ? due.description : null,
            today,
        });
    // The template is the starting text when the view opens, not a live projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [goalId]);

    return (
        <NoteComposer
            rootId={rootId}
            initialContent={initialContent}
            submitLabel="Save review"
            prelinkedGoalId={goalId}
            hideLinkPanel
            isSubmitting={isSaving}
            onSubmit={(content, _goalId, _activityId, attachments) => onSubmit(content, attachments)}
            onCancel={onCancel}
        />
    );
}
