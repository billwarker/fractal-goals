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
                    transition: 'all 0.2s'
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
        <div style={{ marginTop: '16px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
            Creating: <strong style={{ color: 'var(--color-text-primary)' }}>{selectedTemplate.name}</strong>
            {selectedProgramDay && (
                <span> from <strong style={{ color: '#2196f3' }}>{selectedProgramDay.program_name}</strong></span>
            )}

            {associatedGoals.length > 0 ? (
                <div style={{ marginTop: '12px', textAlign: 'left', background: 'var(--color-bg-page)', padding: '12px', borderRadius: '6px' }}>
                    <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '4px', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                        Associated Goals ({associatedGoals.length})
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                        {associatedGoals.map(goal => (
                            <li key={goal.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <span style={{
                                    width: '8px', height: '8px', borderRadius: '50%',
                                    background: (goal.smart_status && Object.values(goal.smart_status).every(Boolean)) ? '#f44336' : '#2196f3'
                                }}></span>
                                {goal.name}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <div style={{ fontSize: '12px', fontStyle: 'italic', marginTop: '12px' }}>
                    Goals will be automatically associated based on the activities and context.
                </div>
            )}
        </div>
    );
}

export default CreateSessionActions;
