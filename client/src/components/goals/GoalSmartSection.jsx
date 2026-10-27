import React from 'react';
import { useGoalAttachments } from '../../hooks/useGoalDescriptionAttachments';
import Linkify from '../atoms/Linkify';
import MediaAttachment from '../notes/MediaAttachment';

function GoalSmartSection({ goal, rootId = null, goalId = null, showMedia = false }) {
    // Description media is read on demand (goal trees don't carry it); public snapshots have none.
    const { data: media = [] } = useGoalAttachments(rootId, goalId, showMedia);
    const description = goal.attributes?.description || goal.description || '';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Description (Specific) */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)', fontWeight: 'bold' }}>
                    Description
                </label>
                <div style={{ fontSize: '13px', color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                    <Linkify>{description}</Linkify>
                    {!description && !media.length && (
                        <span style={{ fontStyle: 'italic', color: 'var(--color-text-muted)' }}>No description</span>
                    )}
                </div>
                {media.map((asset) => <MediaAttachment key={asset.id} rootId={rootId} asset={asset} />)}
            </div>
        </div>
    );
}

export default GoalSmartSection;
