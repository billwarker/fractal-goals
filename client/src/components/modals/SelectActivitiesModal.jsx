import React, { useState } from 'react';
import useIsMobile from '../../hooks/useIsMobile';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import Button from '../atoms/Button';

/**
 * Modal for selecting activities to associate with a goal.
 * Similar interface to SelectExistingGoalModal but for activity definitions.
 */
function SelectActivitiesModal({
    isOpen,
    activityDefinitions = [],
    activityGroups = [],
    alreadyAssociatedActivityIds = [],
    onClose,
    onConfirm
}) {
    const [tempSelectedActivities, setTempSelectedActivities] = useState([]);
    const isMobile = useIsMobile();

    if (!isOpen) return null;

    const handleConfirm = () => {
        onConfirm(tempSelectedActivities);
        setTempSelectedActivities([]);
    };

    const handleClose = () => {
        setTempSelectedActivities([]);
        onClose();
    };

    // Group activities by their group
    const groupedActivities = {};
    const ungroupedActivities = [];

    activityDefinitions.forEach(activity => {
        if (activity.group_id) {
            if (!groupedActivities[activity.group_id]) {
                groupedActivities[activity.group_id] = [];
            }
            groupedActivities[activity.group_id].push(activity);
        } else {
            ungroupedActivities.push(activity);
        }
    });

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Associate Activities with Goal"
            size="md"
        >
            <ModalBody>
                <div style={{ paddingBottom: '16px' }}>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                        Select activities that this goal requires. Associated activities help track the "Achievable" criterion in SMART goals.
                    </p>

                    {activityDefinitions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--color-text-muted)' }}>
                            <p>No activities found. Create activities in the Manage Activities page.</p>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '16px',
                            maxHeight: isMobile ? '50vh' : '400px',
                            overflowY: 'auto',
                            paddingRight: '8px'
                        }}>
                            {/* Grouped activities */}
                            {activityGroups.map(group => {
                                const groupActivities = groupedActivities[group.id] || [];
                                if (groupActivities.length === 0) return null;

                                return (
                                    <div key={group.id}>
                                        <div style={{
                                            fontSize: '12px',
                                            color: 'var(--color-text-secondary)',
                                            marginBottom: '8px',
                                            paddingBottom: '4px',
                                            borderBottom: '1px solid var(--color-border)'
                                        }}>
                                            {group.name}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {groupActivities.map(activity => (
                                                <ActivitySelectionCard
                                                    key={activity.id}
                                                    activity={activity}
                                                    isSelected={tempSelectedActivities.includes(activity.id)}
                                                    isAlreadyAssociated={alreadyAssociatedActivityIds.includes(activity.id)}
                                                    onToggle={() => {
                                                        if (!alreadyAssociatedActivityIds.includes(activity.id)) {
                                                            setTempSelectedActivities(prev =>
                                                                prev.includes(activity.id)
                                                                    ? prev.filter(id => id !== activity.id)
                                                                    : [...prev, activity.id]
                                                            );
                                                        }
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Ungrouped activities */}
                            {ungroupedActivities.length > 0 && (
                                <div>
                                    <div style={{
                                        fontSize: '12px',
                                        color: 'var(--color-text-secondary)',
                                        marginBottom: '8px',
                                        paddingBottom: '4px',
                                        borderBottom: '1px solid var(--color-border)'
                                    }}>
                                        Ungrouped
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        {ungroupedActivities.map(activity => (
                                            <ActivitySelectionCard
                                                key={activity.id}
                                                activity={activity}
                                                isSelected={tempSelectedActivities.includes(activity.id)}
                                                isAlreadyAssociated={alreadyAssociatedActivityIds.includes(activity.id)}
                                                onToggle={() => {
                                                    if (!alreadyAssociatedActivityIds.includes(activity.id)) {
                                                        setTempSelectedActivities(prev =>
                                                            prev.includes(activity.id)
                                                                ? prev.filter(id => id !== activity.id)
                                                                : [...prev, activity.id]
                                                        );
                                                    }
                                                }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ModalBody>

            <ModalFooter>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexDirection: isMobile ? 'column-reverse' : 'row', width: '100%' }}>
                    <Button variant="secondary" onClick={handleClose} fullWidth={isMobile}>
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleConfirm}
                        disabled={tempSelectedActivities.length === 0}
                        fullWidth={isMobile}
                    >
                        Add Selected ({tempSelectedActivities.length})
                    </Button>
                </div>
            </ModalFooter>
        </Modal>
    );
}

function ActivitySelectionCard({ activity, isSelected, isAlreadyAssociated, onToggle }) {
    const hasMetrics = activity.metrics && activity.metrics.length > 0;

    return (
        <div
            onClick={onToggle}
            style={{
                background: isSelected ? '#2a4a2a' : '#1e1e1e',
                border: `2px solid ${isSelected ? '#4caf50' : (isAlreadyAssociated ? '#333' : '#444')}`,
                borderRadius: '6px',
                padding: '10px 14px',
                cursor: isAlreadyAssociated ? 'not-allowed' : 'pointer',
                opacity: isAlreadyAssociated ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
                if (!isAlreadyAssociated && !isSelected) {
                    e.currentTarget.style.borderColor = '#4caf50';
                }
            }}
            onMouseLeave={(e) => {
                if (!isAlreadyAssociated && !isSelected) {
                    e.currentTarget.style.borderColor = '#444';
                }
            }}
        >
            <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '4px',
                border: `2px solid ${isSelected ? '#4caf50' : '#666'}`,
                background: isSelected ? '#4caf50' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: 'bold',
                flexShrink: 0
            }}>
                {(isSelected || isAlreadyAssociated) && '✓'}
            </div>

            <div style={{ flex: 1 }}>
                <div style={{
                    fontWeight: 'bold',
                    fontSize: '14px',
                    color: isSelected || isAlreadyAssociated ? '#4caf50' : '#ccc',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    {activity.name}
                    {isAlreadyAssociated && (
                        <span style={{ fontSize: '11px', color: '#666', fontWeight: 'normal' }}>
                            (Already associated)
                        </span>
                    )}
                </div>
                {activity.description && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                        {activity.description}
                    </div>
                )}
                {hasMetrics && (
                    <div style={{
                        fontSize: '11px',
                        color: '#555',
                        marginTop: '4px',
                        display: 'flex',
                        gap: '8px',
                        flexWrap: 'wrap'
                    }}>
                        {activity.metrics.map((m, idx) => (
                            <span key={idx} style={{
                                background: '#2a2a2a',
                                padding: '2px 6px',
                                borderRadius: '3px'
                            }}>
                                {m.name} ({m.unit})
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default SelectActivitiesModal;
