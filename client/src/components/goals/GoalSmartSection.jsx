import React from 'react';
import { useGoalAttachments } from '../../hooks/useGoalDescriptionAttachments';
import { getGoalCompletionCondition, getGoalCondition } from '../../utils/goalConditions';
import Linkify from '../atoms/Linkify';
import ConditionSentence from '../goalDetail/ConditionSentence';
import MediaAttachment from '../notes/MediaAttachment';

function GoalSmartSection({ goal, rootId = null, goalId = null, showMedia = false, accentColor = null }) {
    // Description media is read on demand (goal trees don't carry it); public snapshots have none.
    const { data: media = [] } = useGoalAttachments(rootId, goalId, showMedia);
    const description = goal.attributes?.description || goal.description || '';
    // A threshold goal says what completes it, in the threshold builder's words; that sentence is its
    // description when it has no other (and counts as Specific).
    const threshold = getGoalCompletionCondition(goal) === 'activity_threshold' ? getGoalCondition(goal) : null;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Description (Specific) */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
                    Description
                </label>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                    <Linkify>{description}</Linkify>
                    {!description && !media.length && !threshold && (
                        <span style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>No description</span>
                    )}
                </div>
                {media.map((asset) => <MediaAttachment key={asset.id} rootId={rootId} asset={asset} />)}
                {threshold ? (
                    <ConditionSentence
                        variant="preview"
                        condition={threshold}
                        data-testid="goal-threshold-sentence"
                        // The goal's colour, as in the threshold builder.
                        style={{ marginTop: '8px', ...(accentColor ? { '--goal-edit-accent': accentColor } : {}) }}
                    />
                ) : null}
            </div>
        </div>
    );
}

export default GoalSmartSection;
