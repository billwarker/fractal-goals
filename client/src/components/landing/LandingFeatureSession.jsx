import React, { useMemo, useState } from 'react';
import { QueuedQuickSessionProvider } from '../../contexts/ActiveSessionContext';
import useSessionSidePaneViewModel from '../../hooks/useSessionSidePaneViewModel';
import { flattenGoalTree } from '../../utils/goalNodeModel';
import SessionSection from '../sessionDetail/SessionSection';
import SessionDetailPaneLayout from '../sessionDetail/SessionDetailPaneLayout';
import sessionDetailStyles from '../../pages/SessionDetail.module.css';
import styles from './LandingFeaturesSection.module.css';

function ensureAttributes(session) {
    const attributes = session?.attributes || {};
    return {
        ...session,
        attributes: {
            ...attributes,
            completed: session?.completed ?? attributes.completed ?? true,
            session_start: attributes.session_start || session?.session_start,
            session_end: attributes.session_end || session?.session_end,
        },
    };
}

function buildSections(session) {
    const sessionData = session?.attributes?.session_data || {};
    const sections = Array.isArray(sessionData.sections) ? sessionData.sections : [];
    const instances = Array.isArray(session?.activity_instances) ? session.activity_instances : [];

    if (sections.length > 0) {
        return sections.map((section, index) => ({
            ...section,
            id: section.id || `landing-section-${index}`,
            name: section.name || `Section ${index + 1}`,
            activity_ids: Array.isArray(section.activity_ids) ? section.activity_ids : [],
        }));
    }

    return [{
        id: 'landing-session-work',
        name: 'Exercises',
        activity_ids: instances.map((instance) => instance.id).filter(Boolean),
    }];
}

function getNoteText(note) {
    if (!note) return '';
    if (typeof note === 'string') return note.trim();
    if (typeof note.content === 'string') return note.content.trim();
    if (typeof note.text === 'string') return note.text.trim();
    if (typeof note.body === 'string') return note.body.trim();
    return '';
}

function normalizeNotes(session) {
    const sessionData = session?.attributes?.session_data || {};
    const noteSource = sessionData.notes ?? session?.notes ?? [];
    const notes = Array.isArray(noteSource) ? noteSource : [noteSource];
    return notes
        .map((note, index) => {
            const content = getNoteText(note);
            if (!content) return null;
            if (typeof note === 'object' && note !== null) {
                return {
                    ...note,
                    id: note.id || `landing-note-${index}`,
                    content,
                    context_type: note.context_type || 'session',
                    context_id: note.context_id || session?.id,
                    session_id: note.session_id || session?.id,
                };
            }
            return {
                id: `landing-note-${index}`,
                content,
                context_type: 'session',
                context_id: session?.id,
                session_id: session?.id,
            };
        })
        .filter(Boolean);
}

function buildActivityGoalMap(activityDefinitions, goalTree) {
    const goalIdsByActivity = {};
    const ensureSet = (activityId) => {
        const key = String(activityId);
        if (!goalIdsByActivity[key]) goalIdsByActivity[key] = new Set();
        return goalIdsByActivity[key];
    };

    (activityDefinitions || []).forEach((activity) => {
        (activity.associated_goal_ids || []).forEach((goalId) => {
            ensureSet(activity.id).add(String(goalId));
        });
    });

    flattenGoalTree(goalTree).forEach((goal) => {
        const goalId = String(goal.id);
        (goal.attributes?.associated_activity_ids || []).forEach((activityId) => {
            ensureSet(activityId).add(goalId);
        });
        (goal.attributes?.associated_activities || []).forEach((activity) => {
            ensureSet(activity.id).add(goalId);
        });
    });

    return Object.fromEntries(
        Object.entries(goalIdsByActivity).map(([activityId, goalIds]) => [activityId, [...goalIds]])
    );
}

function buildSessionGoalsView(example, session, activityDefinitions) {
    const sessionGoalIds = new Set();
    const activityGoalMap = buildActivityGoalMap(activityDefinitions, example.tree);

    Object.values(activityGoalMap).forEach((goalIds) => {
        goalIds.forEach((goalId) => sessionGoalIds.add(String(goalId)));
    });
    (session.completed_goals || []).forEach((goalId) => sessionGoalIds.add(String(goalId)));

    return {
        goal_tree: example.tree,
        session_goal_ids: [...sessionGoalIds],
        activity_goal_ids_by_activity: activityGoalMap,
    };
}

