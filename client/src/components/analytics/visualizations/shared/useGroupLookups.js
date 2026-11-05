import { useMemo } from 'react';

import { useActivityTagCatalog } from '../../../../hooks/useActivityTagCatalog';
import { groupsOverlap, normalizeGroupBy } from '../../../../utils/analyticsGroupBy';

/**
 * A chart's group-by (only a dimension it declares), the lookups grouping needs (activities,
 * activity groups and sessions by id, from the page's full data), and whether its groups can
 * overlap, so the chart knows not to stack them.
 */
export default function useGroupLookups(context, dimensions) {
    const { activities, activityGroups, sessions } = context.data || {};
    const dimension = context.visualizationState?.groupBy?.dimension || null;
    const familyId = context.visualizationState?.groupBy?.familyId || null;
    // Built from its parts, so charts' memos only re-run when the choice changes.
    const groupBy = useMemo(() => normalizeGroupBy({ dimension, familyId }, dimensions), [dimension, familyId, dimensions]);
    const lookups = useMemo(() => ({
        activitiesById: new Map((activities || []).map((activity) => [activity.id, activity])),
        groupsById: new Map((activityGroups || []).map((group) => [group.id, group])),
        sessionsById: new Map((sessions || []).map((session) => [session.id, session])),
    }), [activities, activityGroups, sessions]);
    // Tag families decide whether tag groups can overlap (only single-select families can't).
    const { data: catalog } = useActivityTagCatalog(dimension === 'tag' ? context.data?.rootId : null);
    return { groupBy, lookups, overlap: groupsOverlap(groupBy, catalog.families) };
}
