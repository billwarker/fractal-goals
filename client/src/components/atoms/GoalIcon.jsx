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
    shape = 'circle',
    color = 'var(--color-primary)',
    secondaryColor = 'var(--color-bg-card)',
    isSmart = false,
    size = 24,
    className,
    style = {}
}) => {
    const viewBox = "0 0 100 100";

    const getPath = (s) => {
        switch (s.toLowerCase()) {
            case 'square':
                return {
                    outer: <rect x="5" y="5" width="90" height="90" rx="8" />,
                    middle: <rect x="20" y="20" width="60" height="60" rx="6" />,
                    inner: <rect x="35" y="35" width="30" height="30" rx="4" />,
                    full: <rect x="5" y="5" width="90" height="90" rx="8" />
                };
            case 'triangle':
                return {
                    outer: <path d="M50 5 L95 85 L5 85 Z" />,
                    middle: <path d="M50 25 L80 80 L20 80 Z" />,
                    inner: <path d="M50 45 L65 75 L35 75 Z" />,
                    full: <path d="M50 5 L95 85 L5 85 Z" />
                };
            case 'diamond':
                return {
                    outer: <path d="M50 5 L95 50 L50 95 L5 50 Z" />,
                    middle: <path d="M50 20 L80 50 L50 80 L20 50 Z" />,
                    inner: <path d="M50 35 L65 50 L50 65 L35 50 Z" />,
                    full: <path d="M50 5 L95 50 L50 95 L5 50 Z" />
                };
            case 'hexagon':
                return {
                    outer: <path d="M50 5 L93.3 30 L93.3 70 L50 95 L6.7 70 L6.7 30 Z" />,
                    middle: <path d="M50 20 L80.6 37.5 L80.6 62.5 L50 80 L19.4 62.5 L19.4 37.5 Z" />,
                    inner: <path d="M50 35 L67.9 45 L67.9 55 L50 65 L32.1 55 L32.1 45 Z" />,
                    full: <path d="M50 5 L93.3 30 L93.3 70 L50 95 L6.7 70 L6.7 30 Z" />
                };
            case 'twelvepointstar':
            case 'twelve-point-star':
                return {
                    outer: (
                        <g>
                            <rect x="20" y="20" width="60" height="60" />
                            <rect x="20" y="20" width="60" height="60" transform="rotate(30 50 50)" />
                            <rect x="20" y="20" width="60" height="60" transform="rotate(60 50 50)" />
                        </g>
                    ),
                    middle: (
                        <g>
                            <rect x="30" y="30" width="40" height="40" />
                            <rect x="30" y="30" width="40" height="40" transform="rotate(30 50 50)" />
                            <rect x="30" y="30" width="40" height="40" transform="rotate(60 50 50)" />
                        </g>
                    ),
                    inner: (
                        <g>
                            <rect x="40" y="40" width="20" height="20" />
                            <rect x="40" y="40" width="20" height="20" transform="rotate(30 50 50)" />
                            <rect x="40" y="40" width="20" height="20" transform="rotate(60 50 50)" />
                        </g>
                    ),
                    full: (
                        <g>
                            <rect x="20" y="20" width="60" height="60" />
                            <rect x="20" y="20" width="60" height="60" transform="rotate(30 50 50)" />
                            <rect x="20" y="20" width="60" height="60" transform="rotate(60 50 50)" />
                        </g>
                    )
                };
            case 'star':
                return {
                    outer: <path d="M50 5 L64.5 35 L97 40 L73.5 63 L79 95 L50 80 L21 95 L26.5 63 L3 40 L35.5 35 Z" />,
                    middle: <path d="M50 20 L59.5 40 L81 43 L65.5 58.5 L69 80 L50 70 L31 80 L34.5 58.5 L19 43 L40.5 40 Z" />,
                    inner: <path d="M50 35 L54.5 45 L65 46.5 L57.5 54 L59 65 L50 60 L41 65 L42.5 54 L35 46.5 L45.5 45 Z" />,
                    full: <path d="M50 5 L64.5 35 L97 40 L73.5 63 L79 95 L50 80 L21 95 L26.5 63 L3 40 L35.5 35 Z" />
                };
            case 'check':
                return {
                    outer: <path d="M20 50 L40 70 L80 30" fill="none" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />,
                    middle: <path d="M25 50 L40 65 L75 30" fill="none" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />,
                    inner: <path d="M30 50 L40 60 L70 30" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />,
                    full: <path d="M20 50 L40 70 L80 30" fill="none" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
                };
            case 'circle':
            default:
                return {
                    outer: <circle cx="50" cy="50" r="45" />,
                    middle: <circle cx="50" cy="50" r="30" />,
                    inner: <circle cx="50" cy="50" r="15" />,
                    full: <circle cx="50" cy="50" r="45" />
                };
        }
    };

    const paths = getPath(shape);

    const isStrokeBased = shape.toLowerCase() === 'check';

    return (
        <svg
            width={size}
            height={size}
            viewBox={viewBox}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: 'block', pointerEvents: 'none', ...style }}
        >
            {isSmart ? (
                <>
                    {/* Outer Ring */}
                    {React.cloneElement(paths.outer, {
                        fill: isStrokeBased ? 'none' : secondaryColor,
                        stroke: color,
                        strokeWidth: isStrokeBased ? (paths.outer.props.strokeWidth || "5") : "5"
                    })}
                    {/* Middle Ring */}
                    {React.cloneElement(paths.middle, {
                        fill: isStrokeBased ? 'none' : secondaryColor,
                        stroke: color,
                        strokeWidth: isStrokeBased ? (paths.middle.props.strokeWidth || "5") : "5"
                    })}
                    {/* Inner Core */}
                    {React.cloneElement(paths.inner, {
                        fill: isStrokeBased ? 'none' : color,
                        stroke: isStrokeBased ? color : 'none',
                        strokeWidth: isStrokeBased ? (paths.inner.props.strokeWidth || "5") : "0"
                    })}
                </>
            ) : (
                /* Non-SMART: solid shape */
                React.cloneElement(paths.full, {
                    fill: isStrokeBased ? 'none' : color,
                    stroke: isStrokeBased ? color : 'none',
                    strokeWidth: isStrokeBased ? (paths.full.props.strokeWidth || "12") : "0"
                })
            )}
        </svg>
    );
};

export default GoalIcon;
