import React from 'react';

import ProgramMobileSidePane from './ProgramMobileSidePane';
import ProgramSidePane from './ProgramSidePane';

function ResponsiveProgramSidePane({ isMobile, isVisible, onClose, ...sidePaneProps }) {
    if (!isVisible) return null;

    const sidePane = <ProgramSidePane {...sidePaneProps} onCollapse={onClose} />;
    if (!isMobile) return sidePane;

    return (
        <ProgramMobileSidePane onClose={onClose}>
            {sidePane}
        </ProgramMobileSidePane>
    );
}

export default ResponsiveProgramSidePane;
