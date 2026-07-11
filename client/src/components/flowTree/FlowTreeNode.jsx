import { Handle, Position } from 'reactflow';

import AnimatedGoalIcon from '../atoms/AnimatedGoalIcon';
import GoalIcon from '../atoms/GoalIcon';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getAgeLabel } from '../../utils/goalTiming';
import styles from '../../FlowTree.module.css';

const hiddenHandleStyle = {
    opacity: 0,
    width: 1,
    height: 1,
    minWidth: 1,
    minHeight: 1,
    border: 'none',
    background: 'transparent',
    pointerEvents: 'none',
};

function getDueTimeLabel(deadline) {
    if (!deadline) return null;
    const deadlineDate = new Date(deadline);
    const now = new Date();
    const diffMs = deadlineDate - now;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const isPast = diffDays < 0;
    const absDays = Math.abs(diffDays);

    let timeStr;
    if (absDays >= 365) {
        timeStr = `${(absDays / 365).toFixed(1)}y`;
    } else if (absDays >= 30) {
        timeStr = `${(absDays / 30.44).toFixed(1)}mo`;
    } else {
        timeStr = `${Math.ceil(absDays)}d`;
    }

    return isPast ? `-${timeStr}` : timeStr;
}

function getCompletedDateLabel(completedAt) {
    if (!completedAt) return null;
    const completedDate = new Date(completedAt);
    return `Completed: ${completedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(255, 215, 0, ${alpha})`;
    let r = 0;
    let g = 0;
    let b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function GoalTiming({ timingLabel, dueTime, isHierarchyLayout }) {
    if (!timingLabel && !dueTime) return null;

    const content = (
        <>
            {timingLabel && <span>{timingLabel}</span>}
            {timingLabel && dueTime && <span className={styles.timingSeparator}>|</span>}
            {dueTime && (
                <span className={dueTime.startsWith('-') ? styles.dueTimeOverdue : styles.dueTimeOnTime}>
                    Due: {dueTime}
                </span>
            )}
        </>
    );

    if (isHierarchyLayout) {
        return <span className={styles.hierarchyTimingGroup}>{content}</span>;
    }

    return <div className={styles.timingContainer}>{content}</div>;
}

function AddChildButton({ data, as = 'div' }) {
    if (!data.onAddChild || !data.childTypeName) return null;
    const Component = as;

    const button = (
        <Component
            className={styles.addChildButton}
            onClick={(event) => {
                event.stopPropagation();
                data.onAddChild();
            }}
        >
            + Add {data.childTypeName}
        </Component>
    );
    return button;
}

export default function FlowTreeNode({ data }) {
    const { getGoalColor, getGoalSecondaryColor, getLevelByName, getCompletionColor, getGoalIcon } = useGoalLevels();
    const { animatedIcons } = useTheme();
    const isCompleted = data.completed || false;
    const isSmartGoal = data.isSmart || false;
    const isHierarchyLayout = data.layoutMode === 'hierarchy';
    const goalForDisplay = data.goal || data.type;
    const completionChar = getLevelByName('Completed') || { icon: 'check' };
    const levelChar = { icon: getGoalIcon(goalForDisplay) };
    const config = isCompleted ? { ...completionChar, icon: levelChar.icon } : levelChar;
    const fillColor = isCompleted ? getCompletionColor() : getGoalColor(goalForDisplay);
    const isUltimate = data.type === 'UltimateGoal';
    const age = getAgeLabel(data.created_at);
    const dueTime = getDueTimeLabel(data.deadline);
    const timingLabel = age ? `Age: ${age}` : null;
    const smartRingFillColor = isCompleted
        ? getGoalSecondaryColor('Completed')
        : getGoalSecondaryColor(goalForDisplay);
    const glowColor = isCompleted ? hexToRgba(fillColor, 0.6) : null;
    const IconComponent = animatedIcons ? AnimatedGoalIcon : GoalIcon;
    const iconSize = isHierarchyLayout ? 22 : 30;
    const iconProps = animatedIcons
        ? { shape: config.icon, color: fillColor, secondaryColor: smartRingFillColor, isSmart: isSmartGoal, size: iconSize, reduced: true }
        : { shape: config.icon, color: fillColor, secondaryColor: smartRingFillColor, isSmart: isSmartGoal, size: iconSize };

    return (
        <div className={`${styles.nodeContainer} ${isHierarchyLayout ? styles.nodeContainerHierarchy : ''}`} data-has-evidence={data.hasEvidence ? 'true' : 'false'}>
            <div
                className={styles.nodeCircleWrapper}
                onClick={data.onClick}
                style={{
                    position: 'relative',
                    width: `${iconSize}px`,
                    height: `${iconSize}px`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                <IconComponent
                    {...iconProps}
                    className={isCompleted ? styles.nodeCircleCompleted : ''}
                    style={{ filter: isCompleted ? `drop-shadow(0 0 3px ${glowColor})` : undefined }}
                />
                <Handle
                    type="target"
                    position={isHierarchyLayout ? Position.Left : Position.Top}
                    isConnectable={false}
                    style={hiddenHandleStyle}
                />
                <Handle
                    type="source"
                    position={isHierarchyLayout ? Position.Left : Position.Bottom}
                    isConnectable={false}
                    style={hiddenHandleStyle}
                />
            </div>

            <div className={`${styles.nodeTextContainer} ${isHierarchyLayout ? styles.nodeTextContainerHierarchy : ''}`}>
                <div
                    className={`${styles.nodeLabel} ${isUltimate ? styles.nodeLabelUltimate : ''} ${data.label.length > 30 ? styles.nodeLabelLongText : ''} ${isHierarchyLayout ? styles.nodeLabelHierarchy : ''}`}
                    style={{ color: isCompleted ? fillColor : 'var(--color-text-primary)' }}
                    onClick={data.onClick}
                >
                    {data.label}
                </div>
                {!isHierarchyLayout && (
                    isCompleted ? (
                        <div className={styles.completedDateLabel} style={{ color: fillColor }}>
                            {getCompletedDateLabel(data.completed_at)}
                        </div>
                    ) : (
                        <>
                            <GoalTiming timingLabel={timingLabel} dueTime={dueTime} />
                            <AddChildButton data={data} />
                        </>
                    )
                )}
                {isHierarchyLayout && (
                    isCompleted ? (
                        <div className={styles.completedDateLabel} style={{ color: fillColor }}>
                            {getCompletedDateLabel(data.completed_at)}
                        </div>
                    ) : (
                        <div className={`${styles.timingContainer} ${styles.hierarchyMetaRow}`}>
                            <GoalTiming timingLabel={timingLabel} dueTime={dueTime} isHierarchyLayout />
                            <AddChildButton data={data} as="span" />
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
