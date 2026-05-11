import React from 'react';

function TimelineShell({
    className,
    modeToggleClassName,
    modeButtonClassName,
    modeButtonActiveClassName,
    bodyClassName,
    composerClassName,
    modes,
    activeMode,
    onModeChange,
    selector = null,
    children,
    composer = null,
}) {
    return (
        <div className={className}>
            {modes?.length > 0 && (
                <div className={modeToggleClassName}>
                    {modes.map((mode) => (
                        <button
                            key={mode.value}
                            type="button"
                            className={`${modeButtonClassName} ${activeMode === mode.value ? modeButtonActiveClassName : ''}`}
                            onClick={() => onModeChange(mode.value)}
                        >
                            {mode.label}
                        </button>
                    ))}
                </div>
            )}

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
