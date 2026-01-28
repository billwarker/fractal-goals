import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { fractalApi } from '../utils/api';
import GoalDetailModal from '../components/GoalDetailModal';
import { getLocalISOString } from '../utils/dateUtils';
import {
    ProgramSelector,
    SourceSelector,
    ProgramDayPicker,
    TemplatePicker,
    GoalAssociation,
    CreateSessionActions,
    SelectExistingGoalModal
} from '../components/createSession';
import '../App.css';

/**
 * Create Session Page
 * Enhanced flow: Select from program day OR select template → Associate with goal → Create session
 * 
 * Refactored to use focused sub-components for each step:
 * - ProgramSelector (Step 0a): Choose program when multiple available
 * - SourceSelector (Step 0b): Choose between program days vs templates  
 * - ProgramDayPicker (Step 1): Select program day and session
 * - TemplatePicker (Step 1): Select template directly
 * - GoalAssociation (Step 2): Associate with STGs and IGs
 * - CreateSessionActions (Step 3): Create button and summary
 */
function CreateSession() {
    const { rootId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Data state
    const [templates, setTemplates] = useState([]);
    const [goals, setGoals] = useState([]);
    const [programDays, setProgramDays] = useState([]);
    const [programsByName, setProgramsByName] = useState({});
    const [existingImmediateGoals, setExistingImmediateGoals] = useState([]);
    const [activityDefinitions, setActivityDefinitions] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);

    // Selection state
    const [selectedProgram, setSelectedProgram] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [selectedProgramDay, setSelectedProgramDay] = useState(null);
    const [selectedProgramSession, setSelectedProgramSession] = useState(null);
    const [selectedGoalIds, setSelectedGoalIds] = useState([]);
    const [selectedImmediateGoalIds, setSelectedImmediateGoalIds] = useState([]);
    const [immediateGoals, setImmediateGoals] = useState([]); // New IGs to create
    const [sessionSource, setSessionSource] = useState(null); // 'program' or 'template'

    // Modal state
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [showSelectGoalModal, setShowSelectGoalModal] = useState(false);
    const [creatingGoalForSTG, setCreatingGoalForSTG] = useState(null);

    // UI state
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
            const [templatesRes, goalsRes, programDaysRes, activitiesRes, groupsRes] = await Promise.all([
                fractalApi.getSessionTemplates(rootId),
                fractalApi.getGoalsForSelection(rootId),
                fractalApi.getActiveProgramDays(rootId),
                fractalApi.getActivities(rootId),
                fractalApi.getActivityGroups(rootId)
            ]);

            setTemplates(templatesRes.data);
            const allProgramDays = programDaysRes.data || [];

            // Deduplicate program days to avoid showing multiple instances of the same training day
            const seenKeys = new Set();
            const uniqueProgramDays = allProgramDays
                .sort((a, b) => {
                    // Prioritize template days (no specific date)
                    if (!a.date && b.date) return -1;
                    if (a.date && !b.date) return 1;
                    return 0;
                })
                .filter(day => {
                    const templateIds = (day.sessions || []).map(s => s.template_id).sort().join(',');
                    const key = `${day.program_id}-${day.block_id}-${day.day_name}-${templateIds}`;
                    if (seenKeys.has(key)) return false;
                    seenKeys.add(key);
                    return true;
                });

            setProgramDays(uniqueProgramDays);

            // Group program days by program name
            const grouped = {};
            uniqueProgramDays.forEach(day => {
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

            // Set Short Term Goals from optimized endpoint
            const shortTermGoals = goalsRes.data || [];
            setGoals(shortTermGoals);

            // Extract all immediate goals for "Select Existing" modal
            const allImmediateGoals = shortTermGoals.flatMap(stg =>
                (stg.immediateGoals || []).map(ig => ({
                    ...ig,
                    parent_id: stg.id
                }))
            );
            setExistingImmediateGoals(allImmediateGoals);
            setActivityDefinitions(activitiesRes.data || []);
            setActivityGroups(groupsRes.data || []);

            // Pre-select goal from URL if provided
            const goalIdFromUrl = searchParams.get('goalId');
            if (goalIdFromUrl && shortTermGoals.some(g => g.id === goalIdFromUrl)) {
                setSelectedGoalIds([goalIdFromUrl]);
            }

            // Auto-select session source and program if only one option available
            const programNames = Object.keys(grouped);
            if (programNames.length === 1 && templatesRes.data.length === 0) {
                setSessionSource('program');
                setSelectedProgram(programNames[0]);
            } else if (programNames.length === 1 && templatesRes.data.length > 0) {
                setSelectedProgram(programNames[0]);
            } else if (programNames.length === 0 && templatesRes.data.length > 0) {
                setSessionSource('template');
            }

            setLoading(false);
        } catch (err) {
            console.error("Failed to fetch data", err);
            setLoading(false);
        }
    };

    // Handler functions
    const handleToggleGoal = (goalId) => {
        setSelectedGoalIds(prev =>
            prev.includes(goalId)
                ? prev.filter(id => id !== goalId)
                : [...prev, goalId]
        );
    };

    const handleToggleImmediateGoal = (goalId) => {
        setSelectedImmediateGoalIds(prev =>
            prev.includes(goalId)
                ? prev.filter(id => id !== goalId)
                : [...prev, goalId]
        );
    };

    const handleSelectProgramDay = (programDay) => {
        setSelectedProgramDay(programDay);
        setSelectedProgramSession(null);
        setSelectedTemplate(null);

        // Auto-select if single session
        if (programDay.sessions?.length === 1) {
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
        setSelectedTemplate(null);
        setSelectedProgramDay(null);
        setSelectedProgramSession(null);
        setSessionSource(source);
    };

    const handleSelectProgram = (programName) => {
        setSelectedProgramDay(null);
        setSelectedProgramSession(null);
        setSelectedTemplate(null);
        setSelectedProgram(programName);
        setSessionSource('program');
    };

    const handleSelectTemplate = (template) => {
        setSelectedTemplate(template);
        setSelectedProgramDay(null);
        setSelectedProgramSession(null);
    };

    const handleCreateImmediateGoal = (goalData) => {
        const newGoal = {
            ...goalData,
            tempId: crypto.randomUUID(),
            type: 'ImmediateGoal',
            isNew: true,
            parent_id: creatingGoalForSTG?.id || null
        };
        setImmediateGoals(prev => [...prev, newGoal]);
        setShowGoalModal(false);
        setCreatingGoalForSTG(null);
    };

    const handleRemoveImmediateGoal = (tempId) => {
        setImmediateGoals(prev => prev.filter(g => g.tempId !== tempId));
    };

    const handleOpenCreateGoalModal = (stg) => {
        setCreatingGoalForSTG(stg);
        setShowGoalModal(true);
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
            // Convert template sections to session sections
            const sectionsWithExercises = (selectedTemplate.template_data?.sections || []).map(section => {
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

            const sessionStart = getLocalISOString();

            const sessionData = {
                name: selectedTemplate.name,
                description: selectedTemplate.description || '',
                parent_ids: selectedGoalIds,
                immediate_goal_ids: selectedImmediateGoalIds,
                duration_minutes: selectedTemplate.template_data?.total_duration_minutes || 0,
                session_start: sessionStart,
                session_data: {
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
                }
            };

            console.log('Creating session with rootId:', rootId);
            console.log('Session Payload:', sessionData);

            const response = await fractalApi.createSession(rootId, sessionData);
            const createdSessionId = response.data.id;

            // Create NEW immediate goals in parallel
            const newImmediateGoals = immediateGoals.filter(g => g.isNew);
            if (newImmediateGoals.length > 0) {
                await Promise.all(newImmediateGoals.map(async (goal) => {
                    const createdGoal = await fractalApi.createGoal(rootId, {
                        name: goal.name,
                        description: goal.description || '',
                        deadline: goal.deadline || null,
                        type: 'ImmediateGoal',
                        parent_id: goal.parent_id,
                        targets: goal.targets || []
                    });

                    if (createdGoal.data?.id) {
                        await fractalApi.addSessionGoal(rootId, createdSessionId, createdGoal.data.id, 'immediate');
                    }
                }));
            }

            navigate(`/${rootId}/session/${createdSessionId}`);
        } catch (err) {
            console.error('Error creating session:', err);
            const errorMessage = err.response?.data?.error || err.message;
            alert('Error creating session: ' + errorMessage);
            setCreating(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="page-container">
                <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                    <p>Loading...</p>
                </div>
            </div>
        );
    }

    // Derived state for conditional rendering
    const hasProgramDays = programDays.length > 0;
    const hasTemplates = templates.length > 0;
    const programNames = Object.keys(programsByName);
    const hasMultiplePrograms = programNames.length > 1;
    const hasSingleProgram = programNames.length === 1;
    const showSourceChoice = hasSingleProgram && hasTemplates;
    const showProgramChoice = hasMultiplePrograms;
    const currentProgramDays = selectedProgram ? (programsByName[selectedProgram]?.days || []) : [];

    return (
        <div className="page-container">
            <h1 style={{ fontWeight: 300, borderBottom: '1px solid var(--color-border)', paddingBottom: '15px', marginBottom: '30px', color: 'var(--color-text-primary)' }}>
                Create Session
            </h1>

            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                {/* Step 0a: Choose Program (if multiple programs available) */}
                {showProgramChoice && (
                    <ProgramSelector
                        programsByName={programsByName}
                        selectedProgram={selectedProgram}
                        onSelectProgram={handleSelectProgram}
                        hasTemplates={hasTemplates}
                        sessionSource={sessionSource}
                        onSelectTemplateSource={() => handleSelectSource('template')}
                    />
                )}

                {/* Step 0b: Choose Session Source (if single program AND templates available) */}
                {showSourceChoice && (
                    <SourceSelector
                        sessionSource={sessionSource}
                        onSelectSource={handleSelectSource}
                    />
                )}

                {/* Step 1: Select Program Day */}
                {(sessionSource === 'program' || (hasProgramDays && !hasTemplates)) && (
                    <ProgramDayPicker
                        programDays={currentProgramDays}
                        selectedProgramDay={selectedProgramDay}
                        selectedProgramSession={selectedProgramSession}
                        hasTemplates={hasTemplates}
                        onSelectProgramDay={handleSelectProgramDay}
                        onSelectProgramSession={handleSelectProgramSession}
                        onSwitchToTemplate={() => setSessionSource('template')}
                    />
                )}

                {/* Step 1: Select Template */}
                {(sessionSource === 'template' || (!hasProgramDays && hasTemplates)) && (
                    <TemplatePicker
                        templates={templates}
                        selectedTemplate={selectedTemplate}
                        rootId={rootId}
                        onSelectTemplate={handleSelectTemplate}
                    />
                )}

                {/* Step 2: Associate with Goals */}
                <GoalAssociation
                    goals={goals}
                    selectedGoalIds={selectedGoalIds}
                    selectedImmediateGoalIds={selectedImmediateGoalIds}
                    immediateGoals={immediateGoals}
                    onToggleGoal={handleToggleGoal}
                    onToggleImmediateGoal={handleToggleImmediateGoal}
                    onRemoveImmediateGoal={handleRemoveImmediateGoal}
                    onCreateImmediateGoal={handleOpenCreateGoalModal}
                />

                {/* Step 3: Create Session */}
                <CreateSessionActions
                    selectedTemplate={selectedTemplate}
                    selectedProgramDay={selectedProgramDay}
                    selectedGoalIds={selectedGoalIds}
                    immediateGoals={immediateGoals}
                    creating={creating}
                    onCreateSession={handleCreateSession}
                />
            </div>

            {/* Goal Creation Modal */}
            <GoalDetailModal
                isOpen={showGoalModal}
                onClose={() => {
                    setShowGoalModal(false);
                    setCreatingGoalForSTG(null);
                }}
                mode="create"
                onCreate={handleCreateImmediateGoal}
                parentGoal={creatingGoalForSTG ? {
                    id: creatingGoalForSTG.id,
                    name: creatingGoalForSTG.name,
                    type: 'ShortTermGoal',
                    attributes: { type: 'ShortTermGoal' }
                } : null}
                activityDefinitions={activityDefinitions}
                activityGroups={activityGroups}
                rootId={rootId}
            />

            {/* Select Existing Goal Modal */}
            <SelectExistingGoalModal
                isOpen={showSelectGoalModal}
                existingImmediateGoals={existingImmediateGoals}
                alreadyAddedGoalIds={immediateGoals.map(g => g.id || g.tempId)}
                onClose={() => setShowSelectGoalModal(false)}
                onConfirm={(selectedIds) => {
                    const goalsToAdd = existingImmediateGoals.filter(g => selectedIds.includes(g.id));
                    goalsToAdd.forEach(goal => {
                        if (!immediateGoals.some(g => g.id === goal.id || g.tempId === goal.id)) {
                            setImmediateGoals(prev => [...prev, { ...goal, tempId: goal.id, isNew: false }]);
                        }
                    });
                    setShowSelectGoalModal(false);
                }}
            />
        </div>
    );
}

export default CreateSession;
