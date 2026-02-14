/**
 * API Helper - Centralized API calls for Fractal Goals
 * 
 * This module provides a clean interface for making API calls to the Flask backend.
 * All endpoints are organized by scope (global vs fractal-scoped).
 */

import axios from 'axios';

// Use environment variable for API base URL, fallback to localhost:8001
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

// Add interceptor to include token in all requests
axios.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

/**
 * Authentication API endpoints
 */
export const authApi = {
    signup: (data) => axios.post(`${API_BASE}/auth/signup`, data),
    login: (data) => axios.post(`${API_BASE}/auth/login`, data),
    getMe: () => axios.get(`${API_BASE}/auth/me`),
    updatePreferences: (data) => axios.patch(`${API_BASE}/auth/preferences`, data),
    updatePassword: (data) => axios.put(`${API_BASE}/auth/account/password`, data),
    updateEmail: (data) => axios.put(`${API_BASE}/auth/account/email`, data),
    deleteAccount: (data) => axios.delete(`${API_BASE}/auth/account`, { data }), // DELETE requests often need data in config
};

/**
 * Global API endpoints (not scoped to a specific fractal)
 */
export const globalApi = {
    /**
     * Get all fractals for the selection page
     */
    getAllFractals: () => axios.get(`${API_BASE}/fractals`),

    /**
     * Create a new fractal (root goal)
     * @param {Object} data - {name, description}
     */
    createFractal: (data) => axios.post(`${API_BASE}/fractals`, data),

    /**
     * Delete an entire fractal and all its data
     * @param {string} rootId - ID of the fractal to delete
     */
    deleteFractal: (rootId) => axios.delete(`${API_BASE}/fractals/${rootId}`),
};

/**
 * Fractal-scoped API endpoints (all data filtered by root_id)
 */
