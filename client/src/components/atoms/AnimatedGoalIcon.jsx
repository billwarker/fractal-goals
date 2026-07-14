import React, { useId, useState } from 'react';

/**
 * AnimatedGoalIcon Component
 *
 * Renders an animated SVG matching the specific static geometries of GoalIcon.
 * The "SMART mode ring/detailing" is brought to life as a continuous ripple tunnel
 * of the secondary color emerging from the solid primary core. The twelve-point
 * star uses rotating, nested squares to match its static SMART detailing.
 */

// We use the exact path data from GoalIcon's "full" shape
const getBasePath = (s) => {
    switch (s.toLowerCase()) {
        case 'square': return <rect x="5" y="5" width="90" height="90" />;
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
    const normalizedShape = shape.toLowerCase();
    const isStrokeBased = normalizedShape === 'check';
    const isCircle = normalizedShape === 'circle';
    const isTriangle = normalizedShape === 'triangle';
    const isSquare = normalizedShape === 'square';
    const isTwelvePointStar = normalizedShape === 'twelvepointstar' || normalizedShape === 'twelve-point-star';
    const [trianglePhase, setTrianglePhase] = useState(0);

    const RING_LAYERS = 3;

    const squareFractalBaseSize = 15;
    const squareFractalGrowth = 1.45;
    const squareFractalSequence = Array.from({ length: 7 }, (_, index) => ({
        size: squareFractalBaseSize * (squareFractalGrowth ** index),
        rotation: index % 2 === 0 ? 45 : 0,
    }));
    const squareLayerInterval = reduced ? 1.4 : 1.0;
    const squareHoldAfter = reduced ? 1.6 : 1.2;
    const squarePhaseDuration = squareLayerInterval * squareFractalSequence.length + squareHoldAfter;
    const squareCycleDuration = squarePhaseDuration * 2;

    const squareFractalKeyframes = isSquare
        ? `
@keyframes l_square_fractal_sequence_${uid} {
${[secondaryColor, color].map((layerFill, phaseIndex) => (
        squareFractalSequence.map((layer, i) => {
            const elapsedStart = (phaseIndex * squarePhaseDuration) + (i * squareLayerInterval);
            const isFinalLayer = i === squareFractalSequence.length - 1;
            const elapsedEnd = isFinalLayer
                ? (phaseIndex + 1) * squarePhaseDuration
                : (phaseIndex * squarePhaseDuration) + ((i + 1) * squareLayerInterval);
            const stepStartPct = (elapsedStart / squareCycleDuration) * 100;
            const stepEndPct = ((elapsedEnd / squareCycleDuration) * 100) - 0.001;
            const transform = `rotate(${layer.rotation}deg) scale(${layer.size})`;
            return `  ${stepStartPct.toFixed(3)}%, ${stepEndPct.toFixed(3)}% { transform: ${transform}; fill: ${layerFill}; opacity: 1; }`;
        }).join('\n')
    )).join('\n')}
  100% { transform: rotate(${squareFractalSequence[0].rotation}deg) scale(${squareFractalSequence[0].size}); fill: ${secondaryColor}; opacity: 1; }
}
@keyframes l_square_fractal_base_${uid} {
  0%, 49.999% { fill: ${color}; }
  50%, 99.999% { fill: ${secondaryColor}; }
  100% { fill: ${color}; }
}`
        : '';

    const buildKeyframes = () => `
${!isTwelvePointStar && !isCircle && !isTriangle && !isSquare ? `
@keyframes l_ripple_tunnel_${uid} {
  0% { transform: scale(0.01); stroke-width: 1px; opacity: 0; }
  10% { opacity: 1; stroke-width: 5px; }
  85% { stroke-width: 16px; opacity: 1; }
  100% { transform: scale(1.1); stroke-width: 20px; opacity: 0; }
}
` : ''}
${isSquare ? squareFractalKeyframes : ''}
${isTriangle ? `
@keyframes l_triangle_center_grow_${uid} {
  from { transform: scale(0.001); }
  to { transform: scale(1); }
}
` : ''}
@keyframes l_square_rotate_cw_${uid} {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes l_square_rotate_ccw_${uid} {
  from { transform: rotate(0deg); }
  to { transform: rotate(-360deg); }
}
@keyframes l_globe_meridian_${uid} {
  0%   { transform: scaleX(1); }
  25%  { transform: scaleX(0); }
  50%  { transform: scaleX(-1); }
  75%  { transform: scaleX(0); }
  100% { transform: scaleX(1); }
}
`;

    const duration = reduced ? 3.5 : 2.5;
    const animatedRings = [];

    // Only generate the complex rippling rings for non-stroke shapes when isSmart is true.
    // The twelve-point star gets its own square-rotation detailing below.
    if (!isStrokeBased && isSmart && !isTwelvePointStar && !isCircle && !isTriangle && !isSquare) {
        for (let i = 0; i < RING_LAYERS; i++) {
            const delay = (i / RING_LAYERS) * -duration;
            animatedRings.push(
                <g
                    key={i}
                    style={{
                        transformOrigin: shape.toLowerCase() === 'triangle' ? '50px 58px' : '50px 50px',
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

    const buildTwelvePointStarLayer = (squareSize, layerIndex) => {
        const inset = (100 - squareSize) / 2;
        const clockwise = Math.floor(layerIndex / 2) % 2 === 0;
        const animationName = clockwise
            ? `l_square_rotate_cw_${uid}`
            : `l_square_rotate_ccw_${uid}`;

        const rotations = [0, 30, 60];
        const layerStyle = {
            transformOrigin: '50px 50px',
            transformBox: 'view-box',
            animation: `${animationName} ${reduced ? 7 : 4.8}s linear infinite`,
            willChange: 'transform',
        };

        const renderSquare = (baseRotation, squareIndex, rectProps) => (
            <g
                key={`${layerIndex}-${squareIndex}-${rectProps.fill || 'stroke'}`}
                style={{
                    transformOrigin: '50px 50px',
                    transformBox: 'view-box',
                    transform: `rotate(${baseRotation}deg)`,
                }}
            >
                <rect
                    x={inset}
                    y={inset}
                    width={squareSize}
                    height={squareSize}
                    strokeLinejoin="miter"
                    style={layerStyle}
                    {...rectProps}
                />
            </g>
        );

        return rotations.map((baseRotation, squareIndex) => (
            renderSquare(baseRotation, squareIndex, {
                fill: secondaryColor,
                stroke: color,
                strokeWidth: '5',
            })
        ));
    };

    const twelvePointStarDetail = isSmart && isTwelvePointStar ? (
        <>
            <g>{buildTwelvePointStarLayer(60, 0)}</g>
            <g mask={`url(#mask_${uid})`}>
                {[40, 20].map((squareSize, index) => (
                    buildTwelvePointStarLayer(squareSize, index + 1)
                ))}
            </g>
            <circle cx="50" cy="50" r="6" fill={secondaryColor} stroke="none" />
        </>
    ) : null;

    const squareFractalDetail = isSmart && isSquare ? (
        <g mask={`url(#mask_${uid})`}>
            <rect
                x="49.5"
                y="49.5"
                width="1"
                height="1"
                fill={secondaryColor}
                stroke="none"
                style={{
                    transformOrigin: '50px 50px',
                    transformBox: 'view-box',
                    opacity: 0,
                    animation: `l_square_fractal_sequence_${uid} ${squareCycleDuration}s linear infinite`,
                    animationTimingFunction: 'step-end',
                    willChange: 'transform, opacity',
                }}
            />
        </g>
    ) : null;

    const meridianCount = 4;
    const meridianDuration = reduced ? 20 : 14;
    const globeTilt = -18;

    const circleGlobeDetail = isSmart && isCircle ? (
        <g mask={`url(#mask_${uid})`}>
            <g
                style={{
                    transformOrigin: '50px 50px',
                    transformBox: 'view-box',
                    transform: `rotate(${globeTilt}deg)`,
                }}
            >
                {/* Latitude rings — static, evenly spaced across the sphere */}
                <g>
                    {[
                        { cy: 22, ry: 3,   rx: 30 },
                        { cy: 41, ry: 5.5, rx: 43 },
                        { cy: 59, ry: 5.5, rx: 43 },
                        { cy: 78, ry: 3,   rx: 30 },
                    ].map((lat, i) => (
                        <ellipse
                            key={`lat-${i}`}
                            cx="50"
                            cy={lat.cy}
                            rx={lat.rx}
                            ry={lat.ry}
                            fill="none"
                            stroke={color}
                            strokeWidth="3.5"
                        />
                    ))}
                </g>

                {/* Meridians — animated to simulate rotation around the vertical axis */}
                <g>
                    {Array.from({ length: meridianCount }).map((_, i) => {
                        const delay = -(i / meridianCount) * meridianDuration;
                        return (
                            <g
                                key={`mer-${i}`}
                                style={{
                                    transformOrigin: '50px 50px',
                                    transformBox: 'view-box',
                                    animation: `l_globe_meridian_${uid} ${meridianDuration}s linear ${delay}s infinite`,
                                    willChange: 'transform',
                                }}
                            >
                                <ellipse
                                    cx="50"
                                    cy="50"
                                    rx="44"
                                    ry="44"
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="4.5"
                                />
                            </g>
                        );
                    })}
                </g>
            </g>
        </g>
    ) : null;

    const triangleCentroidY = 175 / 3;
    const triangleGrowDuration = reduced ? 6 : 4;
    const triangleFlipped = trianglePhase % 2 === 1;
    const trianglePrimary = triangleFlipped ? secondaryColor : color;
    const triangleSecondary = triangleFlipped ? color : secondaryColor;
    const coverInvertedTrianglePoints = `50 165 -40 5 140 5`;

    const triangleTriforceDetail = isSmart && isTriangle ? (
        <g clipPath={`url(#clip_${uid})`}>
            <g
                key={trianglePhase}
                onAnimationEnd={() => setTrianglePhase((phase) => phase + 1)}
                style={{
                    transformOrigin: `50px ${triangleCentroidY}px`,
                    transformBox: 'view-box',
                    animation: `l_triangle_center_grow_${uid} ${triangleGrowDuration}s linear forwards`,
                    willChange: 'transform',
                }}
            >
                <polygon
                    points={coverInvertedTrianglePoints}
                    fill={triangleSecondary}
                    stroke="none"
                />
            </g>
        </g>
    ) : null;

    const baseCore = React.cloneElement(pathElem, {
        fill: isStrokeBased
            ? 'none'
            : isSmart && isCircle
                ? secondaryColor
                : (isSmart && isTriangle
                    ? trianglePrimary
                    : (isSmart && isTwelvePointStar ? secondaryColor : color)),
        stroke: isStrokeBased ? color : 'none',
        strokeWidth: isStrokeBased ? (pathElem.props.strokeWidth || '12') : '0',
        style: isSmart && isSquare
            ? {
                animation: `l_square_fractal_base_${uid} ${squareCycleDuration}s step-end infinite`,
                willChange: 'fill',
            }
            : undefined,
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
                <clipPath id={`clip_${uid}`}>
                    {React.cloneElement(pathElem, { fill: 'white', stroke: 'none' })}
                </clipPath>
            </defs>

            {/* Render the Solid Primary Base FIRST so it is in the background */}
            {baseCore}

            {/* Render the SMART Detailing Ripples ON TOP of the base core,
                masked exactly to the solid shape's geometry! */}
            {!isStrokeBased && isSmart && !isTwelvePointStar && !isCircle && !isTriangle && !isSquare && (
                <g mask={`url(#mask_${uid})`}>
                    {animatedRings}
                </g>
            )}
            {twelvePointStarDetail}
            {circleGlobeDetail}
            {triangleTriforceDetail}
            {squareFractalDetail}

            {/* Center Core Dot overlay for SMART goals */}
            {!isStrokeBased && isSmart && !isTwelvePointStar && !isCircle && !isTriangle && !isSquare && React.cloneElement(pathElem, {
                fill: color, // The very center is solid primary color again
                stroke: 'none',
                style: {
                    transformOrigin: normalizedShape === 'triangle' ? '50px 58px' : '50px 50px',
                    transform: 'scale(0.18)'
                }
            })}
            {/* Optional Outer Border to sharply define the edge against the background */}
            {!isStrokeBased && !(isSmart && isTwelvePointStar) && !(isSmart && isTriangle) && !(isSmart && isSquare) && React.cloneElement(pathElem, {
                fill: 'none',
                stroke: color,
                strokeWidth: isCircle ? '3' : '4',
            })}
        </svg>
    );
};

export default AnimatedGoalIcon;
