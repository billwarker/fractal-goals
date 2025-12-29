import React, { createContext, useContext, useState, useCallback } from 'react';
import { fractalApi, globalApi } from '../utils/api';

const GoalsContext = createContext();

export function GoalsProvider({ children }) {
    const [fractals, setFractals] = useState([]); // List of roots
    const [currentFractal, setCurrentFractal] = useState(null); // Full tree of current fractal
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Fetch list of all fractals (roots)
    const fetchFractals = useCallback(async () => {
        try {
            setLoading(true);
            const res = await globalApi.getAllFractals();
            setFractals(res.data);
        } catch (err) {
            console.error('Failed to fetch fractals:', err);
            setError('Failed to load fractals');
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch specific fractal tree
    const fetchFractalTree = useCallback(async (rootId) => {
        if (!rootId) return;
        try {
            setLoading(true);
            // Fetch root goals tree
            const res = await fractalApi.getGoals(rootId);
            setCurrentFractal(res.data);
        } catch (err) {
            console.error('Failed to fetch fractal tree:', err);
            setError('Failed to load goal tree');
        } finally {
            setLoading(false);
        }
    }, []);

    // Create a new Fractal (Root Goal)
    const createFractal = useCallback(async (data) => {
        try {
            const res = await globalApi.createFractal(data);
            await fetchFractals();
            return res.data;
        } catch (err) {
            console.error('Failed to create fractal:', err);
            throw err;
        }
    }, [fetchFractals]);

    // Create a Goal within a fractal
    const createGoal = useCallback(async (rootId, goalData) => {
        try {
            const res = await fractalApi.createGoal(rootId, goalData);
            await fetchFractalTree(rootId); // Refresh tree
            return res.data;
        } catch (err) {
            console.error('Failed to create goal:', err);
            throw err;
        }
    }, [fetchFractalTree]);

    // Update a Goal
    const updateGoal = useCallback(async (rootId, goalId, updates) => {
        try {
            const res = await fractalApi.updateGoal(rootId, goalId, updates);
            await fetchFractalTree(rootId); // Refresh tree
            return res.data;
        } catch (err) {
            console.error('Failed to update goal:', err);
            throw err;
        }
    }, [fetchFractalTree]);

    // Delete a Goal
    const deleteGoal = useCallback(async (rootId, goalId) => {
        try {
            await fractalApi.deleteGoal(rootId, goalId);
            await fetchFractalTree(rootId); // Refresh tree
        } catch (err) {
            console.error('Failed to delete goal:', err);
            throw err;
        }
    }, [fetchFractalTree]);

    // Toggle Completion
    const toggleGoalCompletion = useCallback(async (rootId, goalId, completed) => {
        try {
            await fractalApi.toggleGoalCompletion(rootId, goalId, completed);
            await fetchFractalTree(rootId);
        } catch (err) {
            console.error('Failed to toggle completion:', err);
            throw err;
        }
    }, [fetchFractalTree]);

    const value = {
        fractals,
        currentFractal,
        loading,
        error,
        fetchFractals,
        fetchFractalTree,
        createFractal,
        createGoal,
        updateGoal,
        deleteGoal,
        toggleGoalCompletion
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
