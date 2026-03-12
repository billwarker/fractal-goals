import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { fractalApi } from '../utils/api';
import { invalidateGoalAssociationQueries } from '../components/goals/goalDetailQueryUtils';

function dedupeById(items) {
    return Array.from(new Map((items || []).map((item) => [item.id, item])).values());
}

function isDirectActivityAssociation(activity) {
    return activity?.has_direct_association !== false;
}

function arePrimitiveArraysEqual(left = [], right = []) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function areShallowObjectsEqual(left, right) {
    if (left === right) return true;
    if (!left || !right) return false;

    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key) => {
        const leftValue = left[key];
        const rightValue = right[key];

        if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
            return Array.isArray(leftValue)
                && Array.isArray(rightValue)
                && arePrimitiveArraysEqual(leftValue, rightValue);
        }

        return leftValue === rightValue;
    });
}

function areItemListsEquivalent(left = [], right = []) {
    if (left === right) return true;
    if (left.length !== right.length) return false;

    return left.every((item, index) => areShallowObjectsEqual(item, right[index]));
}

function useStableNormalizedList(items, normalize = (value) => value) {
    const stableRef = useRef([]);
    const normalized = useMemo(() => normalize(items || []), [items, normalize]);

    if (!areItemListsEquivalent(stableRef.current, normalized)) {
        stableRef.current = normalized;
    }

    return stableRef.current;
}

export function useGoalAssociationMutations({
    rootId,
    goalId,
    mode,
    isOpen,
    activityGroupsRaw,
    initialActivities = [],
    initialActivityGroups = [],
    fetchedActivities = [],
    fetchedGroups = [],
    onAssociationsChanged,
}) {
    const queryClient = useQueryClient();
    const normalizedActivityGroupsRaw = useStableNormalizedList(activityGroupsRaw);
    const normalizedInitialActivities = useStableNormalizedList(initialActivities, dedupeById);
    const normalizedInitialActivityGroups = useStableNormalizedList(initialActivityGroups, dedupeById);
    const normalizedFetchedActivities = useStableNormalizedList(fetchedActivities, dedupeById);
    const normalizedFetchedGroups = useStableNormalizedList(fetchedGroups, dedupeById);
    const [activityGroups, setActivityGroups] = useState(normalizedActivityGroupsRaw);
    const [associatedActivities, setAssociatedActivities] = useState([]);
    const [associatedActivityGroups, setAssociatedActivityGroups] = useState([]);
    const initialActivitiesRef = useRef([]);
    const initialGroupsRef = useRef([]);
    const associatedActivitiesRef = useRef([]);
    const associatedGroupsRef = useRef([]);

    useEffect(() => {
        // This hook owns a locally editable copy of activity groups and must resync on upstream prop changes.
        setActivityGroups(normalizedActivityGroupsRaw);
    }, [normalizedActivityGroupsRaw]);

    useEffect(() => {
        if (mode !== 'create') {
            return;
        }

        // Create mode intentionally rehydrates local editable association state when the modal opens or initial picks change.
        setAssociatedActivities(normalizedInitialActivities);
        setAssociatedActivityGroups(normalizedInitialActivityGroups);
        associatedActivitiesRef.current = normalizedInitialActivities;
        associatedGroupsRef.current = normalizedInitialActivityGroups;
        initialActivitiesRef.current = normalizedInitialActivities.map((activity) => activity.id);
        initialGroupsRef.current = normalizedInitialActivityGroups.map((group) => group.id);
    }, [mode, isOpen, normalizedInitialActivities, normalizedInitialActivityGroups]);

    useEffect(() => {
        associatedActivitiesRef.current = associatedActivities;
    }, [associatedActivities]);

    useEffect(() => {
        associatedGroupsRef.current = associatedActivityGroups;
    }, [associatedActivityGroups]);

    useEffect(() => {
        if (mode === 'create' || !goalId) {
            return;
        }

        // Edit mode intentionally mirrors fetched associations into local editable state when the backing goal changes.
        setAssociatedActivities(normalizedFetchedActivities);
        setAssociatedActivityGroups(normalizedFetchedGroups);
        initialActivitiesRef.current = normalizedFetchedActivities.map((activity) => activity.id);
        initialGroupsRef.current = normalizedFetchedGroups.map((group) => group.id);
    }, [normalizedFetchedActivities, normalizedFetchedGroups, mode, goalId]);

    const refreshAssociations = () => {
        if (mode === 'create' || !goalId) {
            return Promise.resolve();
        }

        return invalidateGoalAssociationQueries(queryClient, rootId, goalId);
    };

    const persistAssociations = async (updatedActivities, updatedGroups, overrideGoalId) => {
        const nextActivities = dedupeById(updatedActivities || associatedActivitiesRef.current || associatedActivities);
        const nextGroups = dedupeById(updatedGroups || associatedGroupsRef.current || associatedActivityGroups);
        const targetGoalId = overrideGoalId || goalId;

        if (!targetGoalId) {
            return false;
        }

        try {
            const activityIds = nextActivities
                .filter(isDirectActivityAssociation)
                .map((activity) => activity.id);
            const groupIds = nextGroups.map((group) => group.id);

            await fractalApi.setGoalAssociationsBatch(rootId, targetGoalId, {
                activity_ids: activityIds,
                group_ids: groupIds
            });

            await invalidateGoalAssociationQueries(queryClient, rootId, targetGoalId);

            initialActivitiesRef.current = activityIds;
            initialGroupsRef.current = groupIds;

            if (onAssociationsChanged) {
                onAssociationsChanged();
            }

            return true;
        } catch (error) {
            console.error('Error persisting activity associations:', error);
            return false;
        }
    };

    const attachInlineCreatedActivity = async (newActivity) => {
        if (!newActivity?.id) {
            return { associatedImmediately: false };
        }

        if (goalId) {
            await fractalApi.setActivityGoals(rootId, newActivity.id, [goalId]);
            await refreshAssociations();
            return { associatedImmediately: true };
        }

        setAssociatedActivities((prev) => dedupeById([...prev, newActivity]));
        return { associatedImmediately: false };
    };

    return {
        activityGroups,
        setActivityGroups,
        associatedActivities,
        setAssociatedActivities,
        associatedActivityGroups,
        setAssociatedActivityGroups,
        refreshAssociations,
        persistAssociations,
        attachInlineCreatedActivity,
    };
}
