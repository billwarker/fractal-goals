import React from 'react';

/**
 * GoalIcon Component
 * 
 * Renders a goal node icon matching the FlowTree graph style.
 * 
 * For SMART goals: concentric rings (primary color strokes, secondary color gaps, primary core)
 * For non-SMART goals: solid circle of the primary color
 * 
 * Color mapping (matches FlowTree CustomNode + favicon.svg geometry):
 *   - Rings/strokes: primary goal color (e.g. teal for MidTerm)
 *   - Gaps between rings: secondary goal color (lighter shade)
 *   - Inner core: primary goal color
 * 
 * @param {string} color - The primary goal color (ring strokes + core fill).
 * @param {string} secondaryColor - The secondary goal color (gap fill between rings).
 * @param {boolean} isSmart - Whether to render concentric SMART rings.
 * @param {number} size - Rendered size in pixels (default: 24).
 * @param {string} className - Optional CSS class.
 */
const GoalIcon = ({
    color = 'var(--color-primary)',
    secondaryColor = 'var(--color-bg-card)',
    isSmart = false,
    size = 24,
    className
}) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 30 30"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            {isSmart ? (
                <>
                    {/* Outer Ring: secondary fill, primary stroke */}
                    <circle cx="15" cy="15" r="13.75" fill={secondaryColor} stroke={color} strokeWidth="2.5" />
                    {/* Middle Ring: secondary fill, primary stroke */}
                    <circle cx="15" cy="15" r="8.75" fill={secondaryColor} stroke={color} strokeWidth="2.5" />
                    {/* Inner Core: solid primary */}
                    <circle cx="15" cy="15" r="5" fill={color} />
                </>
            ) : (
                /* Non-SMART: solid circle */
                <circle cx="15" cy="15" r="15" fill={color} />
            )}
        </svg>
    );
};

export default GoalIcon;
