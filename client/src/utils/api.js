/**
 * API Helper - Centralized API calls for Fractal Goals
 * 
 * This module provides a clean interface for making API calls to the Flask backend.
 * All endpoints are organized by scope (global vs fractal-scoped).
 */

import axios from 'axios';

const API_BASE = 'http://localhost:8001/api';

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
     * Get all practice sessions for a fractal
     * @param {string} rootId - ID of the fractal
     */
    getSessions: (rootId) => axios.get(`${API_BASE}/${rootId}/sessions`),

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
    legacy: legacyApi,
};
