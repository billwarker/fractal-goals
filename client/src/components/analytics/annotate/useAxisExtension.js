import { useCallback, useEffect, useState } from 'react';

import { applyAxisExtension, canShrink, extendableEnds, growEnd, headroomExtension, shrinkEnd } from '../axisExtension';

const sameControls = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The extended axes while setting a goal: headroom on entering, more on request, gone on leaving.
 * Held on the chart instance rather than the panel's state, so it's never saved and never counts as
 * an edit. `placement` says where the plot sits in the surface, for the controls.
 */
export default function useAxisExtension({ chartRef, annotating, placement }) {
    const [extension, setExtension] = useState(headroomExtension);
    const [controls, setControls] = useState(null);
    const [wasAnnotating, setWasAnnotating] = useState(annotating);
    if (wasAnnotating !== annotating) {
        setWasAnnotating(annotating);
        if (!annotating) {
            setExtension(headroomExtension());
            setControls(null);
        }
    }

    // Watched frame by frame in the mode: the chart may not have mounted yet (it loads lazily and
    // after its data), and can be replaced, with nothing re-rendering this surface when it does.
    useEffect(() => {
        if (!annotating) {
            const chart = chartRef?.current;
            if (chart?.canvas) applyAxisExtension(chart, undefined, undefined);
            return undefined;
        }
        let frame = 0;
        const sync = () => {
            const chart = chartRef?.current;
            if (chart?.canvas) {
                applyAxisExtension(chart, extension, () => {
                    const where = placement();
                    if (!where?.area) return;
                    const next = { ends: extendableEnds(chart), offset: where.offset, area: {
                        left: where.area.left, right: where.area.right, top: where.area.top, bottom: where.area.bottom,
                    } };
                    setControls((current) => (sameControls(current, next) ? current : next));
                });
            }
            frame = requestAnimationFrame(sync);
        };
        sync();
        return () => cancelAnimationFrame(frame);
    }, [annotating, chartRef, extension, placement]);

    const extend = useCallback((axis, end) => setExtension((current) => growEnd(current, axis, end)), []);
    const shrink = useCallback((axis, end) => setExtension((current) => shrinkEnd(current, axis, end)), []);

    return {
        controls: annotating && controls ? {
            ...controls,
            shrinkable: {
                x: { low: canShrink(extension, 'x', 'low'), high: canShrink(extension, 'x', 'high') },
                y: { low: canShrink(extension, 'y', 'low'), high: canShrink(extension, 'y', 'high') },
            },
        } : null,
        extend,
        shrink,
        // The share of a running total's time axis to add as future dates.
        futureShare: annotating ? extension.x.high : 0,
    };
}
