import { API_BASE, axios, buildQueryString } from './core';

export const fractalGoalsApi = {
    getGoals: (rootId) => axios.get(`${API_BASE}/${rootId}/goals`),
    getGoalsForSelection: (rootId) => axios.get(`${API_BASE}/${rootId}/goals/selection`),
    getGoal: (rootId, goalId, options = {}) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}`, {
        params: options.includeChildren === false ? { include_children: 'false' } : undefined,
    }),
    createGoal: (rootId, data) => axios.post(`${API_BASE}/${rootId}/goals`, data),
    updateGoal: (rootId, goalId, data) => axios.put(`${API_BASE}/${rootId}/goals/${goalId}`, data),
    // `beginNext: false` keeps the next goal in a sequence waiting when this one was its active step.
    deleteGoal: (rootId, goalId, { beginNext = true } = {}) => axios.delete(`${API_BASE}/${rootId}/goals/${goalId}`, {
        params: beginNext === false ? { begin_next: 'false' } : undefined,
    }),
    // `sequenceOptions`: { beginNext } when completing / { pauseNext } when un-completing a sequenced goal.
    toggleGoalCompletion: (rootId, goalId, completed, sessionId = null, sequenceOptions = null) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/complete`, {
            completed,
            ...(sessionId ? { session_id: sessionId } : {}),
            ...(sequenceOptions?.beginNext === false ? { begin_next: false } : {}),
            ...(sequenceOptions?.pauseNext === false ? { pause_next: false } : {}),
        }),
    getGoalSequence: (rootId, goalId) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}/sequence`),
    createSequenceTrack: (rootId, parentGoalId, goalIds) =>
        axios.post(`${API_BASE}/${rootId}/sequence-tracks`, { parent_goal_id: parentGoalId, goal_ids: goalIds }),
    setSequenceSteps: (rootId, trackId, goalIds) =>
        axios.put(`${API_BASE}/${rootId}/sequence-tracks/${trackId}`, { goal_ids: goalIds }),
    deleteSequenceTrack: (rootId, trackId) => axios.delete(`${API_BASE}/${rootId}/sequence-tracks/${trackId}`),
    setGoalCondition: (rootId, goalId, data) =>
        axios.put(`${API_BASE}/${rootId}/goals/${goalId}/condition`, data),
    getGoalConditionProgress: (rootId, goalIds) =>
        axios.get(`${API_BASE}/${rootId}/goals/condition-progress`, { params: { goal_ids: goalIds.join(',') } }),
    getGoalConditionEvidence: (rootId, goalId, { since = 'active', activityId = null } = {}) =>
        axios.get(`${API_BASE}/${rootId}/goals/${goalId}/condition/evidence`, {
            params: { ...(since === 'all' ? { since } : {}), ...(activityId ? { activity_id: activityId } : {}) },
        }),
    getGoalAnalytics: (rootId, options = {}) => axios.get(`${API_BASE}/${rootId}/goals/analytics${buildQueryString(options)}`),
    getGoalActivities: (rootId, goalId) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}/activities`),
    getGoalActivityGroups: (rootId, goalId) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups`),
    getGoalActivityHeatmap: (rootId, goalId, { includeChildren = true, timezone = 'UTC', date = null, view = 'calendar', metric = 'activities', cursor = null, limit = 20 } = {}) =>
        axios.get(`${API_BASE}/${rootId}/goals/${goalId}/activity-heatmap`, {
            params: { include_children: includeChildren, timezone, ...(date ? { date } : {}), ...(view === 'entries' ? { view, metric, limit, ...(cursor ? { cursor } : {}) } : {}) },
        }),
    getGoalMetrics: (goalId) => axios.get(`${API_BASE}/goals/${goalId}/metrics`),
    linkGoalActivityGroup: (rootId, goalId, groupId) =>
        axios.post(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups/${groupId}`),
    unlinkGoalActivityGroup: (rootId, goalId, groupId) =>
        axios.delete(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups/${groupId}`),
    setGoalAssociationsBatch: (rootId, goalId, data) =>
        axios.put(`${API_BASE}/${rootId}/goals/${goalId}/associations/batch`, data),
    getEligibleMoveParents: (rootId, goalId, search) => {
        const params = search ? `?search=${encodeURIComponent(search)}` : '';
        return axios.get(`${API_BASE}/${rootId}/goals/${goalId}/eligible-parents${params}`);
    },
    // Goal Options
    copyGoal: (rootId, goalId) =>
        axios.post(`${API_BASE}/${rootId}/goals/${goalId}/copy`),
    pauseGoal: (rootId, goalId, paused) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/pause`, { paused }),
    moveGoal: (rootId, goalId, newParentId) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/move`, { new_parent_id: newParentId }),
    convertGoalLevel: (rootId, goalId, levelId) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/convert-level`, { level_id: levelId }),
};
