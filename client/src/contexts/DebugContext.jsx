import React, { createContext, useContext, useState, useEffect } from 'react';

/**
 * Debug Context
 * 
 * Provides a global debug mode toggle for development features.
 * Toggle with Ctrl+Shift+D (or Cmd+Shift+D on Mac).
 * 
 * Features controlled by debug mode:
 * - Viewport border visualization (red box around FlowTree)
 */

const DebugContext = createContext({
    debugMode: false,
    toggleDebugMode: () => { },
});

export const useDebug = () => useContext(DebugContext);

export const DebugProvider = ({ children }) => {
    const [debugMode, setDebugMode] = useState(() => {
        // Initialize from localStorage
        const saved = localStorage.getItem('fractal-goals-debug-mode');
        return saved === 'true';
    });

    // Persist to localStorage
    useEffect(() => {
        localStorage.setItem('fractal-goals-debug-mode', debugMode.toString());
    }, [debugMode]);

    // Keyboard shortcut: Ctrl+Shift+D (or Cmd+Shift+D)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
                e.preventDefault();
                setDebugMode(prev => {
                    const newValue = !prev;
                    console.log(`🐛 Debug mode ${newValue ? 'ENABLED' : 'DISABLED'}`);
                    return newValue;
                });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const toggleDebugMode = () => {
        setDebugMode(prev => !prev);
    };

    return (
        <DebugContext.Provider value={{ debugMode, toggleDebugMode }}>
            {children}
        </DebugContext.Provider>
    );
};

export default DebugContext;
