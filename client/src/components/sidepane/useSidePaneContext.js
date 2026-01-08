/**
 * useSidePaneContext - Hook for pages to set their SidePane context
 * 
 * Usage:
 * useSidePaneContext({
 *     type: 'session',
 *     id: sessionId,
 *     name: session.name,
 *     rootId: rootId,
 *     entityType: 'session',
 *     entityId: sessionId,
 *     availableModes: ['notes', 'details', 'related'],
 *     details: { ... }
 * });
 */

import { useEffect } from 'react';
import { useSidePane } from './SidePaneContext';

export const useSidePaneContext = (context) => {
    const { setPageContext } = useSidePane();

    useEffect(() => {
        if (context) {
            setPageContext(context);
        }

        return () => {
            // Context is managed per-page, clearing happens when new context is set
        };
    }, [context?.id, context?.type]); // Only re-run when ID or type changes
};

/**
 * Build a session context object
 */
export const buildSessionContext = (session, rootId) => {
    if (!session) return null;

    return {
        type: 'session',
        id: session.id,
        name: session.name || 'Session',
        rootId: rootId,
        entityType: 'session',
        entityId: session.id,
        includeChildNotes: true,
        availableModes: ['notes', 'details', 'related', 'history'],
        details: {
            startTime: session.session_start,
            endTime: session.session_end,
            duration: session.total_duration_seconds,
            template: session.template?.name,
            activitiesCount: session.activity_instances?.length || 0,
            createdAt: session.created_at,
            updatedAt: session.updated_at,
            completedAt: session.completed_at,
        },
        relatedEntities: [
            {
                type: 'goals',
                label: 'Short Term Goals',
                items: session.short_term_goals || []
            },
            {
                type: 'goals',
                label: 'Immediate Goals',
                items: session.immediate_goals || []
            }
        ],
    };
};

/**
 * Build a goal context object
 */
export const buildGoalContext = (goal, rootId) => {
    if (!goal) return null;

    const attributes = goal.attributes || goal;

    return {
        type: 'goal',
        id: goal.id,
        name: goal.name,
        rootId: rootId,
        entityType: 'goal',
        entityId: goal.id,
        includeChildNotes: false, // Goals show their own notes only
        availableModes: ['notes', 'details', 'related', 'history'],
        details: {
            type: attributes.type,
            description: goal.description,
            deadline: attributes.deadline,
            completed: attributes.completed,
            completedAt: attributes.completed_at,
            childCount: goal.children?.length || 0,
            targets: attributes.targets || [],
            createdAt: attributes.created_at,
            updatedAt: attributes.updated_at,
        },
    };
};

/**
 * Build an activity instance context object
 */
export const buildActivityInstanceContext = (instance, rootId, sessionId) => {
    if (!instance) return null;

    return {
        type: 'activity_instance',
        id: instance.id,
        name: instance.definition_name || instance.name || 'Activity',
        rootId: rootId,
        entityType: 'activity_instance',
        entityId: instance.id,
        includeChildNotes: false,
        availableModes: ['notes', 'details', 'analytics', 'history'],
        details: {
            duration: instance.duration_seconds,
            sets: instance.sets || [],
            metrics: instance.metric_values || [],
            completed: instance.completed,
            createdAt: instance.created_at,
        },
        analyticsConfig: {
            type: 'previous_instances',
            activityDefinitionId: instance.activity_definition_id,
            currentInstanceId: instance.id,
            limit: 10
        }
    };
};

/**
 * Build a program context object
 */
export const buildProgramContext = (program, rootId) => {
    if (!program) return null;

    return {
        type: 'program',
        id: program.id,
        name: program.name,
        rootId: rootId,
        entityType: 'program',
        entityId: program.id,
        includeChildNotes: true,
        availableModes: ['notes', 'details', 'analytics', 'history'],
        details: {
            startDate: program.start_date,
            endDate: program.end_date,
            isActive: program.is_active,
            blocksCount: program.blocks?.length || 0,
            createdAt: program.created_at,
            updatedAt: program.updated_at,
        },
        analyticsConfig: {
            type: 'weekly_progress',
            programId: program.id
        }
    };
};

/**
 * Build a program day context object
 */
export const buildProgramDayContext = (day, program, rootId) => {
    if (!day) return null;

    return {
        type: 'program_day',
        id: day.id,
        name: day.name || `Day ${day.day_number}`,
        rootId: rootId,
        entityType: 'program_day',
        entityId: day.id,
        includeChildNotes: true,
        availableModes: ['notes', 'details', 'related', 'history'],
        details: {
            date: day.date,
            name: day.name,
            isCompleted: day.is_completed,
            templatesCount: day.templates?.length || 0,
        },
        relatedEntities: [
            {
                type: 'sessions',
                label: 'Completed Sessions',
                items: day.completed_sessions || []
            }
        ],
    };
};

/**
 * Build a page-level context (for pages without specific entity focus)
 */
export const buildPageContext = (pageName, rootId, availableModes = ['notes']) => {
    return {
        type: 'page',
        id: `page-${pageName}`,
        name: pageName,
        rootId: rootId,
        entityType: null,
        entityId: null,
        includeChildNotes: false,
        availableModes: availableModes,
    };
};

export default useSidePaneContext;
