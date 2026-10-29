import { useState } from 'react';

import Select from '../atoms/Select';
import { getGroupBreadcrumb, sortGroupsTreeOrder } from '../../utils/manageActivities';
import styles from '../ActivityBuilder.module.css';

/**
 * The builder's group choice. `initialGroup` ({ id, goalName }) is the scoped goal's group: it is
 * named under the field until the user picks another, and a seeded group that was deleted (or
 * isn't loaded) reads as no group, so it never reaches the Select or the payload.
 */
export function useActivityGroupChoice(initialGroupId, initialGroup, activityGroups) {
    const [groupId, setChosenGroupId] = useState(initialGroupId);
    const [fromScope, setFromScope] = useState(
        Boolean(initialGroup?.id) && initialGroupId === String(initialGroup.id)
    );
    const known = (activityGroups || []).some((group) => String(group.id) === String(groupId));
    const setGroupId = (nextGroupId) => {
        setChosenGroupId(nextGroupId);
        setFromScope(false);
    };
    return { groupId: fromScope && !known ? '' : groupId, scopeGoalName: fromScope && known ? initialGroup.goalName : null, setGroupId };
}

export default function ActivityGroupField({ activityGroups, groupId, scopeGoalName, onChange }) {
    return (
        <div>
            <Select label="Activity Group" value={groupId} onChange={onChange} fullWidth>
                <option value="">(No Group)</option>
                {sortGroupsTreeOrder(activityGroups || []).map((group) => (
                    <option key={group.id} value={group.id}>
                        {getGroupBreadcrumb(group.id, activityGroups)}
                    </option>
                ))}
                <option value="__create__">+ Create new activity group…</option>
            </Select>
            {scopeGoalName && <div className={styles.helperText}>From {scopeGoalName}&apos;s activity group</div>}
        </div>
    );
}
