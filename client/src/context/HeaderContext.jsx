
import React, { createContext, useState, useContext } from 'react';

// Create the context
const HeaderContext = createContext({
    headerActions: null,
    setHeaderActions: () => { }
});

// Provider component
export const HeaderProvider = ({ children }) => {
    const [headerActions, setHeaderActions] = useState(null);

    return (
        <HeaderContext.Provider value={{ headerActions, setHeaderActions }}>
            {children}
        </HeaderContext.Provider>
    );
};

// Hook to use the context
export const useHeader = () => useContext(HeaderContext);
