import React, { useId } from 'react';

/**
 * AnimatedGoalIcon Component
 *
 * Renders an animated SVG matching the specific static geometries of GoalIcon.
 * The "SMART mode ring/detailing" is brought to life as a continuous ripple tunnel
 * of the secondary color emerging from the solid primary core.
 */

// We use the exact path data from GoalIcon's "full" shape
const getBasePath = (s) => {
    switch (s.toLowerCase()) {
        case 'square': return <rect x="5" y="5" width="90" height="90" rx="8" />;
        case 'triangle': return <path d="M50 5 L95 85 L5 85 Z" />;
        case 'diamond': return <path d="M50 5 L95 50 L50 95 L5 50 Z" />;
        case 'hexagon': return <path d="M50 5 L93.3 30 L93.3 70 L50 95 L6.7 70 L6.7 30 Z" />;
        case 'twelvepointstar':
        case 'twelve-point-star': return (
            <g>
                <rect x="20" y="20" width="60" height="60" />
                <rect x="20" y="20" width="60" height="60" transform="rotate(30 50 50)" />
                <rect x="20" y="20" width="60" height="60" transform="rotate(60 50 50)" />
            </g>
        );
        case 'star': return <path d="M50 5 L64.5 35 L97 40 L73.5 63 L79 95 L50 80 L21 95 L26.5 63 L3 40 L35.5 35 Z" />;
        case 'check': return <path d="M20 50 L40 70 L80 30" fill="none" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />;
        case 'circle':
        default: return <circle cx="50" cy="50" r="45" />;
    }
};

const AnimatedGoalIcon = ({
    shape = 'circle',
    color = 'var(--color-primary)',
    secondaryColor = 'var(--color-bg-card)',
    isSmart = false,
    size = 24,
    className,
    style = {},
    reduced = false,
}) => {
    const uid = useId().replace(/:/g, '_');
    const pathElem = getBasePath(shape);
    const isStrokeBased = shape.toLowerCase() === 'check';

    const RING_LAYERS = 3;

    const buildKeyframes = () => `
@keyframes l_ripple_tunnel_${uid} {
  0% { transform: scale(0.01); stroke-width: 1px; opacity: 0; }
  10% { opacity: 1; stroke-width: 5px; }
  85% { stroke-width: 16px; opacity: 1; }
  100% { transform: scale(1.1); stroke-width: 20px; opacity: 0; }
}
`;

    const duration = reduced ? 3.5 : 2.5;
    const animatedRings = [];

    // Only generate the complex rippling rings for non-stroke shapes when isSmart is true
    if (!isStrokeBased && isSmart) {
        for (let i = 0; i < RING_LAYERS; i++) {
            const delay = (i / RING_LAYERS) * -duration;
            animatedRings.push(
                <g
                    key={i}
                    style={{
                        transformOrigin: '50px 50px',
                        animation: `l_ripple_tunnel_${uid} ${duration}s linear ${delay}s infinite`,
                        willChange: 'transform, stroke-width, opacity',
                    }}
                >
                    {React.cloneElement(pathElem, {
                        fill: 'none',
                        stroke: secondaryColor,
                    })}
                </g>
            );
        }
    }

    const baseCore = React.cloneElement(pathElem, {
        fill: isStrokeBased ? 'none' : color,
        stroke: isStrokeBased ? color : 'none',
        strokeWidth: isStrokeBased ? (pathElem.props.strokeWidth || '12') : '0',
    });

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: 'block', pointerEvents: 'none', overflow: 'visible', ...style }}
        >
            <style>{buildKeyframes()}</style>

            <defs>
                <mask id={`mask_${uid}`}>
                    {/* The mask geometry: solid white means fully opaque (visible) */}
                    {React.cloneElement(pathElem, { fill: 'white', stroke: 'none' })}
                </mask>
            </defs>

            {/* Render the Solid Primary Base FIRST so it is in the background */}
            {baseCore}

            {/* Render the SMART Detailing Ripples ON TOP of the base core,
                masked exactly to the solid shape's geometry! */}
            {!isStrokeBased && isSmart && (
                <g mask={`url(#mask_${uid})`}>
                    {animatedRings}
                </g>
            )}

            {/* Center Core Dot overlay for SMART goals */}
            {!isStrokeBased && isSmart && React.cloneElement(pathElem, {
                fill: color, // The very center is solid primary color again
                stroke: 'none',
                style: { transformOrigin: '50px 50px', transform: 'scale(0.18)' }
            })}

            {/* Optional Outer Border to sharply define the edge against the background */}
            {!isStrokeBased && React.cloneElement(pathElem, {
                fill: 'none',
                stroke: color,
                strokeWidth: '4',
            })}
        </svg>
    );
};

export default AnimatedGoalIcon;
