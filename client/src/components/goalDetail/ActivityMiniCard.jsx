import React from 'react';

import styles from './ActivityAssociator.module.css';

const ActivityMiniCard = ({
    activity,
    isProtectedByGroup,
    onRemove,
    renderMetricIndicators,
}) => {
    const hasDirectAssociation = activity.has_direct_association !== false;
    const isInheritedOnly = Boolean(activity.is_inherited) && !hasDirectAssociation;
    const isAlsoInheritedFromChildren = hasDirectAssociation && Boolean(activity.inherited_from_children);
    const isAlsoInheritedFromParent = hasDirectAssociation && Boolean(activity.inherited_from_parent);
    const inheritedSourceNames = activity.inherited_source_goal_names || [];
    const childInheritanceLabel = inheritedSourceNames.length > 1
        ? `↑ Also inherited from ${inheritedSourceNames.length} child goals`
        : inheritedSourceNames[0]
            ? `↑ Also inherited from ${inheritedSourceNames[0]}`
            : '↑ Also inherited from a child goal';
    const parentInheritanceLabel = '↓ Also inherited from parent goal';
    const inheritedDirectionSymbol = activity.inherited_from_parent ? '↓' : '↑';
    const inheritedDirectionTitle = activity.inherited_from_parent
        ? 'Inherited from parent goal'
        : 'Inherited from child goal';

    const cardClasses = [
        styles.miniCard,
        isInheritedOnly && styles.miniCardInherited,
    ].filter(Boolean).join(' ');

    return (
        <div
            className={cardClasses}
            title={
                isInheritedOnly
                    ? `Inherited from ${activity.source_goal_name}`
                    : isAlsoInheritedFromChildren
                        ? `${activity.name} (also inherited from child goal)`
                        : activity.name
            }
        >
            <div className={styles.miniCardHeader}>
                <h4 className={styles.miniCardName}>
                    {isInheritedOnly && (
                        <span className={styles.inheritedIcon} title={inheritedDirectionTitle}>
                            {inheritedDirectionSymbol}
                        </span>
                    )}
                    {activity.name}
                </h4>
                {hasDirectAssociation && !isProtectedByGroup && (
                    <button
                        className={styles.removeBtn}
                        onClick={(event) => {
                            event.stopPropagation();
                            onRemove(activity.id);
                        }}
                        title={isAlsoInheritedFromChildren ? 'Remove direct association' : 'Remove association'}
                    >
                        ×
                    </button>
                )}
            </div>

            {isProtectedByGroup && (
                <span className={styles.groupLinkedNote}>
                    Included via linked group
                </span>
            )}

            {isAlsoInheritedFromChildren && (
                <span className={styles.childInheritedNote}>
                    {childInheritanceLabel}
                </span>
            )}

            {isAlsoInheritedFromParent && (
                <span className={styles.childInheritedNote}>
                    {parentInheritanceLabel}
                </span>
            )}

            {isInheritedOnly && (
                <span className={styles.inheritedBadge}>
                    {activity.inherited_from_parent ? '↓ inherited from parent' : '↑ inherited from child'}
                </span>
            )}

            {renderMetricIndicators(activity)}
        </div>
    );
};

export default ActivityMiniCard;
