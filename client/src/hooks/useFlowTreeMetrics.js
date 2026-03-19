import { useMemo } from 'react';

const toId = (value) => (value == null ? null : String(value));
export const ACTIVE_GOAL_WINDOW_DAYS = 7;

export const getRecentActivityCutoff = (now = new Date()) => (
    new Date(now.getTime() - ACTIVE_GOAL_WINDOW_DAYS * 24 * 60 * 60 * 1000)
);

export const getCompletedActivityInstanceDate = (instance) => {
    const timestamp = instance?.time_stop
        || instance?.completed_at
        || instance?.updated_at
        || instance?.created_at
        || null;
    if (!timestamp) return null;

    const completedAt = new Date(timestamp);
    return Number.isNaN(completedAt.getTime()) ? null : completedAt;
};

export const isRecentCompletedActivityInstance = (instance, now = new Date()) => {
    if (!instance?.completed) return false;

    const completedAt = getCompletedActivityInstanceDate(instance);
    if (!completedAt) return false;

    return completedAt >= getRecentActivityCutoff(now);
};

export const deriveEvidenceGoalIds = (sessions = [], activities = [], activityGroups = [], now = new Date()) => {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const safeActivities = Array.isArray(activities) ? activities : [];
    const safeActivityGroups = Array.isArray(activityGroups) ? activityGroups : [];

    // 1. Map Activity ID -> Goal IDs
    const goalsByActivityId = new Map();
    // Also track which group an activity belongs to
    const groupIdByActivityId = new Map();

    safeActivities.forEach((activity) => {
        const activityId = toId(activity?.id);
        if (!activityId) return;

        const associatedGoalIds = Array.isArray(activity?.associated_goal_ids)
            ? activity.associated_goal_ids.map((goalId) => toId(goalId)).filter(Boolean)
            : [];
        goalsByActivityId.set(activityId, associatedGoalIds);

        if (activity?.group_id) {
            groupIdByActivityId.set(activityId, toId(activity.group_id));
        }
    });

    // 2. Map Activity Group ID -> Goal IDs
    const goalsByGroupId = new Map();
    safeActivityGroups.forEach((group) => {
        const groupId = toId(group?.id);
        if (!groupId) return;

        const associatedGoalIds = Array.isArray(group?.associated_goal_ids)
            ? group.associated_goal_ids.map((goalId) => toId(goalId)).filter(Boolean)
            : [];
        goalsByGroupId.set(groupId, associatedGoalIds);
    });

    const evidenceGoalIds = new Set();

    // 3. Process recent completed activity instances and map them to associated goals.
    safeSessions.forEach((session) => {
        const instances = Array.isArray(session.activity_instances) ? session.activity_instances : [];

        instances.forEach((instance) => {
            if (!isRecentCompletedActivityInstance(instance, now)) return;
            const activityDefinitionId = toId(instance?.activity_definition_id);
            if (!activityDefinitionId) return;

            // Direct activity evidence
            const directGoalIds = goalsByActivityId.get(activityDefinitionId) || [];
            directGoalIds.forEach((goalId) => {
                evidenceGoalIds.add(goalId);
            });

            // Group-based evidence
            const groupId = groupIdByActivityId.get(activityDefinitionId);
            if (groupId) {
                const groupGoalIds = goalsByGroupId.get(groupId) || [];
                groupGoalIds.forEach((goalId) => {
                    evidenceGoalIds.add(goalId);
                });
            }
        });
    });

    return evidenceGoalIds;
};

export const getActiveLineageIds = (evidenceGoalIds, parentById) => {
    const activeNodeIds = new Set();

    evidenceGoalIds.forEach((goalId) => {
        let current = goalId;
        while (current) {
            activeNodeIds.add(current);
            current = parentById.get(current) || null;
        }
    });

    return activeNodeIds;
};

export const getInactiveNodeIds = (nodeById, childrenById, evidenceGoalIds) => {
    const memo = new Map();

    const hasEvidenceInSubtree = (nodeId) => {
        if (memo.has(nodeId)) return memo.get(nodeId);

        if (evidenceGoalIds.has(nodeId)) {
            memo.set(nodeId, true);
            return true;
        }

        const childIds = childrenById.get(nodeId) || [];
        const found = childIds.some((childId) => hasEvidenceInSubtree(childId));
        memo.set(nodeId, found);
        return found;
    };

    const inactiveNodeIds = new Set();
    nodeById.forEach((_, nodeId) => {
        if (!hasEvidenceInSubtree(nodeId)) {
            inactiveNodeIds.add(nodeId);
        }
    });

    return inactiveNodeIds;
};

