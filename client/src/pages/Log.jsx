import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import '../App.css';

/**
 * Create Practice Session Page
 * Simple 3-step flow: Select template → Associate with goal → Create session
 */
function Log() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [templates, setTemplates] = useState([]);
    const [goals, setGoals] = useState([]);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [selectedGoalIds, setSelectedGoalIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
            return;
        }
        fetchData();
    }, [rootId, navigate]);

    const fetchData = async () => {
        try {
            // Fetch templates and goals in parallel
            const [templatesRes, goalsRes] = await Promise.all([
                fractalApi.getSessionTemplates(rootId),
                fractalApi.getGoals(rootId)
            ]);

            setTemplates(templatesRes.data);

            // Extract all short-term goals from the tree
            const shortTermGoals = extractShortTermGoals(goalsRes.data);
            setGoals(shortTermGoals);

            // Pre-select goal from URL if provided
            const goalIdFromUrl = searchParams.get('goalId');
            if (goalIdFromUrl && shortTermGoals.some(g => g.id === goalIdFromUrl)) {
                setSelectedGoalIds([goalIdFromUrl]);
            }

            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch data", err);
            setLoading(false);
        }
    };

    const extractShortTermGoals = (goalTree) => {
        const shortTermGoals = [];

        const traverse = (node) => {
            if (node.attributes?.type === 'ShortTermGoal') {
                shortTermGoals.push({
                    id: node.id,
                    name: node.name,
                    description: node.attributes?.description
                });
            }
            if (node.children) {
                node.children.forEach(child => traverse(child));
            }
        };

        traverse(goalTree);
        return shortTermGoals;
    };

    const handleToggleGoal = (goalId) => {
        setSelectedGoalIds(prev =>
            prev.includes(goalId)
                ? prev.filter(id => id !== goalId)
                : [...prev, goalId]
        );
    };

    const handleCreateSession = async () => {
        if (!selectedTemplate) {
            alert('Please select a template');
            return;
        }

        if (selectedGoalIds.length === 0) {
            alert('Please select at least one short-term goal');
            return;
        }

        setCreating(true);

        try {
            // Convert template sections with activities to session sections with exercises
            const sectionsWithExercises = (selectedTemplate.template_data?.sections || []).map(section => {
                // Convert activities to exercise instances
                const exercises = (section.activities || []).map(activity => ({
                    type: 'activity',
                    name: activity.name,
                    activity_id: activity.activity_id,
                    instance_id: crypto.randomUUID(),
                    completed: false,
                    notes: ''
                }));

                return {
                    ...section,
                    exercises,
                    actual_duration_minutes: section.duration_minutes
                };
            });

            // Create the practice session
            const sessionData = {
                name: selectedTemplate.name,
                description: selectedTemplate.description || '',
                parent_ids: selectedGoalIds,
                duration_minutes: selectedTemplate.template_data?.total_duration_minutes || 0,
                session_data: JSON.stringify({
                    template_id: selectedTemplate.id,
                    template_name: selectedTemplate.name,
                    sections: sectionsWithExercises,
                    total_duration_minutes: selectedTemplate.template_data?.total_duration_minutes || 0
                })
            };

            const response = await fractalApi.createSession(rootId, sessionData);

            // Get the created session ID from the response
            const createdSessionId = response.data.id;

            // Navigate to the session detail page to fill in details
            navigate(`/${rootId}/session/${createdSessionId}`);
        } catch (err) {
            console.error('Error creating session:', err);
            alert('Error creating session: ' + err.message);
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <div className="page-container">
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container" style={{ color: 'white' }}>
            <h1 style={{ fontWeight: 300, borderBottom: '1px solid #444', paddingBottom: '15px', marginBottom: '30px' }}>
                Create Practice Session
            </h1>

            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Step 1: Select Template */}
                <div style={{
                    background: '#1e1e1e',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '24px',
                    marginBottom: '24px'
                }}>
                    <h2 style={{ fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                        }}>1</span>
                        Select a Template
                    </h2>

                    {templates.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                            <p style={{ color: '#666', marginBottom: '16px' }}>No templates available</p>
                            <button
                                onClick={() => navigate(`/${rootId}/manage-session-templates`)}
                                style={{
                                    padding: '10px 20px',
                                    background: '#2196f3',
                                    border: 'none',
                                    borderRadius: '4px',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                Create a Template
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '12px' }}>
                            {templates.map(template => {
                                const isSelected = selectedTemplate?.id === template.id;
                                const sectionCount = template.template_data?.sections?.length || 0;
                                const duration = template.template_data?.total_duration_minutes || 0;

                                return (
                                    <div
                                        key={template.id}
                                        onClick={() => setSelectedTemplate(template)}
                                        style={{
                                            background: isSelected ? '#2a3f5f' : '#2a2a2a',
                                            border: `2px solid ${isSelected ? '#2196f3' : '#444'}`,
                                            borderRadius: '6px',
                                            padding: '16px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
                                            {template.name}
                                        </div>
                                        <div style={{ fontSize: '13px', color: '#aaa', marginBottom: '8px' }}>
                                            {sectionCount} section{sectionCount !== 1 ? 's' : ''} • {duration} min
                                        </div>
                                        {template.description && (
                                            <div style={{ fontSize: '12px', color: '#888' }}>
                                                {template.description}
                                            </div>
                                        )}
                                        {isSelected && (
                                            <div style={{
                                                marginTop: '8px',
                                                color: '#2196f3',
                                                fontSize: '12px',
                                                fontWeight: 'bold'
                                            }}>
                                                ✓ Selected
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Step 2: Associate with Short-Term Goal */}
                <div style={{
                    background: '#1e1e1e',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '24px',
                    marginBottom: '24px'
                }}>
                    <h2 style={{ fontSize: '20px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                        Associate with Short-Term Goal(s)
                    </h2>

                    {goals.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                            <p>No short-term goals found. Create goals in the Fractal View first.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {goals.map(goal => {
                                const isSelected = selectedGoalIds.includes(goal.id);

                                return (
                                    <div
                                        key={goal.id}
                                        onClick={() => handleToggleGoal(goal.id)}
                                        style={{
                                            background: isSelected ? '#2a4a2a' : '#2a2a2a',
                                            border: `2px solid ${isSelected ? '#4caf50' : '#444'}`,
                                            borderRadius: '6px',
                                            padding: '12px 16px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{
                                            width: '20px',
                                            height: '20px',
                                            borderRadius: '4px',
                                            border: `2px solid ${isSelected ? '#4caf50' : '#666'}`,
                                            background: isSelected ? '#4caf50' : 'transparent',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'white',
                                            fontSize: '14px',
                                            fontWeight: 'bold',
                                            flexShrink: 0
                                        }}>
                                            {isSelected && '✓'}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                                                {goal.name}
                                            </div>
                                            {goal.description && (
                                                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                                    {goal.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Step 3: Create Session Button */}
                <div style={{
                    background: '#1e1e1e',
                    border: '1px solid #333',
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'center'
                }}>
                    <h2 style={{ fontSize: '20px', marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
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
                        }}>3</span>
                        Create Practice Session
                    </h2>

                    <button
                        onClick={handleCreateSession}
                        disabled={!selectedTemplate || selectedGoalIds.length === 0 || creating}
                        style={{
                            padding: '16px 48px',
                            background: (!selectedTemplate || selectedGoalIds.length === 0 || creating) ? '#666' : '#4caf50',
                            border: 'none',
                            borderRadius: '6px',
                            color: 'white',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            cursor: (!selectedTemplate || selectedGoalIds.length === 0 || creating) ? 'not-allowed' : 'pointer',
                            opacity: (!selectedTemplate || selectedGoalIds.length === 0 || creating) ? 0.5 : 1,
                            transition: 'all 0.2s'
                        }}
                    >
                        {creating ? 'Creating...' : '✓ Create Session'}
                    </button>

                    {selectedTemplate && selectedGoalIds.length > 0 && (
                        <div style={{ marginTop: '16px', fontSize: '14px', color: '#aaa' }}>
                            Creating: <strong style={{ color: 'white' }}>{selectedTemplate.name}</strong>
                            {' '}associated with{' '}
                            <strong style={{ color: 'white' }}>{selectedGoalIds.length}</strong>
                            {' '}goal{selectedGoalIds.length !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default Log;
