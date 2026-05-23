import React from 'react';
import FlowTree from '../FlowTree';

/**
 * FractalView - Container for the FlowTree goal visualization
 * 
 * NOTE: Sessions are NO LONGER displayed in the goal tree.
 * The showSessions toggle has been removed.
 */
const FractalView = React.forwardRef(({
    treeData,
    ...props
}, ref) => {
    const flowTreeRef = React.useRef();

    React.useImperativeHandle(ref, () => ({
        startFadeOut: () => flowTreeRef.current?.startFadeOut?.(),
    }), []);

    return (
        <FlowTree
            ref={flowTreeRef}
            treeData={treeData}
            {...props}
        />
    );
});

FractalView.displayName = 'FractalView';

export default FractalView;
