import React from 'react';

function TimelineShell({
    className,
    bodyClassName,
    composerClassName,
    selector = null,
    children,
    composer = null,
}) {
    return (
        <div className={className}>
            {selector}

            <div className={bodyClassName}>
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
