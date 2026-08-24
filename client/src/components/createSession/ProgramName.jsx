import React from 'react';

function ProgramName({ name, color }) {
    if (!name) return null;

    return (
        <span
            style={{ color: color || 'var(--color-brand-primary)' }}
        >
            {name}
        </span>
    );
}

export default ProgramName;
