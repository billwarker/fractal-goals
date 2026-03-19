import React, { createContext, useContext } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi } from '../utils/api';
import { formatError } from '../utils/mutationNotify';
import notify from '../utils/notify';
import { queryKeys } from '../hooks/queryKeys';

const GoalsContext = createContext();

function formatGoalTypeLabel(type) {
    if (!type) return 'Goal';
    return type.replace(/Goal$/, ' Goal').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
}

export function GoalsProvider({ children }) {
    const queryClient = useQueryClient();

    // 2. Mutations
    const createGoalMutation = useMutation({
        mutationFn: async ({ rootId, goalData }) => {
            const res = await fractalApi.createGoal(rootId, goalData);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(variables.rootId) });
            notify.success('Goal created');
        },
        onError: (error) => {
            notify.error(`Failed to create goal: ${formatError(error)}`);
        },
    });

    const updateGoalMutation = useMutation({
        mutationFn: async ({ rootId, goalId, updates }) => {
            const res = await fractalApi.updateGoal(rootId, goalId, updates);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(variables.rootId) });
        },
        onError: (error) => {
            notify.error(`Failed to update goal: ${formatError(error)}`);
        },
    });

    const deleteGoalMutation = useMutation({
        mutationFn: async ({ rootId, goalId }) => {
            const res = await fractalApi.deleteGoal(rootId, goalId);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(variables.rootId) });
            queryClient.invalidateQueries({ queryKey: ['session', variables.rootId] });
            queryClient.invalidateQueries({ queryKey: ['session-activities', variables.rootId] });
            queryClient.invalidateQueries({ queryKey: ['session-notes', variables.rootId] });
            queryClient.invalidateQueries({ queryKey: queryKeys.sessionMicroGoals(variables.rootId) });
            queryClient.invalidateQueries({ queryKey: ['session-goals-view', variables.rootId] });
            notify.success('Goal deleted');
        },
        onError: (error) => {
            notify.error(`Failed to delete goal: ${formatError(error)}`);
        },
    });

    const toggleGoalCompletionMutation = useMutation({
        mutationFn: async ({ rootId, goalId, completed }) => {
            const res = await fractalApi.toggleGoalCompletion(rootId, goalId, completed);
            return res.data;
        },
        onSuccess: (data, variables) => {
            queryClient.invalidateQueries({ queryKey: queryKeys.fractalTree(variables.rootId) });
            const goalType = formatGoalTypeLabel(data?.attributes?.type || data?.type);
            const action = variables.completed ? 'Completed' : 'Uncompleted';
            const goalName = data?.name;
            notify.success(goalName ? `${goalType} ${action}: ${goalName}` : `${goalType} ${action}`);
        },
        onError: (error) => {
            notify.error(`Failed to toggle goal: ${formatError(error)}`);
        },
    });

    const [activeRootId, setActiveRootId] = React.useState(null);

    const value = React.useMemo(() => ({
        activeRootId,
        setActiveRootId,
        createGoal: (rootId, goalData) => createGoalMutation.mutateAsync({ rootId, goalData }),
        updateGoal: (rootId, goalId, updates) => updateGoalMutation.mutateAsync({ rootId, goalId, updates }),
        deleteGoal: (rootId, goalId) => deleteGoalMutation.mutateAsync({ rootId, goalId }),
        toggleGoalCompletion: (rootId, goalId, completed) => toggleGoalCompletionMutation.mutateAsync({ rootId, goalId, completed }),
    }), [
        activeRootId,
        createGoalMutation,
        updateGoalMutation,
        deleteGoalMutation,
        toggleGoalCompletionMutation,
    ]);

    return (
        <GoalsContext.Provider value={value}>
            {children}
        </GoalsContext.Provider>
    );
}

export function useGoals() {
    const context = useContext(GoalsContext);
    if (!context) {
        throw new Error('useGoals must be used within a GoalsProvider');
    }
    return context;
}

export default GoalsContext;
