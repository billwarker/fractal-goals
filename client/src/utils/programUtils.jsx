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
        background: '#2e7d32',
        color: 'white',
        padding: '2px 6px',
        borderRadius: '3px',
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase'
    }}>
        Active
    </span>
);
