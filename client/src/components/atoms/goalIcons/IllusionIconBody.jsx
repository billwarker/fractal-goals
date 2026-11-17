import React, { useEffect, useRef, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const prefersReducedMotion = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_QUERY).matches
);

function useReducedMotion() {
    const [reduced, setReduced] = useState(prefersReducedMotion);
    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
        const query = window.matchMedia(REDUCED_MOTION_QUERY);
        const onChange = () => setReduced(query.matches);
        query.addEventListener?.('change', onChange);
        return () => query.removeEventListener?.('change', onChange);
    }, []);
    return reduced;
}

// SMIL loops. Each node's attributes start at its first animated value, so without these
// elements (static icons, reduced motion) the icon rests on its first frame.
const renderAnims = (anims, keyPrefix) => anims.map((anim, index) => {
    const timing = {
        values: anim.values.join(';'),
        keyTimes: anim.keyTimes?.join(';'),
        calcMode: anim.calcMode || 'linear',
        dur: `${anim.dur}s`,
        repeatCount: 'indefinite',
    };
    const key = `${keyPrefix}-anim-${index}`;
    return anim.type
        ? <animateTransform key={key} attributeName={anim.attr} type={anim.type} {...timing} />
        : <animate key={key} attributeName={anim.attr} {...timing} />;
});

const firstValue = (anims, attr) => anims?.find((anim) => anim.attr === attr && !anim.type)?.values[0];

/**
 * SVG contents for an impossible-figure goal icon (see illusionShapes.js). Non-SMART goals get the
 * solid silhouette; SMART goals get the detailed scene, looping when `animated`.
 */
const IllusionIconBody = ({ shape, color, secondaryColor, isSmart, animated, uid }) => {
    const reducedMotion = useReducedMotion();
    const playing = animated && isSmart && !reducedMotion;
    const defsRef = useRef(null);

    // SMIL runs on the <svg>'s own clock, and browsers (Safari especially) don't reliably start
    // <animate> elements added after that clock is running — e.g. when the icon turns SMART or
    // its shape arrives once data loads. Start every loop explicitly, together, so they stay in
    // phase with each other.
    useEffect(() => {
        const svg = defsRef.current?.ownerSVGElement;
        if (!playing || !svg) return;
        svg.unpauseAnimations?.();
        svg.querySelectorAll('animate, animateTransform').forEach((anim) => anim.beginElement?.());
    }, [playing, shape]);
    const tone = (token) => (token === 'p' ? color : token === 's' ? secondaryColor : token);

    if (!isSmart) {
        // Hooks above always run; the silhouette has nothing to animate.
        return shape.silhouette.map((entry, index) => (typeof entry === 'string'
            ? <path key={index} d={entry} fill={color} fillRule="evenodd" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
            : <path key={index} d={entry.d} fill="none" stroke={color} strokeWidth={entry.sw} strokeLinecap="butt" />));
    }

    const renderNode = (node, key) => {
        if (node.g) {
            return (
                <g key={key} clipPath={node.clip ? `url(#clip_${uid}_${node.clip})` : undefined}>
                    {playing && node.anims ? renderAnims(node.anims, key) : null}
                    {node.g.map((child, index) => renderNode(child, `${key}-${index}`))}
                </g>
            );
        }
        return (
            <path
                key={key}
                d={firstValue(node.anims, 'd') ?? node.d}
                opacity={firstValue(node.anims, 'opacity')}
                fill={tone(node.fill)}
                fillRule="evenodd"
                stroke={tone(node.stroke)}
                strokeWidth={node.sw}
                strokeLinejoin={node.join || 'round'}
                strokeLinecap={node.cap}
                pathLength={node.pathLength}
                strokeDasharray={node.dash}
                strokeDashoffset={firstValue(node.anims, 'stroke-dashoffset')}
            >
                {playing && node.anims ? renderAnims(node.anims, key) : null}
            </path>
        );
    };

    return (
        <>
            <defs ref={defsRef}>
                {Object.entries(shape.clips || {}).map(([id, d]) => (
                    <clipPath key={id} id={`clip_${uid}_${id}`}>
                        <path d={d} clipRule="evenodd" />
                    </clipPath>
                ))}
            </defs>
            {shape.nodes.map((node, index) => renderNode(node, `n${index}`))}
        </>
    );
};

export default IllusionIconBody;
