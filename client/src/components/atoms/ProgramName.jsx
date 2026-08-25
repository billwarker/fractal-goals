import React from 'react';
import PropTypes from 'prop-types';

/** Renders a program name using its configured color across product surfaces. */
function ProgramName({ name, color }) {
    if (!name) return null;

    return <span style={{ color: color || 'var(--color-brand-primary)' }}>{name}</span>;
}

ProgramName.propTypes = {
    name: PropTypes.string,
    color: PropTypes.string,
};

export default ProgramName;
