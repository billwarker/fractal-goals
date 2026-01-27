import { useState, useEffect, useCallback } from 'react';
import { fractalApi } from '../utils/api';

export function useProgramData(rootId, programId) {
    const [program, setProgram] = useState(null);
    const [loading, setLoading] = useState(true);
    const [goals, setGoals] = useState([]); // Flat list of all goals
    const [treeData, setTreeData] = useState(null); // Tree structure
    const [activities, setActivities] = useState([]);
    const [activityGroups, setActivityGroups] = useState([]);
    const [sessions, setSessions] = useState([]);

    // Helper to flatten goal tree
    const collectGoals = useCallback((goal, collected = []) => {
        if (!goal) return collected;
        collected.push(goal);
        if (goal.children && Array.isArray(goal.children)) {
            goal.children.forEach(c => collectGoals(c, collected));
        }
        return collected;
    }, []);

    const fetchData = useCallback(async () => {
        if (!rootId || !programId) return;

        try {
            setLoading(true);
            const [progRes, goalsRes, actsRes, actGroupsRes, sessionsRes] = await Promise.all([
                fractalApi.getProgram(rootId, programId),
                fractalApi.getGoal(rootId, rootId), // Use getGoal to fetch tree
                fractalApi.getActivities(rootId),
                fractalApi.getActivityGroups(rootId),
                fractalApi.getSessions(rootId, { limit: 1000 }) // Fetch more sessions to be safe
            ]);

            setProgram(progRes.data);

            // Handle Goals Tree
            const tree = goalsRes.data;
            setTreeData(tree);
            const allGoals = collectGoals(tree);
            // Ensure unique goals if tree traversal has duplicates (unlikely if tree is strict)
            // But just in case, or if collectGoals is used recursively properly.
            // Wait, recursive `collected.push(goal)` with same array reference works.
            setGoals(allGoals);

            setActivities(actsRes.data || []);
            setActivityGroups(actGroupsRes.data || []);

            const sessionsData = sessionsRes.data.sessions || sessionsRes.data || [];
            setSessions(sessionsData);

        } catch (err) {
            console.error("Error fetching program data", err);
        } finally {
            setLoading(false);
        }
    }, [rootId, programId, collectGoals]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const getGoalDetails = useCallback((goalId) => {
        if (!goals) return null;
        return goals.find(g => g.id === goalId || (g.attributes && g.attributes.id === goalId));
    }, [goals]);

    return {
        program, setProgram,
        loading,
        goals, setGoals,
        treeData, setTreeData,
        activities,
        activityGroups,
        sessions, setSessions,
        refreshData: fetchData,
        getGoalDetails
    };
}
