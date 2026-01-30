import React, { createContext, useContext, useState, useEffect } from 'react';

const TimezoneContext = createContext();

export function TimezoneProvider({ children }) {
    // Preference can be a specific IANA string (e.g. "America/New_York") or "local"
    const [preference, setPreference] = useState(() => {
        return localStorage.getItem('fractal_timezone_preference') || 'local';
    });

    // The actual timezone string to use for formatting
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone);

    useEffect(() => {
        // Persist preference
        localStorage.setItem('fractal_timezone_preference', preference);

        // Resolve preference to actual timezone
        if (preference === 'local') {
            setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
        } else {
            setTimezone(preference);
        }
    }, [preference]);

    const value = {
        timezone,       // The resolved IANA string to use in formatters
        preference,     // "local" or specific string
        setPreference   // Function to update preference
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
        // Fallback for tests or usage outside provider
        return {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            preference: 'local',
            setPreference: () => { }
        };
    }
    return context;
}

export default TimezoneContext;
