import React from 'react';
import FlowTree from '../FlowTree';

/**
 * FractalView - Container for the FlowTree goal visualization
 * 
 * NOTE: Sessions are NO LONGER displayed in the goal tree.
 * The showSessions toggle has been removed.
 */
const FractalView = ({
    treeData,
    ...props
}) => {
    const flowTreeRef = React.useRef();

    return (
        <FlowTree
            ref={flowTreeRef}
            treeData={treeData}
            {...props}
        />
    );
};

export default FractalView;

