import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import GoalModal from '../components/modals/GoalModal';
import '../App.css';

/**
 * Create Session Page
 * Enhanced flow: Select from program day OR select template → Associate with goal → Create session
 */
function Log() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [templates, setTemplates] = useState([]);
    const [goals, setGoals] = useState([]);
    const [programDays, setProgramDays] = useState([]);
    const [programsByName, setProgramsByName] = useState({}); // NEW: group days by program
    const [selectedProgram, setSelectedProgram] = useState(null); // NEW: selected program name
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [selectedProgramDay, setSelectedProgramDay] = useState(null);
    const [selectedProgramSession, setSelectedProgramSession] = useState(null);
    const [selectedGoalIds, setSelectedGoalIds] = useState([]);
    const [immediateGoals, setImmediateGoals] = useState([]); // NEW: immediate goals to attach
    const [existingImmediateGoals, setExistingImmediateGoals] = useState([]); // NEW: existing immediate goals from tree
    const [activityDefinitions, setActivityDefinitions] = useState([]); // NEW: for target creation
    const [showGoalModal, setShowGoalModal] = useState(false); // NEW: control goal creation modal
    const [showSelectGoalModal, setShowSelectGoalModal] = useState(false); // NEW: control goal selection modal
    const [sessionSource, setSessionSource] = useState(null); // 'program' or 'template'
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
            // Fetch templates, goals, active program days, and activities in parallel
            const [templatesRes, goalsRes, programDaysRes, activitiesRes] = await Promise.all([
                fractalApi.getSessionTemplates(rootId),
                fractalApi.getGoals(rootId),
                fractalApi.getActiveProgramDays(rootId),
                fractalApi.getActivities(rootId)
            ]);

            setTemplates(templatesRes.data);
            const allProgramDays = programDaysRes.data || [];
            setProgramDays(allProgramDays);

            // Group program days by program name
            const grouped = {};
            allProgramDays.forEach(day => {
                const programName = day.program_name;
                if (!grouped[programName]) {
                    grouped[programName] = {
                        program_id: day.program_id,
                        program_name: programName,
                        days: []
                    };
                }
                grouped[programName].days.push(day);
            });
            setProgramsByName(grouped);

            // Extract all short-term goals from the tree
            const shortTermGoals = extractShortTermGoals(goalsRes.data);
            setGoals(shortTermGoals);

            // Extract all immediate goals from the tree
            const immediateGoalsFromTree = extractImmediateGoals(goalsRes.data);
            setExistingImmediateGoals(immediateGoalsFromTree);

            // Set activity definitions for target creation
            setActivityDefinitions(activitiesRes.data || []);

            // Pre-select goal from URL if provided
            const goalIdFromUrl = searchParams.get('goalId');
            if (goalIdFromUrl && shortTermGoals.some(g => g.id === goalIdFromUrl)) {
                setSelectedGoalIds([goalIdFromUrl]);
            }

            // Auto-select session source and program if only one option is available
            const programNames = Object.keys(grouped);
            if (programNames.length === 1 && templatesRes.data.length === 0) {
                // Only one program, no templates → auto-select program
                setSessionSource('program');
                setSelectedProgram(programNames[0]);
            } else if (programNames.length === 1 && templatesRes.data.length > 0) {
                // One program and templates → auto-select the program for "From Program" option
                setSelectedProgram(programNames[0]);
            } else if (programNames.length === 0 && templatesRes.data.length > 0) {
                // No programs, only templates → auto-select template source
                setSessionSource('template');
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

    const extractImmediateGoals = (goalTree) => {
        const immediateGoals = [];

        const traverse = (node) => {
            if (node.attributes?.type === 'ImmediateGoal') {
                immediateGoals.push({
                    id: node.id,
                    name: node.name,
                    description: node.attributes?.description,
                    deadline: node.attributes?.deadline
                });
            }
            if (node.children) {
                node.children.forEach(child => traverse(child));
            }
        };

        traverse(goalTree);
        return immediateGoals;
    };

    const handleToggleGoal = (goalId) => {
        setSelectedGoalIds(prev =>
            prev.includes(goalId)
                ? prev.filter(id => id !== goalId)
                : [...prev, goalId]
        );
    };

    const handleSelectProgramDay = (programDay) => {
        setSelectedProgramDay(programDay);
        setSelectedProgramSession(null); // Reset session selection
        setSelectedTemplate(null); // Reset template

        // If only one session, auto-select it
        if (programDay.sessions && programDay.sessions.length === 1) {
            const session = programDay.sessions[0];
            setSelectedProgramSession(session);
            setSelectedTemplate({
                id: session.template_id,
                name: session.template_name,
                description: session.template_description,
                template_data: session.template_data
            });
        }
    };

    const handleSelectProgramSession = (session) => {
        setSelectedProgramSession(session);
        setSelectedTemplate({
            id: session.template_id,
            name: session.template_name,
            description: session.template_description,
            template_data: session.template_data
        });
    };

    const handleSelectSource = (source) => {
        // Reset selections when switching sources
        setSelectedTemplate(null);
        setSelectedProgramDay(null);
        setSelectedProgramSession(null);
        setSessionSource(source);
    };

    const handleSelectProgram = (programName) => {
        // Reset day/session selections when switching programs
        setSelectedProgramDay(null);
        setSelectedProgramSession(null);
        setSelectedTemplate(null);
        setSelectedProgram(programName);
        setSessionSource('program'); // Auto-select program source
    };

    const handleCreateImmediateGoal = (goalData) => {
        // Add the goal to our list with a temporary ID
        const newGoal = {
            ...goalData,
            tempId: crypto.randomUUID(),
            type: 'ImmediateGoal',
            isNew: true // Mark as new so we know to create it
        };
        setImmediateGoals(prev => [...prev, newGoal]);
        setShowGoalModal(false);
    };

    const handleSelectExistingGoal = (goal) => {
        // Check if already added
        if (immediateGoals.some(g => g.id === goal.id || g.tempId === goal.id)) {
            return; // Already added
        }
        // Add existing goal to the list
        setImmediateGoals(prev => [...prev, { ...goal, tempId: goal.id, isNew: false }]);
    };

    const handleRemoveImmediateGoal = (tempId) => {
        setImmediateGoals(prev => prev.filter(g => g.tempId !== tempId));
    };

    const handleCreateSession = async () => {
        if (!selectedTemplate) {
            alert('Please select a template or program day');
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
                    program_context: selectedProgramDay ? {
                        program_id: selectedProgramDay.program_id,
                        program_name: selectedProgramDay.program_name,
                        block_id: selectedProgramDay.block_id,
                        block_name: selectedProgramDay.block_name,
                        day_id: selectedProgramDay.day_id,
                        day_name: selectedProgramDay.day_name
                    } : null,
                    sections: sectionsWithExercises,
                    total_duration_minutes: selectedTemplate.template_data?.total_duration_minutes || 0
                })
            };

            const response = await fractalApi.createSession(rootId, sessionData);

            // Get the created session ID from the response
            const createdSessionId = response.data.id;

            // Create immediate goals as children of the practice session
            if (immediateGoals.length > 0) {
                // Separate new goals from existing goals
                const newGoals = immediateGoals.filter(g => g.isNew);
                const existingGoals = immediateGoals.filter(g => !g.isNew);

                // Create new immediate goals
                if (newGoals.length > 0) {
                    await Promise.all(
                        newGoals.map(goal =>
                            fractalApi.createGoal(rootId, {
                                name: goal.name,
                                description: goal.description || '',
                                deadline: goal.deadline || null,
                                type: 'ImmediateGoal',
                                parent_id: createdSessionId,
                                targets: goal.targets || []
                            })
                        )
                    );
                }

                // Update existing goals to add this session as a parent
                if (existingGoals.length > 0) {
                    await Promise.all(
                        existingGoals.map(goal =>
                            fractalApi.updateGoal(goal.id, {
                                parent_id: createdSessionId
                            })
                        )
                    );
                }
            }

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

    const hasProgramDays = programDays.length > 0;
    const hasTemplates = templates.length > 0;
    const programNames = Object.keys(programsByName);
    const hasMultiplePrograms = programNames.length > 1;
    const hasSingleProgram = programNames.length === 1;
    const showSourceChoice = hasSingleProgram && hasTemplates;
    const showProgramChoice = hasMultiplePrograms;

    // Get the days for the currently selected program
    const currentProgramDays = selectedProgram ? (programsByName[selectedProgram]?.days || []) : [];

    return (
        <div className="page-container" style={{ color: 'white' }}>
            <h1 style={{ fontWeight: 300, borderBottom: '1px solid #444', paddingBottom: '15px', marginBottom: '30px' }}>
                Create Session
            </h1>

            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Step 0a: Choose Program (if multiple programs available) */}
                {showProgramChoice && (
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
                            }}>0</span>
                            Choose a Program
                        </h2>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {programNames.map(programName => {
                                const program = programsByName[programName];
                                const isSelected = selectedProgram === programName;
                                const dayCount = program.days.length;

                                return (
                                    <div
                                        key={programName}
                                        onClick={() => handleSelectProgram(programName)}
                                        style={{
                                            background: isSelected ? '#2a3f5f' : '#2a2a2a',
                                            border: `2px solid ${isSelected ? '#2196f3' : '#444'}`,
                                            borderRadius: '6px',
                                            padding: '16px 20px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.borderColor = '#2196f3';
                                            }
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isSelected) {
                                                e.currentTarget.style.borderColor = '#444';
                                            }
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontSize: '48px', marginRight: '16px', display: 'inline' }}>📅</div>
                                            <div style={{ display: 'inline-block', verticalAlign: 'middle' }}>
                                                <div style={{ fontWeight: 'bold', fontSize: '18px' }}>
                                                    {programName}
                                                </div>
                                                <div style={{ fontSize: '13px', color: '#aaa', marginTop: '4px' }}>
                                                    {dayCount} active day{dayCount !== 1 ? 's' : ''} available
                                                </div>
                                            </div>
                                        </div>
                                        {isSelected && (
                                            <div style={{
                                                color: '#2196f3',
                                                fontSize: '14px',
                                                fontWeight: 'bold'
                                            }}>
                                                ✓ Selected
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {hasTemplates && (
                            <div style={{ marginTop: '16px', textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>or</div>
                                <button
                                    onClick={() => handleSelectSource('template')}
                                    style={{
                                        padding: '10px 20px',
                                        background: sessionSource === 'template' ? '#2196f3' : 'transparent',
                                        border: '1px solid #2196f3',
                                        borderRadius: '4px',
                                        color: sessionSource === 'template' ? 'white' : '#2196f3',
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        fontSize: '14px',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (sessionSource !== 'template') {
                                            e.currentTarget.style.background = 'rgba(33, 150, 243, 0.1)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (sessionSource !== 'template') {
                                            e.currentTarget.style.background = 'transparent';
                                        }
                                    }}
                                >
                                    📋 Select Template Manually Instead
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Step 0b: Choose Session Source (if single program and templates available) */}
                {showSourceChoice && (
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
                            }}>0</span>
                            Choose Session Source
                        </h2>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div
                                onClick={() => handleSelectSource('program')}
                                style={{
                                    background: sessionSource === 'program' ? '#2a3f5f' : '#2a2a2a',
                                    border: `2px solid ${sessionSource === 'program' ? '#2196f3' : '#444'}`,
                                    borderRadius: '8px',
                                    padding: '24px',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    if (sessionSource !== 'program') {
                                        e.currentTarget.style.borderColor = '#2196f3';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (sessionSource !== 'program') {
                                        e.currentTarget.style.borderColor = '#444';
                                    }
                                }}
                            >
                                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📅</div>
                                <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>
                                    From Active Program
                                </div>
                                <div style={{ fontSize: '13px', color: '#aaa' }}>
                                    Select a day from your current training program
                                </div>
                                {sessionSource === 'program' && (
                                    <div style={{
                                        marginTop: '12px',
                                        color: '#2196f3',
                                        fontSize: '12px',
                                        fontWeight: 'bold'
                                    }}>
                                        ✓ Selected
                                    </div>
                                )}
                            </div>

                            <div
                                onClick={() => handleSelectSource('template')}
                                style={{
                                    background: sessionSource === 'template' ? '#2a3f5f' : '#2a2a2a',
                                    border: `2px solid ${sessionSource === 'template' ? '#2196f3' : '#444'}`,
                                    borderRadius: '8px',
                                    padding: '24px',
                                    cursor: 'pointer',
                                    textAlign: 'center',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    if (sessionSource !== 'template') {
                                        e.currentTarget.style.borderColor = '#2196f3';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (sessionSource !== 'template') {
                                        e.currentTarget.style.borderColor = '#444';
                                    }
                                }}
                            >
                                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                                <div style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>
                                    From Template
                                </div>
                                <div style={{ fontSize: '13px', color: '#aaa' }}>
                                    Choose any template manually
                                </div>
                                {sessionSource === 'template' && (
                                    <div style={{
                                        marginTop: '12px',
                                        color: '#2196f3',
                                        fontSize: '12px',
                                        fontWeight: 'bold'
                                    }}>
                                        ✓ Selected
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 1: Select Program Day OR Template */}
                {(sessionSource === 'program' || (hasProgramDays && !hasTemplates)) && (
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
                            Select a Day from Your Program
                        </h2>

                        {currentProgramDays.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                <p style={{ color: '#666', marginBottom: '16px' }}>No active program days available for today</p>
                                {hasTemplates && (
                                    <button
                                        onClick={() => setSessionSource('template')}
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
                                        Select Template Instead
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {currentProgramDays.map(programDay => {
                                    const isSelected = selectedProgramDay?.day_id === programDay.day_id;
                                    const hasMultipleSessions = programDay.sessions.length > 1;

                                    return (
                                        <div key={programDay.day_id}>
                                            <div
                                                onClick={() => handleSelectProgramDay(programDay)}
                                                style={{
                                                    background: isSelected ? '#2a3f5f' : '#2a2a2a',
                                                    border: `2px solid ${isSelected ? '#2196f3' : '#444'}`,
                                                    borderRadius: '6px',
                                                    padding: '16px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                                    <div style={{
                                                        width: '4px',
                                                        height: '40px',
                                                        background: programDay.block_color || '#2196f3',
                                                        borderRadius: '2px'
                                                    }} />
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
                                                            {programDay.program_name} - {programDay.block_name}
                                                        </div>
                                                        <div style={{ fontSize: '13px', color: '#aaa' }}>
                                                            {programDay.day_name} (Day {programDay.day_number})
                                                            {hasMultipleSessions && (
                                                                <span style={{ marginLeft: '8px', color: '#2196f3' }}>
                                                                    • {programDay.sessions.length} sessions
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {!hasMultipleSessions && (
                                                    <div style={{ marginLeft: '16px', fontSize: '14px' }}>
                                                        <div style={{
                                                            padding: '8px',
                                                            background: 'rgba(33, 150, 243, 0.1)',
                                                            borderRadius: '4px'
                                                        }}>
                                                            <div style={{ fontWeight: 'bold' }}>{programDay.sessions[0].template_name}</div>
                                                            {programDay.sessions[0].template_description && (
                                                                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                                                    {programDay.sessions[0].template_description}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {isSelected && !hasMultipleSessions && (
                                                    <div style={{
                                                        marginTop: '8px',
                                                        color: '#2196f3',
                                                        fontSize: '12px',
                                                        fontWeight: 'bold',
                                                        textAlign: 'right'
                                                    }}>
                                                        ✓ Selected
                                                    </div>
                                                )}
                                            </div>

                                            {/* Show session selection for multi-session days */}
                                            {isSelected && hasMultipleSessions && (
                                                <div style={{
                                                    marginTop: '12px',
                                                    marginLeft: '20px',
                                                    paddingLeft: '16px',
                                                    borderLeft: `3px solid ${programDay.block_color || '#2196f3'}`
                                                }}>
                                                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#aaa' }}>
                                                        Select a session from this day:
                                                    </div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {programDay.sessions.map((session, idx) => {
                                                            const isSessionSelected = selectedProgramSession?.template_id === session.template_id;

                                                            return (
                                                                <div
                                                                    key={session.template_id}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleSelectProgramSession(session);
                                                                    }}
                                                                    style={{
                                                                        padding: '12px',
                                                                        background: isSessionSelected ? 'rgba(33, 150, 243, 0.2)' : 'rgba(33, 150, 243, 0.05)',
                                                                        border: `2px solid ${isSessionSelected ? '#2196f3' : 'transparent'}`,
                                                                        borderRadius: '4px',
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                >
                                                                    <div style={{ fontWeight: 'bold', fontSize: '15px' }}>
                                                                        {session.template_name}
                                                                    </div>
                                                                    {session.template_description && (
                                                                        <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                                                            {session.template_description}
                                                                        </div>
                                                                    )}
                                                                    {isSessionSelected && (
                                                                        <div style={{
                                                                            marginTop: '6px',
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
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {(sessionSource === 'template' || (!hasProgramDays && hasTemplates)) && (
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
                                            onClick={() => {
                                                setSelectedTemplate(template);
                                                setSelectedProgramDay(null); // Clear program day selection
                                                setSelectedProgramSession(null);
                                            }}
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
                )}

                {/* Step 2: Associate with Short-Term Goal */}
                {(selectedTemplate || selectedProgramDay) && (
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
                )}

                {/* Step 3: Attach Immediate Goals (Optional) */}
                {(selectedTemplate || selectedProgramDay) && selectedGoalIds.length > 0 && (
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
                            }}>3</span>
                            Attach Immediate Goals (Optional)
                        </h2>

                        <div style={{ marginBottom: '16px', color: '#aaa', fontSize: '14px' }}>
                            Add immediate goals that you want to accomplish during this practice session.
                        </div>

                        {immediateGoals.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                                {immediateGoals.map(goal => (
                                    <div
                                        key={goal.tempId}
                                        style={{
                                            background: '#2a2a2a',
                                            border: '2px solid #9c27b0',
                                            borderRadius: '6px',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px'
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#9c27b0' }}>
                                                {goal.name}
                                            </div>
                                            {goal.description && (
                                                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                                    {goal.description}
                                                </div>
                                            )}
                                            {goal.deadline && (
                                                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                                    📅 {new Date(goal.deadline).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handleRemoveImmediateGoal(goal.tempId)}
                                            style={{
                                                padding: '6px 12px',
                                                background: '#d32f2f',
                                                border: 'none',
                                                borderRadius: '4px',
                                                color: 'white',
                                                cursor: 'pointer',
                                                fontSize: '12px',
                                                fontWeight: 'bold'
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <button
                                onClick={() => setShowSelectGoalModal(true)}
                                disabled={existingImmediateGoals.length === 0}
                                style={{
                                    padding: '12px 24px',
                                    background: existingImmediateGoals.length === 0 ? '#555' : '#2196f3',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: 'white',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    cursor: existingImmediateGoals.length === 0 ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: existingImmediateGoals.length === 0 ? 0.5 : 1
                                }}
                                onMouseEnter={(e) => {
                                    if (existingImmediateGoals.length > 0) {
                                        e.currentTarget.style.background = '#1976d2';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (existingImmediateGoals.length > 0) {
                                        e.currentTarget.style.background = '#2196f3';
                                    }
                                }}
                            >
                                📎 Add Existing Goal
                            </button>

                            <button
                                onClick={() => setShowGoalModal(true)}
                                style={{
                                    padding: '12px 24px',
                                    background: '#9c27b0',
                                    border: 'none',
                                    borderRadius: '6px',
                                    color: 'white',
                                    fontSize: '16px',
                                    fontWeight: 'bold',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background = '#7b1fa2';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = '#9c27b0';
                                }}
                            >
                                + Create New Goal
                            </button>
                        </div>
                    </div>
                )}

                {/* Step 4: Create Session Button */}
                {(selectedTemplate || selectedProgramDay) && (
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
                            }}>4</span>
                            Create Session
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
                                {selectedProgramDay && (
                                    <span> from <strong style={{ color: '#2196f3' }}>{selectedProgramDay.program_name}</strong></span>
                                )}
                                {' '}associated with{' '}
                                <strong style={{ color: 'white' }}>{selectedGoalIds.length}</strong>
                                {' '}goal{selectedGoalIds.length !== 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Goal Creation Modal */}
            <GoalModal
                isOpen={showGoalModal}
                onClose={() => setShowGoalModal(false)}
                onSubmit={handleCreateImmediateGoal}
                parent={{
                    name: selectedTemplate?.name || 'Practice Session',
                    type: 'PracticeSession',
                    attributes: { type: 'PracticeSession' }
                }}
                activityDefinitions={activityDefinitions}
            />

            {/* Goal Selection Modal */}
            {showSelectGoalModal && (
                <div className="modal-overlay" onClick={() => setShowSelectGoalModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                        <h2>Select Existing Immediate Goal</h2>

                        {existingImmediateGoals.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                                <p>No existing immediate goals found.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                                {existingImmediateGoals.map(goal => {
                                    const isAlreadyAdded = immediateGoals.some(g => g.id === goal.id || g.tempId === goal.id);

                                    return (
                                        <div
                                            key={goal.id}
                                            onClick={() => {
                                                if (!isAlreadyAdded) {
                                                    handleSelectExistingGoal(goal);
                                                    setShowSelectGoalModal(false);
                                                }
                                            }}
                                            style={{
                                                background: isAlreadyAdded ? '#2a2a2a' : '#1e1e1e',
                                                border: `2px solid ${isAlreadyAdded ? '#666' : '#9c27b0'}`,
                                                borderRadius: '6px',
                                                padding: '12px 16px',
                                                cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                                                opacity: isAlreadyAdded ? 0.5 : 1,
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isAlreadyAdded) {
                                                    e.currentTarget.style.borderColor = '#7b1fa2';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isAlreadyAdded) {
                                                    e.currentTarget.style.borderColor = '#9c27b0';
                                                }
                                            }}
                                        >
                                            <div style={{ fontWeight: 'bold', fontSize: '15px', color: '#9c27b0' }}>
                                                {goal.name}
                                                {isAlreadyAdded && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>(Already added)</span>}
                                            </div>
                                            {goal.description && (
                                                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                                    {goal.description}
                                                </div>
                                            )}
                                            {goal.deadline && (
                                                <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                                                    📅 {new Date(goal.deadline).toLocaleDateString()}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="actions" style={{ marginTop: '20px' }}>
                            <button type="button" onClick={() => setShowSelectGoalModal(false)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Log;
