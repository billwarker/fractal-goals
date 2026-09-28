import React from 'react';

import ProgramMobileSidePane from './ProgramMobileSidePane';
import ProgramSidePane from './ProgramSidePane';

function ResponsiveProgramSidePane({ isMobile, isVisible, onClose, ...sidePaneProps }) {
    if (!isVisible) return null;

    // Desktop keeps the pane open (like the session detail page); only the mobile sheet closes.
    const sidePane = <ProgramSidePane {...sidePaneProps} onCollapse={isMobile ? onClose : undefined} />;
    if (!isMobile) return sidePane;

    return (
        <ProgramMobileSidePane onClose={onClose}>
            {sidePane}
        </ProgramMobileSidePane>
    );
}

export default ResponsiveProgramSidePane;
