import React, { createContext, useContext, useState } from 'react';

const HeaderContext = createContext({
    headerActions: null,
    setHeaderActions: () => {},
});

export function HeaderProvider({ children }) {
    const [headerActions, setHeaderActions] = useState(null);

    return (
        <HeaderContext.Provider value={{ headerActions, setHeaderActions }}>
            {children}
        </HeaderContext.Provider>
    );
}

export function useHeader() {
    return useContext(HeaderContext);
}
