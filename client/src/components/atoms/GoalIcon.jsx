import React from 'react';

/**
 * GoalIcon Component
 * 
 * Renders a goal node icon matching the FlowTree graph style.
 * 
 * For SMART goals: concentric rings (primary color strokes, secondary color gaps, primary core)
 * For non-SMART goals: solid shape of the primary color
 * 
 * All three rings now use identical strokeWidth so the detailing lines
 * are visually uniform across every shape and every ring.
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
                    middle: <rect x="22" y="22" width="56" height="56" rx="6" />,
                    inner: <rect x="38" y="38" width="24" height="24" rx="4" />,
                    core: <rect x="46" y="46" width="8" height="8" rx="2" />,
                    full: <rect x="5" y="5" width="90" height="90" rx="8" />
                };
            case 'triangle':
                // Each ring is a proportional triangle, uniformly spaced so all strokes appear equal width.
                // Outer: full-size. Middle: ~55% area. Inner: ~25% area. Core: tiny dot.
                return {
                    // Centroid of outer triangle ≈ (50, 57).
                    // Each ring is scaled from the centroid so stroked edges have equal perpendicular spacing.
                    // Scale factors: outer=1.0, middle=0.60, inner=0.40
                    outer: <path d="M50 8 L93 82 L7 82 Z" />,
                    middle: <path d="M50 28 L76 72 L24 72 Z" />,
                    inner: <path d="M50 38 L67 67 L33 67 Z" />,
                    core: null,
                    full: <path d="M50 5 L95 85 L5 85 Z" />
                };
            case 'diamond':
                return {
                    outer: <path d="M50 5 L95 50 L50 95 L5 50 Z" />,
                    middle: <path d="M50 22 L78 50 L50 78 L22 50 Z" />,
                    inner: <path d="M50 37 L63 50 L50 63 L37 50 Z" />,
                    core: <circle cx="50" cy="50" r="5" />,
                    full: <path d="M50 5 L95 50 L50 95 L5 50 Z" />
                };
            case 'hexagon':
                return {
                    outer: <path d="M50 5 L93.3 30 L93.3 70 L50 95 L6.7 70 L6.7 30 Z" />,
                    middle: <path d="M50 21 L79.6 38 L79.6 62 L50 79 L20.4 62 L20.4 38 Z" />,
                    inner: <path d="M50 37 L66.2 46.5 L66.2 53.5 L50 63 L33.8 53.5 L33.8 46.5 Z" />,
                    core: <circle cx="50" cy="50" r="5" />,
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
                    core: <circle cx="50" cy="50" r="5" />,
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
                    core: <circle cx="50" cy="50" r="5" />,
                    full: <path d="M50 5 L64.5 35 L97 40 L73.5 63 L79 95 L50 80 L21 95 L26.5 63 L3 40 L35.5 35 Z" />
                };
            case 'check':
                return {
                    outer: <path d="M20 50 L40 70 L80 30" fill="none" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />,
                    middle: <path d="M25 50 L40 65 L75 30" fill="none" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />,
                    inner: <path d="M30 50 L40 60 L70 30" fill="none" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />,
                    core: null,
                    full: <path d="M20 50 L40 70 L80 30" fill="none" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
                };
            case 'circle':
            default:
                return {
                    outer: <circle cx="50" cy="50" r="44" />,
                    middle: <circle cx="50" cy="50" r="29" />,
                    inner: <circle cx="50" cy="50" r="15" />,
                    core: <circle cx="50" cy="50" r="5" />,
                    full: <circle cx="50" cy="50" r="44" />
                };
        }
    };

    const paths = getPath(shape);
    const isStrokeBased = shape.toLowerCase() === 'check';
    const STROKE_WIDTH = "5";

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
                    {/* Outer Ring — stroke only */}
                    {React.cloneElement(paths.outer, {
                        fill: isStrokeBased ? 'none' : secondaryColor,
                        stroke: color,
                        strokeWidth: isStrokeBased ? (paths.outer.props.strokeWidth || STROKE_WIDTH) : STROKE_WIDTH
                    })}
                    {/* Middle Ring — stroke only */}
                    {React.cloneElement(paths.middle, {
                        fill: isStrokeBased ? 'none' : secondaryColor,
                        stroke: color,
                        strokeWidth: isStrokeBased ? (paths.middle.props.strokeWidth || STROKE_WIDTH) : STROKE_WIDTH
                    })}
                    {/* Inner Ring — stroke only, same weight */}
                    {React.cloneElement(paths.inner, {
                        fill: isStrokeBased ? 'none' : secondaryColor,
                        stroke: color,
                        strokeWidth: isStrokeBased ? (paths.inner.props.strokeWidth || STROKE_WIDTH) : STROKE_WIDTH
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
