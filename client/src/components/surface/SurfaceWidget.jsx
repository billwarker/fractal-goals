import React, { useMemo } from 'react';

import { getWidgetDefinition } from './widgetRegistry';
import AnalyticsWidget from './widgets/AnalyticsWidget';
import CalendarWidget from './widgets/CalendarWidget';
import LastSessionWidget from './widgets/LastSessionWidget';
import MetricCardWidget from './widgets/MetricCardWidget';

/**
 * Renders one surface widget with shared chrome (title bar that doubles as the
 * drag handle in configure mode, plus a remove control). The body dispatches by
 * widgetType. Interactive body elements set data-no-panel-drag so they remain
 * clickable while the panel itself is draggable from its chrome.
 */
export default function SurfaceWidget({
    widgetType,
    state,
    onStateChange,
    sharedData,
    configureMode,
    onDragStart,
    onRemove,
}) {
    const def = getWidgetDefinition(widgetType);

    const body = useMemo(() => {
        switch (widgetType) {
            case 'analytics':
                return <AnalyticsWidget state={state} onStateChange={onStateChange} sharedData={sharedData} configureMode={configureMode} />;
            case 'calendar':
                return <CalendarWidget state={state} onStateChange={onStateChange} sharedData={sharedData} configureMode={configureMode} />;
            case 'lastSession':
                return <LastSessionWidget sharedData={sharedData} />;
            case 'metricCard':
                return <MetricCardWidget state={state} onStateChange={onStateChange} sharedData={sharedData} configureMode={configureMode} />;
            default:
                return <div className="surface-widget-empty">Unknown widget</div>;
        }
    }, [widgetType, state, onStateChange, sharedData, configureMode]);

    return (
        <div className="surface-widget">
            <div
                className="surface-widget-chrome"
                onMouseDown={configureMode ? onDragStart : undefined}
                style={{ cursor: configureMode ? 'grab' : 'default' }}
            >
                <span className="surface-widget-title">{def.name}</span>
                {configureMode && (
                    <button
                        type="button"
                        className="surface-widget-remove"
                        data-no-panel-drag="true"
                        aria-label={`Remove ${def.name}`}
                        onClick={onRemove}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        ×
                    </button>
                )}
            </div>
            <div className="surface-widget-body" data-no-panel-drag={configureMode ? undefined : 'true'}>
                {body}
            </div>
        </div>
    );
}
