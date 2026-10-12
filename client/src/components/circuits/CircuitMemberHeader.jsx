import { SessionItemHeader, SessionItemHeaderLeft, SessionItemHeaderRight, SessionItemOrderRail } from '../sessionDetail/SessionItemCardPrimitives';
import InstanceGoalLinkControl from '../sessionDetail/InstanceGoalLinkControl';
import activityStyles from '../sessionDetail/SessionActivityItem.module.css';
import styles from './CircuitRunCard.module.css';

export default function CircuitMemberHeader({ rootId, sessionId, instance, scope, member, round, slot, tagEditor }) {
    return <>
        <SessionItemHeader className={styles.memberHeader}>
            <SessionItemHeaderLeft>
                <SessionItemOrderRail sessionIndex={`${round.round_number}.${member.sort_order + 1}`} />
                <div className={`${activityStyles.activityNameContainer} ${styles.memberIdentity}`}>
                    <span className={`${activityStyles.activityName} ${styles.memberName}`}>
                        <span>{slot?.activity_name || 'Activity'}</span>
                        {instance?.progress_comparison?.included === false ? <span className={styles.memberExcluded}>Excluded</span> : null}
                    </span>
                </div>
            </SessionItemHeaderLeft>
            {tagEditor || (instance && scope) ? (
                <SessionItemHeaderRight>
                    {instance && scope && <InstanceGoalLinkControl rootId={rootId} sessionId={sessionId} instance={instance} scope={scope} />}
                    {tagEditor}
                </SessionItemHeaderRight>
            ) : null}
        </SessionItemHeader>
    </>;
}
