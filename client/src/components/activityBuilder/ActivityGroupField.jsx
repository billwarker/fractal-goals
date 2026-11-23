import { useState } from 'react';

import Select from '../atoms/Select';
import { getGroupBreadcrumb, sortGroupsTreeOrder } from '../../utils/manageActivities';
import styles from '../ActivityBuilder.module.css';

/**
 * The builder's group choice. `scopeGroups` ({ ids, goalName }) are the scoped goal's groups. A
 * single one seeds the field and is named under it until the user picks another; a seeded group that
 * was deleted (or isn't loaded) reads as no group, so it never reaches the Select or the payload.
 */
export function useActivityGroupChoice(initialGroupId, scopeGroups, activityGroups) {
    const [groupId, setChosenGroupId] = useState(initialGroupId);
    const [fromScope, setFromScope] = useState(() => {
        const scopeIds = scopeGroups?.ids || [];
        return scopeIds.length === 1 && initialGroupId === String(scopeIds[0]);
    });
    const known = (activityGroups || []).some((group) => String(group.id) === String(groupId));
    const setGroupId = (nextGroupId) => {
        setChosenGroupId(nextGroupId);
        setFromScope(false);
    };
    return { groupId: fromScope && !known ? '' : groupId, scopeGoalName: fromScope && known ? scopeGroups.goalName : null, setGroupId };
}

/** With several scoped groups, they lead the list under the scoped goal's name. */
export default function ActivityGroupField({ activityGroups, groupId, scopeGoalName, scopeGroups, onChange }) {
    const sortedGroups = sortGroupsTreeOrder(activityGroups || []);
    const scopeIds = new Set((scopeGroups?.ids || []).map(String));
    const scopedGroups = scopeIds.size > 1 ? sortedGroups.filter((group) => scopeIds.has(String(group.id))) : [];
    const renderOption = (group) => (
        <option key={group.id} value={group.id}>
            {getGroupBreadcrumb(group.id, activityGroups)}
        </option>
    );
    return (
        <div>
            <Select label="Activity Group" value={groupId} onChange={onChange} fullWidth>
                <option value="">(No Group)</option>
                {scopedGroups.length > 0 ? (
                    <>
                        <optgroup label={`From ${scopeGroups.goalName}`}>{scopedGroups.map(renderOption)}</optgroup>
                        <optgroup label="All groups">
                            {sortedGroups.filter((group) => !scopeIds.has(String(group.id))).map(renderOption)}
                        </optgroup>
                    </>
                ) : sortedGroups.map(renderOption)}
                <option value="__create__">+ Create new activity group…</option>
            </Select>
            {scopeGoalName && <div className={styles.helperText}>From {scopeGoalName}&apos;s activity group</div>}
        </div>
    );
}
