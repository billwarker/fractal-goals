import React from 'react';

const badgeStyle = {
    fontSize: '11px',
    background: 'var(--color-bg-elevated)',
    color: 'var(--color-text-muted)',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    border: '1px solid var(--color-border)',
    display: 'inline-block',
    whiteSpace: 'nowrap'
};

export function DeletedBadge({ text = 'Deleted', style = {} }) {
    return (
        <span style={{ ...badgeStyle, ...style }}>
            {text}
        </span>
    );
}

const cardStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: 'var(--color-bg-card-alt)',
    border: '1px dashed var(--color-border)',
    borderRadius: '8px',
    opacity: 0.8,
    margin: '8px 0',
};

const textStyle = {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    fontStyle: 'italic',
};

const buttonStyle = {
    background: 'none',
    border: '1px solid var(--color-border)',
    padding: '4px 10px',
    borderRadius: '4px',
    color: 'var(--color-text-danger, #ef4444)',
    cursor: 'pointer',
    fontSize: '12px',
};

export function DeletedEntityCard({ entityName = 'Item', onDelete }) {
    return (
        <div style={cardStyle}>
            <span style={textStyle}>
                {entityName} not found (may have been deleted)
            </span>
            {onDelete && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    style={buttonStyle}
                    title={`Remove missing ${entityName.toLowerCase()}`}
                    onMouseOver={(e) => e.target.style.background = 'var(--color-bg-elevated)'}
                    onMouseOut={(e) => e.target.style.background = 'none'}
                >
                    Remove
                </button>
            )}
        </div>
    );
}
