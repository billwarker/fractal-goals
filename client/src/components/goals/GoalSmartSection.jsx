import React from 'react';
import Linkify from '../atoms/Linkify';

function GoalSmartSection({ goal }) {
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
        </div>
    );
}

export default GoalSmartSection;
