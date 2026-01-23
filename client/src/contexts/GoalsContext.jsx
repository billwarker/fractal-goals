import React, { createContext, useContext, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fractalApi, globalApi } from '../utils/api';

const GoalsContext = createContext();

export function GoalsProvider({ children }) {
    const queryClient = useQueryClient();

    // 1. Queries
    const fractalsQuery = useQuery({
        queryKey: ['fractals'],
        queryFn: async () => {
            const res = await globalApi.getAllFractals();
            return res.data;
        }
    });

    const useFractalTreeQuery = (rootId) => useQuery({
        queryKey: ['fractalTree', rootId],
        queryFn: async () => {
            if (!rootId) return null;
            const res = await fractalApi.getGoals(rootId);
            return res.data;
        },
        enabled: !!rootId
    });

    // 2. Mutations
    const createFractalMutation = useMutation({
        mutationFn: async (data) => {
            const res = await globalApi.createFractal(data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['fractals'] });
        }
    });

    const createGoalMutation = useMutation({
        mutationFn: async ({ rootId, goalData }) => {
            const res = await fractalApi.createGoal(rootId, goalData);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['fractalTree', variables.rootId] });
        }
    });

    const updateGoalMutation = useMutation({
        mutationFn: async ({ rootId, goalId, updates }) => {
            const res = await fractalApi.updateGoal(rootId, goalId, updates);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['fractalTree', variables.rootId] });
        }
    });

    const deleteGoalMutation = useMutation({
        mutationFn: async ({ rootId, goalId }) => {
            const res = await fractalApi.deleteGoal(rootId, goalId);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['fractalTree', variables.rootId] });
        }
    });

    const toggleGoalCompletionMutation = useMutation({
        mutationFn: async ({ rootId, goalId, completed }) => {
            const res = await fractalApi.toggleGoalCompletion(rootId, goalId, completed);
            return res.data;
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ['fractalTree', variables.rootId] });
        }
    });

    // 3. Glue/Backwards Compatibility
    // We can't use useFractalTreeQuery here dynamically for all rootIds, 
    // so we expose a way to get the data for the 'currently active' rootId if needed.
    // However, most components pass rootId to the fetch functions.

    // For now, we'll keep the "last fetched" tree in a state-like way if needed, 
    // but better to encourage components to use the query hooks.
    // To maintain compatibility with current views:
    const fetchFractals = useCallback(() => fractalsQuery.refetch(), [fractalsQuery]);

    // This is a bridge: it doesn't return data but triggers a fetch/refetch
    const fetchFractalTree = useCallback((rootId) => {
        queryClient.invalidateQueries({ queryKey: ['fractalTree', rootId] });
    }, [queryClient]);

    const value = {
        fractals: fractalsQuery.data || [],
        currentFractal: null, // This will be handled differently in components
        loading: fractalsQuery.isLoading,
        error: fractalsQuery.error,
        fetchFractals,
        fetchFractalTree,
        createFractal: createFractalMutation.mutateAsync,
        createGoal: (rootId, goalData) => createGoalMutation.mutateAsync({ rootId, goalData }),
        updateGoal: (rootId, goalId, updates) => updateGoalMutation.mutateAsync({ rootId, goalId, updates }),
        deleteGoal: (rootId, goalId) => deleteGoalMutation.mutateAsync({ rootId, goalId }),
        toggleGoalCompletion: (rootId, goalId, completed) => toggleGoalCompletionMutation.mutateAsync({ rootId, goalId, completed }),
        // New Query-specific additions
        useFractalTreeQuery
    };

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
