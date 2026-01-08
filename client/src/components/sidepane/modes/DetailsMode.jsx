/**
 * DetailsMode - Shows details/properties for the current context
 */

import React from 'react';
import { useSidePane } from '../SidePaneContext';
import { format } from 'date-fns';

const DetailsMode = () => {
    const { activeContext } = useSidePane();

    if (!activeContext) {
        return (
            <div className="details-mode-empty">
                <p>Select an item to view details</p>
            </div>
        );
    }

    const details = activeContext.details;
    const type = activeContext.type;

    if (!details) {
        return (
            <div className="details-mode-empty">
                <p>No details available</p>
            </div>
        );
    }

    // Render based on context type
    switch (type) {
        case 'session':
            return <SessionDetails details={details} />;
        case 'goal':
            return <GoalDetails details={details} />;
        case 'activity_instance':
            return <ActivityInstanceDetails details={details} />;
        case 'program':
            return <ProgramDetails details={details} />;
        case 'program_day':
            return <ProgramDayDetails details={details} />;
        default:
            return <GenericDetails details={details} />;
    }
};

// Session details component
const SessionDetails = ({ details }) => {
    const formatTime = (dt) => {
        if (!dt) return '—';
        try {
            return format(new Date(dt), 'MMM d, yyyy h:mm a');
        } catch {
            return '—';
        }
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '—';
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hours > 0) return `${hours}h ${mins}m`;
        return `${mins}m`;
    };

    return (
        <div className="details-mode session-details">
            <DetailItem label="Start Time" value={formatTime(details.startTime)} />
            <DetailItem label="End Time" value={formatTime(details.endTime)} />
            <DetailItem label="Duration" value={formatDuration(details.duration)} />
            {details.template && (
                <DetailItem label="Template" value={details.template} />
            )}
            <DetailItem label="Activities" value={details.activitiesCount || 0} />
        </div>
    );
};

// Goal details component
const GoalDetails = ({ details }) => {
    const formatDate = (dt) => {
        if (!dt) return '—';
        try {
            return format(new Date(dt), 'MMM d, yyyy');
        } catch {
            return '—';
        }
    };

    return (
        <div className="details-mode goal-details">
            <DetailItem label="Type" value={details.type?.replace('Goal', ' Goal')} />
            {details.description && (
                <DetailItem label="Description" value={details.description} />
            )}
            <DetailItem label="Deadline" value={formatDate(details.deadline)} />
            <DetailItem
                label="Status"
                value={details.completed ? '✅ Completed' : '⏳ In Progress'}
            />
            {details.completedAt && (
                <DetailItem label="Completed" value={formatDate(details.completedAt)} />
            )}
            <DetailItem label="Children" value={details.childCount || 0} />

            {details.targets && details.targets.length > 0 && (
                <div className="details-section">
                    <h4>Targets</h4>
                    {details.targets.map((target, i) => (
                        <div key={i} className="target-item">
                            {target.name}: {target.current || 0} / {target.target}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Activity instance details component
const ActivityInstanceDetails = ({ details }) => {
    const formatDuration = (seconds) => {
        if (!seconds) return '—';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="details-mode activity-details">
            <DetailItem label="Duration" value={formatDuration(details.duration)} />

            {details.sets && details.sets.length > 0 && (
                <div className="details-section">
                    <h4>Sets ({details.sets.length})</h4>
                    {details.sets.map((set, i) => (
                        <div key={i} className="set-item">
                            Set {i + 1}: {formatSetMetrics(set)}
                        </div>
                    ))}
                </div>
            )}

            {details.metrics && details.metrics.length > 0 && (
                <div className="details-section">
                    <h4>Metrics</h4>
                    {details.metrics.map((metric, i) => (
                        <div key={i} className="metric-item">
                            {metric.name}: {metric.value} {metric.unit}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// Program details component
const ProgramDetails = ({ details }) => {
    const formatDate = (dt) => {
        if (!dt) return '—';
        try {
            return format(new Date(dt), 'MMM d, yyyy');
        } catch {
            return '—';
        }
    };

    return (
        <div className="details-mode program-details">
            <DetailItem label="Start Date" value={formatDate(details.startDate)} />
            <DetailItem label="End Date" value={formatDate(details.endDate)} />
            <DetailItem
                label="Status"
                value={details.isActive ? '🟢 Active' : '⚪ Inactive'}
            />
            <DetailItem label="Blocks" value={details.blocksCount || 0} />
        </div>
    );
};

// Program day details component
const ProgramDayDetails = ({ details }) => {
    const formatDate = (dt) => {
        if (!dt) return '—';
        try {
            return format(new Date(dt), 'MMM d, yyyy');
        } catch {
            return '—';
        }
    };

    return (
        <div className="details-mode program-day-details">
            <DetailItem label="Date" value={formatDate(details.date)} />
            {details.name && <DetailItem label="Name" value={details.name} />}
            <DetailItem
                label="Status"
                value={details.isCompleted ? '✅ Completed' : '⏳ Pending'}
            />
            <DetailItem label="Templates" value={details.templatesCount || 0} />
        </div>
    );
};

// Generic details component
const GenericDetails = ({ details }) => {
    return (
        <div className="details-mode generic-details">
            {Object.entries(details).map(([key, value]) => (
                <DetailItem
                    key={key}
                    label={formatLabel(key)}
                    value={formatValue(value)}
                />
            ))}
        </div>
    );
};

// Helper: Detail item component
const DetailItem = ({ label, value }) => (
    <div className="detail-item">
        <span className="detail-label">{label}</span>
        <span className="detail-value">{value}</span>
    </div>
);

// Helper: Format set metrics
const formatSetMetrics = (set) => {
    if (!set || !set.metrics) return '—';
    return set.metrics.map(m => `${m.value}${m.unit}`).join(' × ');
};

// Helper: Format label from camelCase
const formatLabel = (key) => {
    return key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim();
};

// Helper: Format value for display
const formatValue = (value) => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
};

export default DetailsMode;