export const fractalApi = {
    /**
     * Get the complete goal tree for a fractal
     * @param {string} rootId - ID of the fractal
     */
    getGoals: (rootId) => axios.get(`${API_BASE}/${rootId}/goals`),

    /**
     * Get active ShortTermGoals and ImmediateGoals for selection
     * Optimized endpoint that avoids fetching the full tree
     * @param {string} rootId - ID of the fractal
     */
    getGoalsForSelection: (rootId) => axios.get(`${API_BASE}/${rootId}/goals/selection`),

    /**
     * Get a specific goal by ID
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal to fetch
     */
    getGoal: (rootId, goalId) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}`),

    /**
     * Create a new goal within a fractal
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {name, description, type, parent_id, deadline}
     */
    createGoal: (rootId, data) => axios.post(`${API_BASE}/${rootId}/goals`, data),

    /**
     * Update a goal within a fractal
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal to update
     * @param {Object} data - {name, description, deadline}
     */
    updateGoal: (rootId, goalId, data) =>
        axios.put(`${API_BASE}/${rootId}/goals/${goalId}`, data),

    /**
     * Delete a goal within a fractal
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal to delete
     */
    deleteGoal: (rootId, goalId) =>
        axios.delete(`${API_BASE}/${rootId}/goals/${goalId}`),

    /**
     * Toggle goal completion status
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal
     * @param {boolean} completed - New completion status
     */
    toggleGoalCompletion: (rootId, goalId, completed) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/complete`, { completed }),

    /**
     * Evaluate goal targets against a session's activity instances
     * Called when a session is completed to check and persist target achievements
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal
     * @param {string} sessionId - ID of the session to evaluate against
     */
    evaluateGoalTargets: (rootId, goalId, sessionId) =>
        axios.post(`${API_BASE}/${rootId}/goals/${goalId}/evaluate-targets`, { session_id: sessionId }),

    /**
     * Get goal analytics data for a fractal
     * @param {string} rootId - ID of the fractal
     */
    getGoalAnalytics: (rootId) => axios.get(`${API_BASE}/${rootId}/goals/analytics`),

    /**
     * Get all practice sessions for a fractal with pagination
     * @param {string} rootId - ID of the fractal
     * @param {Object} options - {limit, offset} pagination options
     */
    getSessions: (rootId, options = {}) => {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);
        const queryString = params.toString();
        return axios.get(`${API_BASE}/${rootId}/sessions${queryString ? '?' + queryString : ''}`);
    },

    /**
     * Create a new practice session within a fractal
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {parent_ids, immediate_goals, description}
     */
    createSession: (rootId, data) => axios.post(`${API_BASE}/${rootId}/sessions`, data),

    /**
     * Update a practice session
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session to update
     * @param {Object} data - {name, description}
     */
    updateSession: (rootId, sessionId, data) =>
        axios.put(`${API_BASE}/${rootId}/sessions/${sessionId}`, data),

    /**
     * Delete a practice session
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session to delete
     */
    deleteSession: (rootId, sessionId) =>
        axios.delete(`${API_BASE}/${rootId}/sessions/${sessionId}`),

    /**
     * Add a goal association to a session
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session
     * @param {string} goalId - ID of the goal to associate
     * @param {string} goalType - 'short_term' or 'immediate'
     */
    addSessionGoal: (rootId, sessionId, goalId, goalType = 'immediate') =>
        axios.post(`${API_BASE}/${rootId}/sessions/${sessionId}/goals`, { goal_id: goalId, goal_type: goalType }),

    /**
     * Get all micro goals linked to a session, including their nano children
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session
     */
    getSessionMicroGoals: (rootId, sessionId) =>
        axios.get(`${API_BASE}/fractal/${rootId}/sessions/${sessionId}/micro-goals`),


    // ========== Session Activity Instances (Database-Only Architecture) ==========

    /**
     * Get all activity instances for a session
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session
     */
    getSessionActivities: (rootId, sessionId) =>
        axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}/activities`),

    /**
     * Add an activity instance to a session
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session
     * @param {Object} data - {activity_definition_id, instance_id (optional)}
     */
    addActivityToSession: (rootId, sessionId, data) =>
        axios.post(`${API_BASE}/${rootId}/sessions/${sessionId}/activities`, data),

    /**
     * Remove an activity instance from a session
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session
     * @param {string} instanceId - ID of the activity instance
     */
    removeActivityFromSession: (rootId, sessionId, instanceId) =>
        axios.delete(`${API_BASE}/${rootId}/sessions/${sessionId}/activities/${instanceId}`),

    /**
     * Update metric values for an activity instance
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session
     * @param {string} instanceId - ID of the activity instance
     * @param {Object} data - {metrics: [{metric_id, split_id, value}]}
     */
    updateActivityMetrics: (rootId, sessionId, instanceId, data) =>
        axios.put(`${API_BASE}/${rootId}/sessions/${sessionId}/activities/${instanceId}/metrics`, data),

    // ========== Session Templates ==========

    /**
     * Get all session templates for a fractal
     * @param {string} rootId - ID of the fractal
     */
    getSessionTemplates: (rootId) => axios.get(`${API_BASE}/${rootId}/session-templates`),

    /**
     * Get a specific session template
     * @param {string} rootId - ID of the fractal
     * @param {string} templateId - ID of the template
     */
    getSessionTemplate: (rootId, templateId) =>
        axios.get(`${API_BASE}/${rootId}/session-templates/${templateId}`),

    /**
     * Create a new session template
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {name, description, template_data}
     */
    createSessionTemplate: (rootId, data) =>
        axios.post(`${API_BASE}/${rootId}/session-templates`, data),

    /**
     * Update a session template
     * @param {string} rootId - ID of the fractal
     * @param {string} templateId - ID of the template
     * @param {Object} data - {name, description, template_data}
     */
    updateSessionTemplate: (rootId, templateId, data) =>
        axios.put(`${API_BASE}/${rootId}/session-templates/${templateId}`, data),

    /**
     * Delete a session template
     * @param {string} rootId - ID of the fractal
     * @param {string} templateId - ID of the template to delete
     */
    deleteSessionTemplate: (rootId, templateId) =>
        axios.delete(`${API_BASE}/${rootId}/session-templates/${templateId}`),

    // ========== Activities & Metrics ==========

    /**
     * Get all activity groups for a fractal
     * @param {string} rootId - ID of the fractal
     */
    getActivityGroups: (rootId) => axios.get(`${API_BASE}/${rootId}/activity-groups`),

    /**
     * Create a new activity group
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {name, description}
     */
    createActivityGroup: (rootId, data) => axios.post(`${API_BASE}/${rootId}/activity-groups`, data),

    /**
     * Update an activity group
     * @param {string} rootId - ID of the fractal
     * @param {string} groupId - ID of the group
     * @param {Object} data - {name, description}
     */
    updateActivityGroup: (rootId, groupId, data) =>
        axios.put(`${API_BASE}/${rootId}/activity-groups/${groupId}`, data),

    /**
     * Set goals associated with an activity group (replaces existing)
     * @param {string} rootId - ID of the fractal
     * @param {string} groupId - ID of the group
     * @param {Array<string>} goalIds - Array of goal IDs
     */
    setActivityGroupGoals: (rootId, groupId, goalIds) =>
        axios.post(`${API_BASE}/${rootId}/activity-groups/${groupId}/goals`, { goal_ids: goalIds }), // Note: backend expects { goal_ids: [...] }


    /**
     * Reorder activity groups
     * @param {string} rootId - ID of the fractal
     * @param {Array<string>} groupIds - List of group IDs in order
     */
    reorderActivityGroups: (rootId, groupIds) =>
        axios.put(`${API_BASE}/${rootId}/activity-groups/reorder`, { group_ids: groupIds }),

    /**
     * Delete an activity group
     * @param {string} rootId - ID of the fractal
     * @param {string} groupId - ID of the group
     */
    deleteActivityGroup: (rootId, groupId) =>
        axios.delete(`${API_BASE}/${rootId}/activity-groups/${groupId}`),

    /**
     * Get all activity definitions for a fractal
     * @param {string} rootId - ID of the fractal
     */
    getActivities: (rootId) => axios.get(`${API_BASE}/${rootId}/activities`),

    /**
     * Create a new activity definition
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {name, description, metrics: [{name, unit}]}
     */
    createActivity: (rootId, data) => axios.post(`${API_BASE}/${rootId}/activities`, data),

    /**
     * Update an activity definition
     * @param {string} rootId - ID of the fractal
     * @param {string} activityId - ID of the activity
     * @param {Object} data - {name, description, metrics: [{name, unit}], has_sets, has_metrics}
     */
    updateActivity: (rootId, activityId, data) =>
        axios.put(`${API_BASE}/${rootId}/activities/${activityId}`, data),

    /**
     * Delete an activity definition
     * @param {string} rootId - ID of the fractal
     * @param {string} activityId - ID of the activity
     */
    deleteActivity: (rootId, activityId) => axios.delete(`${API_BASE}/${rootId}/activities/${activityId}`),

    // ========== Activity-Goal Associations (SMART Goals) ==========

    /**
     * Get all goals associated with an activity
     * @param {string} rootId - ID of the fractal
     * @param {string} activityId - ID of the activity
     */
    getActivityGoals: (rootId, activityId) =>
        axios.get(`${API_BASE}/${rootId}/activities/${activityId}/goals`),

    /**
     * Set goals associated with an activity (replaces existing)
     * @param {string} rootId - ID of the fractal
     * @param {string} activityId - ID of the activity
     * @param {Array<string>} goalIds - Array of goal IDs to associate
     */
    setActivityGoals: (rootId, activityId, goalIds) =>
        axios.post(`${API_BASE}/${rootId}/activities/${activityId}/goals`, { goal_ids: goalIds }),

    /**
     * Remove a goal association from an activity
     * @param {string} rootId - ID of the fractal
     * @param {string} activityId - ID of the activity
     * @param {string} goalId - ID of the goal to remove
     */
    removeActivityGoal: (rootId, activityId, goalId) =>
        axios.delete(`${API_BASE}/${rootId}/activities/${activityId}/goals/${goalId}`),

    /**
     * Get all activities associated with a goal
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal
     */
    getGoalActivities: (rootId, goalId) =>
        axios.get(`${API_BASE}/${rootId}/goals/${goalId}/activities`),

    /**
     * Get all activity groups linked to a goal (entire group inclusion)
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal
     */
    getGoalActivityGroups: (rootId, goalId) =>
        axios.get(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups`),

    /**
     * Get all metrics associated with a goal
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal
     */
    getGoalMetrics: (goalId) =>
        axios.get(`${API_BASE}/goals/${goalId}/metrics`),

    /**
     * Get daily duration metrics for a goal (recursive)
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal
     */
    getGoalDailyDurations: (goalId) =>
        axios.get(`${API_BASE}/goals/${goalId}/metrics/daily-durations`),

    /**
     * Link an activity group to a goal (includes all current and future activities in the group)
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal
     * @param {string} groupId - ID of the activity group
     */
    linkGoalActivityGroup: (rootId, goalId, groupId) =>
        axios.post(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups/${groupId}`),

    /**
     * Unlink an activity group from a goal
     * @param {string} rootId - ID of the fractal
     * @param {string} goalId - ID of the goal
     * @param {string} groupId - ID of the activity group
     */
    unlinkGoalActivityGroup: (rootId, goalId, groupId) =>
        axios.delete(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups/${groupId}`),

    // ========== Activity Instance Time Tracking ==========

    /**
     * Create an activity instance (without starting timer)
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {instance_id, session_id, activity_definition_id}
     */
    createActivityInstance: (rootId, data) =>
        axios.post(`${API_BASE}/${rootId}/activity-instances`, data),

    /**
     * Start timer for an activity instance
     * @param {string} rootId - ID of the fractal
     * @param {string} instanceId - ID of the activity instance
     * @param {Object} data - Optional {session_id, activity_definition_id}
     */
    startActivityTimer: (rootId, instanceId, data = {}) =>
        axios.post(`${API_BASE}/${rootId}/activity-instances/${instanceId}/start`, data),

    /**
     * Complete an activity instance (sets stop time and marks completed)
     * @param {string} rootId - ID of the fractal
     * @param {string} instanceId - ID of the activity instance
     * @param {Object} data - Optional {session_id, activity_definition_id}
     */
    completeActivityInstance: (rootId, instanceId, data = {}) =>
        axios.post(`${API_BASE}/${rootId}/activity-instances/${instanceId}/complete`, data),

    /**
     * Update activity instance manually (e.g. set times)
     * @param {string} rootId - ID of the fractal
     * @param {string} instanceId - ID of the activity instance
     * @param {Object} data - {time_start, time_stop, session_id, activity_definition_id}
     */
    updateActivityInstance: (rootId, instanceId, data) =>
        axios.put(`${API_BASE}/${rootId}/activity-instances/${instanceId}`, data),

    /**
     * Get all activity instances for a fractal
     * @param {string} rootId - ID of the fractal
     */
    getActivityInstances: (rootId) =>
        axios.get(`${API_BASE}/${rootId}/activity-instances`),

    // ========== Programs ==========

    /**
     * Get all programs for a fractal
     * @param {string} rootId - ID of the fractal
     */
    getPrograms: (rootId) => axios.get(`${API_BASE}/${rootId}/programs`),

    /**
     * Get a specific program
     * @param {string} rootId - ID of the fractal
     * @param {string} programId - ID of the program
     */
    getProgram: (rootId, programId) =>
        axios.get(`${API_BASE}/${rootId}/programs/${programId}`),

    /**
     * Create a new program
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {name, description, start_date, end_date, selectedGoals, weeklySchedule}
     */
    createProgram: (rootId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs`, data),

    /**
     * Update a program
     * @param {string} rootId - ID of the fractal
     * @param {string} programId - ID of the program
     * @param {Object} data - {name, description, start_date, end_date, selectedGoals, weeklySchedule, is_active}
     */
    updateProgram: (rootId, programId, data) =>
        axios.put(`${API_BASE}/${rootId}/programs/${programId}`, data),

    /**
     * Delete a program
     * @param {string} rootId - ID of the fractal
     * @param {string} programId - ID of the program to delete
     */
    deleteProgram: (rootId, programId) =>
        axios.delete(`${API_BASE}/${rootId}/programs/${programId}`),

    /**
     * Get the count of sessions associated with a program
     * @param {string} rootId - ID of the fractal
     * @param {string} programId - ID of the program
     */
    getProgramSessionCount: (rootId, programId) =>
        axios.get(`${API_BASE}/${rootId}/programs/${programId}/session-count`),

    /**
     * Add a configured day to a program block
     * @param {string} rootId
     * @param {string} programId
     * @param {string} blockId
     * @param {Object} data - {name, template_id, day_of_week, cascade}
     */
    addBlockDay: (rootId, programId, blockId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days`, data),

    updateBlockDay: (rootId, programId, blockId, dayId, data) =>
        axios.put(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}`, data),

    copyBlockDay: (rootId, programId, blockId, dayId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}/copy`, data),

    attachGoalToBlock: (rootId, programId, blockId, data) =>
        axios.post(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/goals`, data),

    deleteBlockDay: (rootId, programId, blockId, dayId) =>
        axios.delete(`${API_BASE}/${rootId}/programs/${programId}/blocks/${blockId}/days/${dayId}`),

    /**
     * Get active program days for the current date
     * Returns days from active programs where today falls within the block's date range
     * @param {string} rootId - ID of the fractal
     */
    getActiveProgramDays: (rootId) =>
        axios.get(`${API_BASE}/${rootId}/programs/active-days`),

    // ========== Notes ==========

    /**
     * Get all notes for a session (includes activity instance notes)
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the session
     */
    getSessionNotes: (rootId, sessionId) =>
        axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}/notes`),

    /**
     * Get session-level notes from the last 3 previous sessions
     * @param {string} rootId - ID of the fractal
     * @param {string} sessionId - ID of the current session (to exclude)
     */
    getPreviousSessionNotes: (rootId, sessionId) =>
        axios.get(`${API_BASE}/${rootId}/sessions/${sessionId}/previous-session-notes`),

    /**
     * Get notes for a specific activity instance
     * @param {string} rootId - ID of the fractal
     * @param {string} instanceId - ID of the activity instance
     */
    getActivityInstanceNotes: (rootId, instanceId) =>
        axios.get(`${API_BASE}/${rootId}/activity-instances/${instanceId}/notes`),

    /**
     * Get notes for an activity definition (across all sessions)
     * @param {string} rootId - ID of the fractal
     * @param {string} activityId - ID of the activity definition
     * @param {Object} options - {limit, exclude_session}
     */
    getActivityDefinitionNotes: (rootId, activityId, options = {}) => {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.excludeSession) params.append('exclude_session', options.excludeSession);
        const queryString = params.toString();
        return axios.get(`${API_BASE}/${rootId}/activities/${activityId}/notes${queryString ? '?' + queryString : ''}`);
    },

    /**
     * Get previous instances of an activity (for history display)
     * @param {string} rootId - ID of the fractal
     * @param {string} activityId - ID of the activity definition
     * @param {Object} options - {limit, excludeSession}
     */
    getActivityHistory: (rootId, activityId, options = {}) => {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.excludeSession) params.append('exclude_session', options.excludeSession);
        const queryString = params.toString();
        return axios.get(`${API_BASE}/${rootId}/activities/${activityId}/history${queryString ? '?' + queryString : ''}`);
    },

    /**
     * Create a new note
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {context_type, context_id, session_id, activity_instance_id, activity_definition_id, set_index, content}
     */
    createNote: (rootId, data) =>
        axios.post(`${API_BASE}/${rootId}/notes`, data),

    /**
     * Update a note's content
     * @param {string} rootId - ID of the fractal
     * @param {string} noteId - ID of the note
     * @param {Object} data - {content}
     */
    updateNote: (rootId, noteId, data) =>
        axios.put(`${API_BASE}/${rootId}/notes/${noteId}`, data),

    /**
     * Delete a note (soft delete)
     * @param {string} rootId - ID of the fractal
     * @param {string} noteId - ID of the note
     */
    deleteNote: (rootId, noteId) =>
        axios.delete(`${API_BASE}/${rootId}/notes/${noteId}`),

    // ========== Annotations ==========

    /**
     * Get annotations for a specific visualization
     * @param {string} rootId - ID of the fractal
     * @param {string} visualizationType - Type of visualization
     * @param {Object} context - Visualization context (activity_id, etc.)
     */
    getAnnotations: (rootId, visualizationType, context = {}) => {
        const params = new URLSearchParams();
        params.append('visualization_type', visualizationType);
        params.append('visualization_context', JSON.stringify(context));
        return axios.get(`${API_BASE}/roots/${rootId}/annotations?${params.toString()}`);
    },

    /**
     * Create a new annotation
     * @param {string} rootId - ID of the fractal
     * @param {Object} data - {visualization_type, visualization_context, content, selected_points, x_value, y_value}
     */
    createAnnotation: (rootId, data) =>
        axios.post(`${API_BASE}/roots/${rootId}/annotations`, data),

    /**
     * Delete an annotation
     * @param {string} rootId - ID of the fractal
     * @param {string} annotationId - ID of the annotation
     */
    deleteAnnotation: (rootId, annotationId) =>
        axios.delete(`${API_BASE}/roots/${rootId}/annotations/${annotationId}`),

    // ========== Logs ==========

    /**
     * Get event logs for a fractal with filtering and pagination
     * @param {string} rootId - ID of the fractal
     * @param {Object} options - {limit, offset, event_type, start_date, end_date}
     */
    getLogs: (rootId, options = {}) => {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset !== undefined) params.append('offset', options.offset);
        if (options.event_type) params.append('event_type', options.event_type);
        if (options.start_date) params.append('start_date', options.start_date);
        if (options.end_date) params.append('end_date', options.end_date);

        const queryString = params.toString();
        return axios.get(`${API_BASE}/${rootId}/logs${queryString ? '?' + queryString : ''}`);
    },

    /**
     * Clear all event logs for a fractal
     * @param {string} rootId - ID of the fractal
     */
    clearLogs: (rootId) =>
        axios.delete(`${API_BASE}/${rootId}/logs/clear`),
};

/**
 * Legacy API endpoints (for backward compatibility)
 * These will be deprecated once the migration is complete
 */
export const legacyApi = {
    getGoals: () => axios.get(`${API_BASE}/goals`),
    createGoal: (data) => axios.post(`${API_BASE}/goals`, data),
    getAllSessions: () => axios.get(`${API_BASE}/practice-sessions`),
    createSession: (data) => axios.post(`${API_BASE}/goals/practice-session`, data),
};

export default {
    global: globalApi,
    fractal: fractalApi,
    auth: authApi,
    legacy: legacyApi,
};
