import React from 'react';

function GoalSmartSection({
    goal,
    goalColor,
    parentGoalName,
    parentGoalColor,
    mode,
    goalType,
    relevanceStatement
}) {
    // Determine effective relevance statement (prop or local state)
    const effectiveRelevance = goal.attributes?.relevance_statement || relevanceStatement;

    // Determine parent info visibility conditions
    const showRelevance = ((parentGoalName && (goal.attributes?.parent_id || mode === 'create')) || goalType === 'UltimateGoal') && effectiveRelevance;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Description (Specific) */}
            <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: goalColor, fontWeight: 'bold' }}>
                    Description
                </label>
                <div style={{ fontSize: '13px', color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                    {goal.attributes?.description || goal.description ||
                        <span style={{ fontStyle: 'italic', color: '#666' }}>No description</span>}
                </div>
            </div>

            {/* Relevance Statement (Relevant) */}
            {showRelevance && (
                <div>
                    <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: goalColor, fontWeight: 'bold' }}>
                        {goalType === 'UltimateGoal'
                            ? "Why does this Ultimate Goal matter to you?"
                            : <span>How does this goal help you achieve <span style={{ color: parentGoalColor || '#fff' }}>{parentGoalName}</span>?</span>
                        }
                    </label>
                    <div style={{ fontSize: '13px', color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: '1.4' }}>
                        {effectiveRelevance}
                    </div>
                </div>
            )}
        </div>
    );
}

export default GoalSmartSection;
