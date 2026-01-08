/**
 * SidePaneContext - Global state management for the SidePane
 * 
 * Manages:
 * - Open/closed state (persisted to localStorage)
 * - Active mode (persisted)
 * - Page-level and item-level context
 * - Context stack for back navigation
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const SidePaneContext = createContext(null);

// Custom hook for localStorage with SSR safety
const useLocalStorage = (key, initialValue) => {
    const [storedValue, setStoredValue] = useState(() => {
        if (typeof window === 'undefined') return initialValue;
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
            return initialValue;
        }
    });

    const setValue = (value) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(key, JSON.stringify(valueToStore));
            }
        } catch (error) {
            console.warn(`Error setting localStorage key "${key}":`, error);
        }
    };

    return [storedValue, setValue];
};

export const SidePaneProvider = ({ children }) => {
    // Persisted state
    const [isOpen, setIsOpen] = useLocalStorage('sidepane-open', true);
    const [activeMode, setActiveMode] = useLocalStorage('sidepane-mode', 'notes');
    const [position, setPosition] = useLocalStorage('sidepane-position', 'right');

    // Context state (changes with page/selection)
    const [pageContext, setPageContext] = useState(null);
    const [itemContext, setItemContext] = useState(null);
    const [contextStack, setContextStack] = useState([]);

    // Derived state
    const activeContext = itemContext || pageContext;
    const hasItemContext = itemContext !== null;

    // Actions
    const selectItem = useCallback((item) => {
        if (itemContext) {
            setContextStack(prev => [...prev, itemContext]);
        }
        setItemContext(item);

        // Auto-open sidepane when selecting an item
        if (!isOpen) {
            setIsOpen(true);
        }
    }, [itemContext, isOpen, setIsOpen]);

    const goBack = useCallback(() => {
        if (contextStack.length > 0) {
            const prev = contextStack[contextStack.length - 1];
            setContextStack(prevStack => prevStack.slice(0, -1));
            setItemContext(prev);
        } else {
            setItemContext(null);
        }
    }, [contextStack]);

    const clearItemContext = useCallback(() => {
        setItemContext(null);
        setContextStack([]);
    }, []);

    // Toggle sidepane
    const toggle = useCallback(() => {
        setIsOpen(prev => !prev);
    }, [setIsOpen]);

    // Clear item context when page context changes
    useEffect(() => {
        clearItemContext();
    }, [pageContext?.id]); // Only clear when page ID changes

    // Validate active mode against available modes
    useEffect(() => {
        if (activeContext?.availableModes && !activeContext.availableModes.includes(activeMode)) {
            setActiveMode(activeContext.availableModes[0] || 'notes');
        }
    }, [activeContext?.availableModes, activeMode, setActiveMode]);

    const value = {
        // State
        isOpen,
        setIsOpen,
        activeMode,
        setActiveMode,
        position,
        setPosition,
        pageContext,
        setPageContext,
        itemContext,
        activeContext,
        hasItemContext,
        contextStack,

        // Actions
        selectItem,
        goBack,
        clearItemContext,
        toggle,
    };

    return (
        <SidePaneContext.Provider value={value}>
            {children}
        </SidePaneContext.Provider>
    );
};

export const useSidePane = () => {
    const context = useContext(SidePaneContext);
    if (!context) {
        throw new Error('useSidePane must be used within a SidePaneProvider');
    }
    return context;
};

export default SidePaneContext;
