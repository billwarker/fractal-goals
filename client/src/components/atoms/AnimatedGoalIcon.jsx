import React, { useId } from 'react';

/**
 * AnimatedGoalIcon Component
 *
 * Renders an animated, fractal-style SVG for each goal shape.
 * Multiple scaled/rotated copies of the shape spin and pulse
 * with alternating primary and secondary colours to create
 * a psychedelic, kaleidoscopic effect.
 *
 * Same prop interface as GoalIcon for drop-in compatibility.
 */

const LAYER_COUNT = 6;

// Build a path/element for each shape at a given scale (0-1)
const shapeElement = (shape, scale, key) => {
    const cx = 50;
    const cy = 50;
    const s = scale;

    switch (shape) {
        case 'square': {
            const half = 40 * s;
            const rx = 6 * s;
            return <rect key={key} x={cx - half} y={cy - half} width={half * 2} height={half * 2} rx={rx} />;
        }
        case 'triangle': {
            const h = 80 * s;
            const base = 80 * s;
            const topY = cy - h * 0.55;
            const botY = cy + h * 0.45;
            return <path key={key} d={`M${cx} ${topY} L${cx + base / 2} ${botY} L${cx - base / 2} ${botY} Z`} />;
        }
        case 'diamond': {
            const r = 45 * s;
            return <path key={key} d={`M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`} />;
        }
        case 'hexagon': {
            const r = 45 * s;
            const pts = [];
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i - Math.PI / 2;
                pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
            }
            return <polygon key={key} points={pts.join(' ')} />;
        }
        case 'star': {
            const outerR = 45 * s;
            const innerR = 20 * s;
            const pts = [];
            for (let i = 0; i < 10; i++) {
                const angle = (Math.PI / 5) * i - Math.PI / 2;
                const r = i % 2 === 0 ? outerR : innerR;
                pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
            }
            return <polygon key={key} points={pts.join(' ')} />;
        }
        case 'twelvepointstar':
        case 'twelve-point-star': {
            const half = 28 * s;
            return (
                <g key={key}>
                    <rect x={cx - half} y={cy - half} width={half * 2} height={half * 2} />
                    <rect x={cx - half} y={cy - half} width={half * 2} height={half * 2} transform={`rotate(30 ${cx} ${cy})`} />
                    <rect x={cx - half} y={cy - half} width={half * 2} height={half * 2} transform={`rotate(60 ${cx} ${cy})`} />
                </g>
            );
        }
        case 'circle':
        default: {
            const r = 42 * s;
            return <circle key={key} cx={cx} cy={cy} r={r} />;
        }
    }
};

const AnimatedGoalIcon = ({
    shape = 'circle',
    color = 'var(--color-primary)',
    secondaryColor = 'var(--color-bg-card)',
    size = 24,
    className,
    style = {},
    reduced = false,
}) => {
    const uid = useId().replace(/:/g, '_');
    const layerCount = reduced ? 4 : LAYER_COUNT;

    // Generate animation keyframes as inline style element
    const buildKeyframes = () => {
        let css = '';
        for (let i = 0; i < layerCount; i++) {
            const dir = i % 2 === 0 ? 1 : -1;
            const duration = reduced ? 12 + i * 3 : 8 + i * 2;
            const scaleMin = 0.92 - i * 0.02;
            const scaleMax = 1.08 + i * 0.02;

            css += `
@keyframes fractal_spin_${uid}_${i} {
  0% {
    transform: rotate(0deg) scale(${scaleMin});
  }
  50% {
    transform: rotate(${dir * 180}deg) scale(${scaleMax});
  }
  100% {
    transform: rotate(${dir * 360}deg) scale(${scaleMin});
  }
}
`;
        }

        // Pulse glow for the innermost layer
        css += `
@keyframes fractal_pulse_${uid} {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
`;
        return css;
    };

    const layers = [];
    for (let i = 0; i < layerCount; i++) {
        const t = i / (layerCount - 1); // 0 = outermost, 1 = innermost
        const scale = 1.0 - t * 0.55; // outer=1.0, inner=0.45
        const isPrimary = i % 2 === 0;
        const fillColor = isPrimary ? color : secondaryColor;
        const opacity = 0.75 + t * 0.25; // outer=0.75, inner=1.0
        const initialRotation = i * (360 / layerCount / 2);
        const duration = reduced ? 12 + i * 3 : 8 + i * 2;

        layers.push(
            <g
                key={i}
                style={{
                    transformOrigin: '50px 50px',
                    animation: `fractal_spin_${uid}_${i} ${duration}s ease-in-out infinite`,
                    willChange: 'transform',
                }}
                transform={`rotate(${initialRotation} 50 50)`}
                fill={fillColor}
                fillOpacity={opacity}
                stroke={isPrimary ? secondaryColor : color}
                strokeWidth={2.5}
                strokeOpacity={1}
            >
                {shapeElement(shape.toLowerCase(), scale, `layer-${i}`)}
            </g>
        );
    }

    // Innermost core — fully solid, with pulse
    const coreDuration = reduced ? 6 : 4;
    layers.push(
        <g
            key="core"
            style={{
                transformOrigin: '50px 50px',
                animation: `fractal_pulse_${uid} ${coreDuration}s ease-in-out infinite`,
            }}
            fill={color}
            fillOpacity={1}
        >
            {shapeElement(shape.toLowerCase(), 0.22, 'core')}
        </g>
    );

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={{ display: 'block', pointerEvents: 'none', ...style }}
        >
            <style>{buildKeyframes()}</style>
            {layers}
        </svg>
    );
};

export default AnimatedGoalIcon;