function LandingSessionScreen({
    sessionName,
    sections,
    notes,
    sidePaneModel,
    selectedActivity,
    setSelectedActivity,
}) {
    return (
        <div
            className={`${sessionDetailStyles.sessionDetailContainer} ${styles.landingSessionScreen}`}
            aria-label={`${sessionName || 'Session'} detail preview`}
        >
            <div className={sessionDetailStyles.sessionMainContent}>
                <div className={sessionDetailStyles.sessionSectionsList}>
                    {sections.map((section, sectionIndex) => (
                        <SessionSection
                            key={section.id || sectionIndex}
                            section={section}
                            sectionIndex={sectionIndex}
                            onFocusActivity={(activity) => setSelectedActivity(activity)}
                            selectedActivityId={selectedActivity?.id}
                            onOpenActivityBuilder={() => {}}
                            onNoteCreated={() => {}}
                            allNotes={notes}
                            onAddNote={async () => null}
                            onUpdateNote={async () => null}
                            onDeleteNote={async () => null}
                            onOpenGoals={() => {}}
                        />
                    ))}
                </div>
            </div>
            <SessionDetailPaneLayout
                isMobile={false}
                isMobilePaneOpen={false}
                onCloseMobilePane={() => {}}
                selectedModeLabel="Details"
                sidePaneModel={sidePaneModel}
            />
        </div>
    );
}

function LandingSessionScreenWithModel({ sessionName, sections, notes }) {
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [sidePaneMode, setSidePaneMode] = useState('details');
    const sidePaneModel = useSessionSidePaneViewModel({
        selectedActivity,
        onNoteAdded: () => {},
        onGoalClick: () => {},
        onGoalCreated: () => {},
        notes,
        previousSessionNotes: [],
        addNote: async () => null,
        updateNote: async () => null,
        deleteNote: async () => null,
        pinNote: async () => null,
        unpinNote: async () => null,
        onOptions: () => {},
        mode: sidePaneMode,
        onModeChange: setSidePaneMode,
    });

    return (
            <LandingSessionScreen
                sessionName={sessionName}
                sections={sections}
                notes={notes}
            sidePaneModel={sidePaneModel}
            selectedActivity={selectedActivity}
            setSelectedActivity={setSelectedActivity}
        />
    );
}

export default function LandingFeatureSession({ example, session }) {
    const activityDefinitions = useMemo(() => example.activityDefinitions || [], [example.activityDefinitions]);
    const sessionWithAttributes = useMemo(() => (session ? ensureAttributes(session) : null), [session]);
    const sections = useMemo(() => buildSections(sessionWithAttributes), [sessionWithAttributes]);
    const notes = useMemo(() => normalizeNotes(sessionWithAttributes), [sessionWithAttributes]);
    const draftSession = useMemo(() => {
        if (!sessionWithAttributes) return null;
        const sessionGoalsView = buildSessionGoalsView(example, sessionWithAttributes, activityDefinitions);
        return {
            session: sessionWithAttributes,
            localSessionData: {
                ...(sessionWithAttributes.attributes?.session_data || {}),
                sections,
                activity_ids: sections.flatMap((section) => section.activity_ids || []),
            },
            activityInstances: sessionWithAttributes.activity_instances || [],
            sessionGoalsView,
        };
    }, [activityDefinitions, example, sections, sessionWithAttributes]);

    if (!sessionWithAttributes || !draftSession) {
        return <div className={styles.emptyState}>Publish an example session to preview the training log.</div>;
    }
    const sessionName = sessionWithAttributes.name
        || sessionWithAttributes.attributes?.session_data?.template_name
        || 'Session';

    return (
        <QueuedQuickSessionProvider
            rootId={null}
            draftSession={draftSession}
            activityDefinitions={activityDefinitions}
            activityGroups={example.activityGroups || []}
            setDraftSession={() => {}}
        >
            <LandingSessionScreenWithModel sessionName={sessionName} sections={sections} notes={notes} />
        </QueuedQuickSessionProvider>
    );
}
