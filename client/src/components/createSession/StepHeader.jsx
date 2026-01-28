import React from 'react';

/**
 * Reusable step header with numbered badge
 * Used across CreateSession flow for consistent visual styling
 */
function StepHeader({ stepNumber, title, subtitle }) {
    return (
        <>
            <h2 style={{
                fontSize: '20px',
                marginBottom: subtitle ? '8px' : '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
            }}>
                <span style={{
                    background: '#2196f3',
                    color: 'white',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold'
                }}>{stepNumber}</span>
                {title}
            </h2>
            {subtitle && (
                <p style={{ color: 'var(--color-text-muted)', fontSize: '13px', marginBottom: '16px', marginLeft: '36px' }}>
                    {subtitle}
                </p>
            )}
        </>
    );
}

export default StepHeader;
