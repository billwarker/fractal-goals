import React from 'react';

function TimelineShell({
    className,
    bodyClassName,
    composerClassName,
    selector = null,
    bodyRef = null,
    children,
    composer = null,
}) {
    return (
        <div className={className}>
            {selector}

            <div ref={bodyRef} className={bodyClassName}>
                {children}
            </div>

            {composer && (
                <div className={composerClassName}>
                    {composer}
                </div>
            )}
        </div>
    );
}

export default TimelineShell;