export const deriveGraphMetrics = (
    rawNodes,
    visibleNodeIds,
    activeLineageIds,
    inactiveNodeIds,
    sessions,
    activities,
    activityGroups,
    programs
) => {
    const safeSessions = Array.isArray(sessions) ? sessions : [];
    const safeActivities = Array.isArray(activities) ? activities : [];
    const safeActivityGroups = Array.isArray(activityGroups) ? activityGroups : [];
    const safePrograms = Array.isArray(programs) ? programs : [];

    // ROW 1: Goals
    const totalGoals = rawNodes.length;
    const completedGoals = rawNodes.filter((n) => n.data.completed).length;
    const pctCompleted = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;
    const smartGoals = rawNodes.filter((n) => n.data.isSmart).length;
    const pctSmart = totalGoals > 0 ? Math.round((smartGoals / totalGoals) * 100) : 0;

    const goalsByActivityId = new Map();
    const groupIdByActivityId = new Map();
    safeActivities.forEach((a) => {
        const id = toId(a.id);
        goalsByActivityId.set(id, Array.isArray(a.associated_goal_ids) ? a.associated_goal_ids.map(toId) : []);
        if (a.group_id) groupIdByActivityId.set(id, toId(a.group_id));
    });

    const goalsByGroupId = new Map();
    safeActivityGroups.forEach((g) => {
        goalsByGroupId.set(toId(g.id), Array.isArray(g.associated_goal_ids) ? g.associated_goal_ids.map(toId) : []);
    });

    const instanceMapsToVisible = (instance) => {
        const defId = toId(instance?.activity_definition_id);
        if (!defId) return false;

        const directGoals = goalsByActivityId.get(defId) || [];
        if (directGoals.some((gId) => visibleNodeIds.has(gId))) return true;

        const groupId = groupIdByActivityId.get(defId);
        if (groupId) {
            const groupGoals = goalsByGroupId.get(groupId) || [];
            if (groupGoals.some((gId) => visibleNodeIds.has(gId))) return true;
        }
        return false;
    };

    const sessionMapsToVisible = (session) => {
        if (!session) return false;

        const instances = Array.isArray(session.activity_instances) ? session.activity_instances : [];
        if (instances.some((inst) => instanceMapsToVisible(inst))) return true;

        const stGoals = Array.isArray(session.short_term_goals) ? session.short_term_goals : [];
        const immGoals = Array.isArray(session.immediate_goals) ? session.immediate_goals : [];

        if (stGoals.some((g) => visibleNodeIds.has(toId(g.id)))) return true;
        if (immGoals.some((g) => visibleNodeIds.has(toId(g.id)))) return true;

        return false;
    };

    let associatedActivitiesCount = 0;
    safeActivities.forEach((a) => {
        const id = toId(a.id);
        const directGoals = goalsByActivityId.get(id) || [];
        if (directGoals.some((gId) => visibleNodeIds.has(gId))) {
            associatedActivitiesCount += 1;
            return;
        }
        const groupId = groupIdByActivityId.get(id);
        if (groupId) {
            const groupGoals = goalsByGroupId.get(groupId) || [];
            if (groupGoals.some((gId) => visibleNodeIds.has(gId))) {
                associatedActivitiesCount += 1;
            }
        }
    });

    let completedSessionsCount = 0;
    let completedInstancesCount = 0;
    let totalSessionDuration = 0;
    let totalInstanceDuration = 0;

    const now = new Date();
    const sevenDaysAgo = getRecentActivityCutoff(now);

    let recentSessionsCount = 0;
    let recentInstancesCount = 0;
    let recentSessionDuration = 0;

    let programSessionsCount = 0;
    let recentProgramSessionsCount = 0;

    safeSessions.forEach((session) => {
        if (!session) return;

        // Evaluate activity instances independently of session completion
        const instances = Array.isArray(session.activity_instances) ? session.activity_instances : [];
        instances.forEach((inst) => {
            if (!inst.completed) return;
            if (!instanceMapsToVisible(inst)) return;

            completedInstancesCount += 1;
            totalInstanceDuration += (inst.duration_seconds || 0);

            if (isRecentCompletedActivityInstance(inst, now)) {
                recentInstancesCount += 1;
            }
        });

        // Now evaluate session-level metrics
        if (!session.completed) return;
        if (!sessionMapsToVisible(session)) return;

        completedSessionsCount += 1;
        totalSessionDuration += (session.total_duration_seconds || 0);

        const sessionEnd = new Date(session.session_end || session.completed_at || session.created_at);
        const isRecent = sessionEnd >= sevenDaysAgo;

        if (isRecent) {
            recentSessionsCount += 1;
            recentSessionDuration += (session.total_duration_seconds || 0);
        }

        if (session.program_day_id) {
            programSessionsCount += 1;
            if (isRecent) recentProgramSessionsCount += 1;
        }
    });

    const activeVisibleNodesCount = Array.from(visibleNodeIds).filter((id) => activeLineageIds.has(id)).length;
    const inactiveVisibleNodesCount = Array.from(visibleNodeIds).filter((id) => inactiveNodeIds.has(id)).length;

    const recentCompletedGoalsCount = rawNodes.filter((n) => {
        if (!n.data.completed || !n.data.completed_at) return false;
        return new Date(n.data.completed_at) >= sevenDaysAgo;
    }).length;

    const activeProgramGoalIds = new Set();
    safePrograms.forEach((prog) => {
        if (!prog.is_active) return;
        const blocks = Array.isArray(prog.blocks) ? prog.blocks : [];
        blocks.forEach((b) => {
            const gIds = Array.isArray(b.goal_ids) ? b.goal_ids : [];
            gIds.forEach((id) => activeProgramGoalIds.add(toId(id)));
        });
        const pGoals = Array.isArray(prog.goal_ids) ? prog.goal_ids : [];
        pGoals.forEach((id) => activeProgramGoalIds.add(toId(id)));
    });

    const goalsInActiveProgramCount = rawNodes.filter((n) => activeProgramGoalIds.has(n.id) && visibleNodeIds.has(n.id)).length;
    const programFocusEfficiency = recentSessionsCount > 0
        ? Math.round((recentProgramSessionsCount / recentSessionsCount) * 100)
        : 0;

    const formatDuration = (seconds) => {
        if (!seconds) return '0h';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    return {
        row1: {
            totalGoals,
            completedGoals,
            pctCompleted,
            smartGoals,
            pctSmart
        },
        row2: {
            completedSessionsCount,
            associatedActivitiesCount,
            completedInstancesCount,
            totalSessionDuration: formatDuration(totalSessionDuration),
            totalInstanceDuration: formatDuration(totalInstanceDuration)
        },
        row3: {
            activeVisibleNodesCount,
            inactiveVisibleNodesCount
        },
        row4: {
            recentSessionsCount,
            recentInstancesCount,
            recentSessionDuration: formatDuration(recentSessionDuration),
            recentCompletedGoalsCount
        },
        row5: {
            goalsInActiveProgramCount,
            programSessionsCount,
            programFocusEfficiency
        }
    };
};

export function useFlowTreeMetrics(props) {
    const {
        rawNodes,
        visibleNodeIds,
        treeMaps,
        sessions,
        activities,
        activityGroups,
        programs
    } = props;

    return useMemo(() => {
        if (!treeMaps || !visibleNodeIds || !rawNodes) {
            return {
                evidenceGoalIds: new Set(),
                hasAnyEvidence: false,
                activeLineageIds: new Set(),
                inactiveNodeIds: new Set(),
                metrics: null
            };
        }

        const evidenceGoalIds = deriveEvidenceGoalIds(sessions, activities, activityGroups);
        const hasAnyEvidence = evidenceGoalIds.size > 0;

        const activeLineageIds = getActiveLineageIds(evidenceGoalIds, treeMaps.parentById);
        const inactiveNodeIds = getInactiveNodeIds(treeMaps.nodeById, treeMaps.childrenById, evidenceGoalIds);

        const metrics = deriveGraphMetrics(
            rawNodes,
            visibleNodeIds,
            activeLineageIds,
            inactiveNodeIds,
            sessions,
            activities,
            activityGroups,
            programs
        );

        return {
            evidenceGoalIds,
            hasAnyEvidence,
            activeLineageIds,
            inactiveNodeIds,
            metrics
        };
    }, [
        rawNodes,
        visibleNodeIds,
        treeMaps,
        sessions,
        activities,
        activityGroups,
        programs
    ]);
}
