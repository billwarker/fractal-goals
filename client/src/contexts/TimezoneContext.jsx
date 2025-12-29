import React, { createContext, useContext, useState, useEffect } from 'react';

const TimezoneContext = createContext();

export function TimezoneProvider({ children }) {
    // Default to browser's local timezone
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

    const value = {
        timezone,
        setTimezone
    };

    return (
        <TimezoneContext.Provider value={value}>
            {children}
        </TimezoneContext.Provider>
    );
}

export function useTimezone() {
    const context = useContext(TimezoneContext);
    if (!context) {
        // Fallback if used outside provider (e.g. tests)
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return context.timezone;
}

export function useSetTimezone() {
    const context = useContext(TimezoneContext);
    if (!context) {
        throw new Error('useSetTimezone must be used within a TimezoneProvider');
    }
    return context.setTimezone;
}

export default TimezoneContext;
