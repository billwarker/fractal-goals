import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { queryKeys } from '../hooks/queryKeys';
import { getLocalISOString } from '../utils/dateUtils';
import { useCreateSessionPageData } from '../hooks/useCreateSessionPageData';
import notify from '../utils/notify';
import {
    ProgramSelector,
    SourceSelector,
    ProgramDayPicker,
    TemplatePicker,
    CreateSessionActions
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
    const queryClient = useQueryClient();
    // Selection state
    const [selectedProgram, setSelectedProgram] = useState(null);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [selectedProgramDay, setSelectedProgramDay] = useState(null);
    const [selectedProgramSession, setSelectedProgramSession] = useState(null);
    const [sessionSource, setSessionSource] = useState(null); // 'program' or 'template'

    // UI state
    const [creating, setCreating] = useState(false);
    const {
        templates,
        programDays,
        programsByName,
        loading,
    } = useCreateSessionPageData(rootId);

    useEffect(() => {
        if (!rootId) {
            navigate('/');
        }
    }, [rootId, navigate]);

    const programNames = Object.keys(programsByName);
    const defaultProgram = programNames.length === 1 ? programNames[0] : null;
    const defaultSessionSource = (() => {
        if (programNames.length === 1 && templates.length === 0) {
            return 'program';
        }
        if (programNames.length === 0 && templates.length > 0) {
            return 'template';
        }
        return null;
    })();
    const effectiveSelectedProgram = selectedProgram ?? defaultProgram;
    const effectiveSessionSource = sessionSource ?? defaultSessionSource;

    // Handler functions
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

    const handleCreateSession = async () => {
        if (!selectedTemplate) {
            notify.error('Please select a template or program day');
            return;
        }

        setCreating(true);

        try {
            const extractActivityId = (item) => {
                if (typeof item === 'string') return item;
                if (!item || typeof item !== 'object') return null;
                const direct =
                    item.activity_id ||
                    item.activity_definition_id ||
                    item.activityId ||
                    item.activityDefinitionId ||
                    item.definition_id ||
                    item.id;
                if (direct) return direct;
                if (item.activity && typeof item.activity === 'object') {
                    return item.activity.id || item.activity.activity_id || item.activity.activity_definition_id || null;
                }
                return null;
            };

            // Convert template sections to session sections
            const sectionsWithExercises = (selectedTemplate.template_data?.sections || []).map(section => {
                const templateItems = section.activities || section.exercises || [];
                const exercises = templateItems
                    .map((activity) => {
                        const activityId = extractActivityId(activity);
                        if (!activityId) return null;
                        const name = typeof activity === 'object' ? activity.name : null;
                        return {
                            type: 'activity',
                            name: name || 'Activity',
                            activity_id: activityId,
                            instance_id: crypto.randomUUID(),
                            completed: false,
                            notes: ''
                        };
                    })
                    .filter(Boolean);

                return {
                    ...section,
                    exercises,
                    estimated_duration_minutes: section.estimated_duration_minutes || section.duration_minutes
                };
            });

            const sessionStart = getLocalISOString();

            const sessionData = {
                name: selectedTemplate.name,
                description: selectedTemplate.description || '',
                template_id: selectedTemplate.id,
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
            const createdSession = response.data;
            const createdSessionId = createdSession.id;

            // Update the known session lists immediately after the create succeeds.
            queryClient.setQueryData(queryKeys.sessionsPaginated(rootId), (prev) => {
                if (!prev || !Array.isArray(prev.pages) || prev.pages.length === 0) return prev;
                const [firstPage, ...restPages] = prev.pages;
                const existing = (firstPage.sessions || []).some((session) => session.id === createdSession.id);
                if (existing) return prev;

                const updatedFirstPage = {
                    ...firstPage,
                    sessions: [createdSession, ...(firstPage.sessions || [])],
                    pagination: firstPage.pagination
                        ? {
                            ...firstPage.pagination,
                            total: typeof firstPage.pagination.total === 'number'
                                ? firstPage.pagination.total + 1
                                : firstPage.pagination.total
                        }
                        : firstPage.pagination
                };

                return {
                    ...prev,
                    pages: [updatedFirstPage, ...restPages]
                };
            });

            queryClient.setQueryData(queryKeys.sessions(rootId), (prev) => {
                if (!Array.isArray(prev)) return prev;
                if (prev.some((session) => session.id === createdSession.id)) return prev;
                return [createdSession, ...prev];
            });

            queryClient.setQueryData(queryKeys.sessionsAll(rootId), (prev) => {
                if (!Array.isArray(prev)) return prev;
                if (prev.some((session) => session.id === createdSession.id)) return prev;
                return [createdSession, ...prev];
            });

            queryClient.invalidateQueries({ queryKey: queryKeys.sessions(rootId), refetchType: 'inactive' });
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionsAll(rootId), refetchType: 'inactive' });
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionsPaginated(rootId), refetchType: 'inactive' });

            navigate(`/${rootId}/session/${createdSessionId}`);
        } catch (err) {
            console.error('Error creating session:', err);
            const errorMessage = err.response?.data?.error || err.message;
            notify.error('Error creating session: ' + errorMessage);
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
    const hasMultiplePrograms = programNames.length > 1;
    const hasSingleProgram = programNames.length === 1;
    const showSourceChoice = hasSingleProgram && hasTemplates;
    const showProgramChoice = hasMultiplePrograms;
    const currentProgramDays = effectiveSelectedProgram ? (programsByName[effectiveSelectedProgram]?.days || []) : [];

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
                        selectedProgram={effectiveSelectedProgram}
                        onSelectProgram={handleSelectProgram}
                        hasTemplates={hasTemplates}
                        sessionSource={effectiveSessionSource}
                        onSelectTemplateSource={() => handleSelectSource('template')}
                    />
                )}

                {/* Step 0b: Choose Session Source (if single program AND templates available) */}
                {showSourceChoice && (
                    <SourceSelector
                        sessionSource={effectiveSessionSource}
                        onSelectSource={handleSelectSource}
                        programName={effectiveSelectedProgram}
                    />
                )}

                {/* Step 1: Select Program Day */}
                {(effectiveSessionSource === 'program' || (hasProgramDays && !hasTemplates)) && (
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
                {(effectiveSessionSource === 'template' || (!hasProgramDays && hasTemplates)) && (
                    <TemplatePicker
                        templates={templates}
                        selectedTemplate={selectedTemplate}
                        rootId={rootId}
                        onSelectTemplate={handleSelectTemplate}
                    />
                )}

                {/* Step 3: Create Session */}
                <CreateSessionActions
                    selectedTemplate={selectedTemplate}
                    selectedProgramDay={selectedProgramDay}
                    creating={creating}
                    onCreateSession={handleCreateSession}
                />
            </div>
        </div>
    );
}

export default CreateSession;
