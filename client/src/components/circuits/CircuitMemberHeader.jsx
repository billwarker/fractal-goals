import { SessionItemHeader, SessionItemHeaderLeft, SessionItemOrderRail } from '../sessionDetail/SessionItemCardPrimitives';
import InstanceGoalLinkControl from '../sessionDetail/InstanceGoalLinkControl';
import InstanceGoalIcons, { useInstanceLowestGoals } from '../sessionDetail/InstanceGoalIcons';
import activityStyles from '../sessionDetail/SessionActivityItem.module.css';
import styles from './CircuitRunCard.module.css';

/** Like an instance card: name, scoped link control and tags, then "Group • goal icons". */
export default function CircuitMemberHeader({ rootId, sessionId, instance, scope, isSelected, member, round, slot, groupLabel = null, tagEditor }) {
    const lowestGoals = useInstanceLowestGoals(rootId, sessionId, instance);
    return <>
        <SessionItemHeader className={styles.memberHeader}>
            <SessionItemHeaderLeft>
                <SessionItemOrderRail sessionIndex={`${round.round_number}.${member.sort_order + 1}`} />
                <div className={`${activityStyles.activityNameContainer} ${styles.memberIdentity}`} data-tag-width-boundary>
                    <span className={`${activityStyles.activityName} ${styles.memberName}`}>
                        <span>{slot?.activity_name || 'Activity'}</span>
                        {isSelected && instance && scope && <InstanceGoalLinkControl rootId={rootId} sessionId={sessionId} instance={instance} scope={scope} />}
                        {tagEditor && <span className={styles.memberTags}>{tagEditor}</span>}
                    </span>
                    {(groupLabel || lowestGoals.length > 0) && (
                        <div className={activityStyles.activityMetaLine}>
                            {groupLabel && <span className={activityStyles.activityGroupLabel}>{groupLabel}</span>}
                            {groupLabel && lowestGoals.length > 0 && <span className={activityStyles.activityMetaSeparator}>•</span>}
                            <InstanceGoalIcons goals={lowestGoals} directGoalIds={instance?.associated_goal_ids} />
                        </div>
                    )}
                </div>
            </SessionItemHeaderLeft>
        </SessionItemHeader>
    </>;
}
