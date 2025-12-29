import React, { useEffect, useRef } from 'react';
import Plotly from 'plotly.js-dist-min';

/**
 * Reusable Plotly chart component that handles direct Plotly.js rendering
 */
function PlotlyChart({ data, layout }) {
    const plotRef = useRef(null);

    useEffect(() => {
        if (plotRef.current && data && data.length > 0) {
            console.log('PlotlyChart useEffect - rendering plot');
            try {
                Plotly.newPlot(plotRef.current, data, layout, {
                    responsive: true,
                    displayModeBar: true,
                    displaylogo: false
                });
            } catch (error) {
                console.error('Error rendering Plotly chart:', error);
            }
        }

        // Cleanup
        return () => {
            if (plotRef.current) {
                Plotly.purge(plotRef.current);
            }
        };
    }, [data, layout]);

    return (
        <div
            ref={plotRef}
            style={{
                width: '100%',
                height: '100%',
                minHeight: '500px'
            }}
        />
    );
}

export default PlotlyChart;
