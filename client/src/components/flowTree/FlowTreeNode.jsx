import { Handle, Position } from 'reactflow';

import AnimatedGoalIcon from '../atoms/AnimatedGoalIcon';
import GoalIcon from '../atoms/GoalIcon';
import GoalDueText from '../goals/GoalDueText';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { getISOYMDInTimezone } from '../../utils/dateUtils';
import { describeGoalDue } from '../../utils/goalDueFormat';
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

function GoalTiming({ timingLabel, deadline, today, isHierarchyLayout }) {
    const hasDue = Boolean(describeGoalDue(deadline, today));
    if (!timingLabel && !hasDue) return null;

    const content = (
        <>
            {timingLabel && <span>{timingLabel}</span>}
            {timingLabel && hasDue && <span className={styles.timingSeparator}>|</span>}
            <GoalDueText deadline={deadline} today={today} />
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
    const { timezone } = useTimezone();
    const today = getISOYMDInTimezone(new Date(), timezone || 'UTC');
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
                {data.sequencePosition != null ? (
                    <span className={styles.sequenceStepNumber} aria-label={`Step ${data.sequencePosition} in sequence`}>
                        {data.sequencePosition}
                    </span>
                ) : null}
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
                            <GoalTiming timingLabel={timingLabel} deadline={data.deadline} today={today} />
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
                            <GoalTiming timingLabel={timingLabel} deadline={data.deadline} today={today} isHierarchyLayout />
                            <AddChildButton data={data} as="span" />
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
