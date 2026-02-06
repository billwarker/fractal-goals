import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import StepHeader from './StepHeader';

/**
 * Step 3: Create Session Button + Summary
 * Final step with submit button and session summary
 */
function CreateSessionActions({
    selectedTemplate,
    selectedProgramDay,
    creating,
    onCreateSession,
    activityDefinitions = [],
    goals = []
}) {
    const isDisabled = !selectedTemplate || creating;

    return (
        <div style={{
            background: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '24px',
            textAlign: 'center'
        }}>
            <h2 style={{
                fontSize: '20px',
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
            }}>
                <span style={{
                    background: '#2196f3',
                    color: 'white',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold'
                }}>2</span>
                Create Session
            </h2>

            <button
                onClick={onCreateSession}
                disabled={isDisabled}
                style={{
                    padding: '16px 48px',
                    background: isDisabled ? '#666' : '#4caf50',
                    border: 'none',
                    borderRadius: '6px',
                    color: 'white',
                    fontSize: '18px',
                    fontWeight: 'bold',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.5 : 1,
                    transition: 'all 0.2s',
                    marginBottom: '24px'
                }}
            >
                {creating ? 'Creating...' : '✓ Create Session'}
            </button>

            {selectedTemplate && (
                <SessionSummary
                    selectedTemplate={selectedTemplate}
                    selectedProgramDay={selectedProgramDay}
                    activityDefinitions={activityDefinitions}
                    goals={goals}
                />
            )}
        </div>
    );
}

function SessionSummary({ selectedTemplate, selectedProgramDay, activityDefinitions, goals }) {
    const { getGoalColor, getGoalSecondaryColor } = useTheme();

    // Combine goals from template, program day, and activities
    const calculateGoals = () => {
        let potentialGoals = [];
        const seenIds = new Set();

        // Helper to find a goal by ID in the hierarchical structure
        const findGoalById = (id) => {
            for (const stg of goals) {
                if (stg.id === id) return stg;
                if (stg.immediateGoals) {
                    const ig = stg.immediateGoals.find(ig => ig.id === id);
                    if (ig) return ig;
                }
            }
            return null;
        };

        // 1. Goals from Template
        if (selectedTemplate.goals) {
            selectedTemplate.goals.forEach(g => {
                if (!seenIds.has(g.id)) {
                    seenIds.add(g.id);
                    potentialGoals.push(g);
                }
            });
        }

        // 2. Goals from Program Day
        if (selectedProgramDay?.goals) {
            selectedProgramDay.goals.forEach(g => {
                if (!seenIds.has(g.id)) {
                    seenIds.add(g.id);
                    potentialGoals.push(g);
                }
            });
        }

        // 3. Goals from Activities
        // Extract unique activity IDs from template sections
        const templateActivityIds = new Set();
        if (selectedTemplate.template_data?.sections) {
            selectedTemplate.template_data.sections.forEach(section => {
                if (section.activities) {
                    section.activities.forEach(a => {
                        if (a.activity_id) templateActivityIds.add(a.activity_id);
                    });
                }
            });
        }

        // Find matching definitions and their goals
        templateActivityIds.forEach(actId => {
            const def = activityDefinitions.find(d => d.id === actId);
            if (def && def.associated_goal_ids) {
                def.associated_goal_ids.forEach(goalId => {
                    if (!seenIds.has(goalId)) {
                        // Find full goal object from goals prop (recursive/nested search)
                        const goalObj = findGoalById(goalId);
                        if (goalObj) {
                            seenIds.add(goalId);
                            potentialGoals.push(goalObj);
                        } else {
                            console.warn(`Goal object not found for ID: ${goalId}`);
                        }
                    }
                });
            }
        });

        // 4. Filtering by Program Block
        if (selectedProgramDay?.block_goal_ids && selectedProgramDay.block_goal_ids.length > 0) {
            const allowedIds = new Set(selectedProgramDay.block_goal_ids);
            potentialGoals = potentialGoals.filter(g => allowedIds.has(g.id));
        }

        return potentialGoals;
    };

    const associatedGoals = calculateGoals();

    return (
        <div style={{ marginTop: '24px', fontSize: '15px', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: '16px', fontSize: '16px' }}>
                Creating: <strong style={{ color: 'var(--color-text-primary)' }}>{selectedTemplate.name}</strong>
                {selectedProgramDay && (
                    <span> from <strong style={{ color: '#2196f3' }}>{selectedProgramDay.program_name}</strong></span>
                )}
            </div>

            {associatedGoals.length > 0 ? (
                <div style={{ textAlign: 'left', background: 'var(--color-bg-page)', padding: '16px', borderRadius: '8px' }}>
                    <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Associated Goals ({associatedGoals.length})
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {associatedGoals.map(goal => {
                            const isSmart = (goal.smart_status && Object.values(goal.smart_status).every(Boolean));
                            // Use correct type color or fallback to primary blue
                            const primaryColor = getGoalColor ? getGoalColor(goal.type) : '#2196f3';
                            const secondaryColor = getGoalSecondaryColor ? getGoalSecondaryColor(goal.type) : primaryColor;

                            return (
                                <li key={goal.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', fontSize: '16px', fontWeight: '500' }}>
                                    {/* Goal Node / Smart Ring */}
                                    <div style={{
                                        width: '24px',
                                        height: '24px',
                                        flexShrink: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        {isSmart ? (
                                            <svg width="24" height="24" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                {/* Layer 1: Outer Ring */}
                                                <circle cx="15" cy="15" r="13.75" fill={secondaryColor} stroke={primaryColor} strokeWidth="2.5" />
                                                {/* Layer 2: Middle Ring */}
                                                <circle cx="15" cy="15" r="8.75" fill={secondaryColor} stroke={primaryColor} strokeWidth="2.5" />
                                                {/* Layer 3: Inner Core */}
                                                <circle cx="15" cy="15" r="5" fill={primaryColor} />
                                            </svg>
                                        ) : (
                                            <div style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '50%',
                                                background: primaryColor
                                            }} />
                                        )}
                                    </div>
                                    <span style={{ color: 'var(--color-text-primary)' }}>{goal.name}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : (
                <div style={{ fontSize: '13px', fontStyle: 'italic', marginTop: '12px' }}>
                    Goals will be automatically associated based on the activities and context.
                </div>
            )}
        </div>
    );
}

export default CreateSessionActions;
