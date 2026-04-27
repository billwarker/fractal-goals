/**
 * Program utilities - Helper functions for program-related features
 */

/**
 * Check if a program block is currently active (today falls within the block's date range)
 * @param {Object} block - The program block object
 * @param {string} block.start_date - ISO date string for block start
 * @param {string} block.end_date - ISO date string for block end
 * @returns {boolean} - True if block is active, false otherwise
 */
export const isBlockActive = (block) => {
    if (!block?.start_date || !block?.end_date) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(block.start_date);
    const end = new Date(block.end_date);

    return today >= start && today <= end;
};

/**
 * Render an "Active" badge component for active blocks
 * @returns {JSX.Element} - The active badge component
 */
export const ActiveBlockBadge = () => (
    <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: '22px',
        padding: '0 8px',
        border: '1px solid color-mix(in srgb, var(--color-brand-success) 62%, var(--color-border))',
        borderRadius: '999px',
        background: 'color-mix(in srgb, var(--color-brand-success) 16%, transparent)',
        color: 'var(--color-brand-success)',
        fontSize: '11px',
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: 'nowrap',
    }}>
        Active
    </span>
);
