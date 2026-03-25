import { API_BASE, axios } from './core';

export const fractalGoalsApi = {
    getGoals: (rootId) => axios.get(`${API_BASE}/${rootId}/goals`),
    getGoalsForSelection: (rootId) => axios.get(`${API_BASE}/${rootId}/goals/selection`),
    getGoal: (rootId, goalId) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}`),
    createGoal: (rootId, data) => axios.post(`${API_BASE}/${rootId}/goals`, data),
    updateGoal: (rootId, goalId, data) => axios.put(`${API_BASE}/${rootId}/goals/${goalId}`, data),
    deleteGoal: (rootId, goalId) => axios.delete(`${API_BASE}/${rootId}/goals/${goalId}`),
    toggleGoalCompletion: (rootId, goalId, completed, sessionId = null) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/complete`, {
            completed,
            ...(sessionId ? { session_id: sessionId } : {}),
        }),
    evaluateGoalTargets: (rootId, goalId, sessionId) =>
        axios.post(`${API_BASE}/${rootId}/goals/${goalId}/evaluate-targets`, { session_id: sessionId }),
    getGoalAnalytics: (rootId) => axios.get(`${API_BASE}/${rootId}/goals/analytics`),
    getGoalActivities: (rootId, goalId) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}/activities`),
    getGoalActivityGroups: (rootId, goalId) => axios.get(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups`),
    getGoalMetrics: (goalId) => axios.get(`${API_BASE}/goals/${goalId}/metrics`),
    getGoalDailyDurations: (goalId) => axios.get(`${API_BASE}/goals/${goalId}/metrics/daily-durations`),
    linkGoalActivityGroup: (rootId, goalId, groupId) =>
        axios.post(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups/${groupId}`),
    unlinkGoalActivityGroup: (rootId, goalId, groupId) =>
        axios.delete(`${API_BASE}/${rootId}/goals/${goalId}/activity-groups/${groupId}`),
    setGoalAssociationsBatch: (rootId, goalId, data) =>
        axios.put(`${API_BASE}/${rootId}/goals/${goalId}/associations/batch`, data),
    // Goal Options
    copyGoal: (rootId, goalId) =>
        axios.post(`${API_BASE}/${rootId}/goals/${goalId}/copy`),
    freezeGoal: (rootId, goalId, frozen) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/freeze`, { frozen }),
    moveGoal: (rootId, goalId, newParentId) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/move`, { new_parent_id: newParentId }),
    convertGoalLevel: (rootId, goalId, levelId) =>
        axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/convert-level`, { level_id: levelId }),
};
