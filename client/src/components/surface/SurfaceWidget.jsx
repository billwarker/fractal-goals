import React, { useMemo } from 'react';

import RemoveButton from '../atoms/RemoveButton';
import { getWidgetDefinition } from './widgetRegistry';
import AnalyticsWidget, { AnalyticsWidgetHeaderControls, AnalyticsWidgetHeaderTitle } from './widgets/AnalyticsWidget';
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
    viewMode = 'overview',
    configureMode,
    onDragStart,
    onRemove,
}) {
    const def = getWidgetDefinition(widgetType);

    const body = useMemo(() => {
        switch (widgetType) {
            case 'analytics':
                return <AnalyticsWidget state={state} sharedData={sharedData} viewMode={viewMode} />;
            case 'calendar':
                return <CalendarWidget state={state} onStateChange={onStateChange} sharedData={sharedData} configureMode={configureMode} />;
            case 'lastSession':
                return <LastSessionWidget sharedData={sharedData} />;
            case 'metricCard':
                return <MetricCardWidget state={state} onStateChange={onStateChange} sharedData={sharedData} configureMode={configureMode} />;
            default:
                return <div className="surface-widget-empty">Unknown widget</div>;
        }
    }, [widgetType, state, sharedData, viewMode, configureMode, onStateChange]);

    const headerControls = useMemo(() => {
        if (widgetType !== 'analytics' || !configureMode) {
            return null;
        }
        return (
            <AnalyticsWidgetHeaderControls
                state={state}
                onStateChange={onStateChange}
                sharedData={sharedData}
            />
        );
    }, [configureMode, onStateChange, sharedData, state, widgetType]);

    const title = widgetType === 'analytics' && !configureMode ? (
        <AnalyticsWidgetHeaderTitle
            baseTitle={def.name}
            state={state}
            sharedData={sharedData}
        />
    ) : def.name;

    return (
        <div className="surface-widget">
            <div
                className="surface-widget-chrome"
                onMouseDown={configureMode ? onDragStart : undefined}
                style={{ cursor: configureMode ? 'grab' : 'default' }}
            >
                <span className="surface-widget-title">{title}</span>
                {headerControls ? (
                    <div className="surface-widget-header-controls">
                        {headerControls}
                    </div>
                ) : null}
                {configureMode && (
                    <RemoveButton
                        className="surface-widget-remove"
                        data-no-panel-drag="true"
                        aria-label={`Remove ${def.name}`}
                        onClick={onRemove}
                        onMouseDown={(e) => e.stopPropagation()}
                    />
                )}
            </div>
            <div className="surface-widget-body" data-no-panel-drag={configureMode ? undefined : 'true'}>
                {body}
            </div>
        </div>
    );
}
