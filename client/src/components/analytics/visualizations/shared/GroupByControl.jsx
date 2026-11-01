import React from 'react';

import { useActivityTagCatalog } from '../../../../hooks/useActivityTagCatalog';
import { GROUP_DIMENSION_LABELS, normalizeGroupBy } from '../../../../utils/analyticsGroupBy';

/**
 * "Group by" for charts that declare `capabilities.groupBy`: one of those dimensions, and for tags,
 * optionally one tag family (a series per tag in it, plus Untagged).
 */
export default function GroupByControl({ context, dimensions }) {
    const groupBy = normalizeGroupBy(context.visualizationState.groupBy, dimensions);
    const { data: catalog } = useActivityTagCatalog(groupBy?.dimension === 'tag' ? context.rootId : null);
    if (!dimensions?.length) return null;
    const families = catalog.families || [];
    return (
        <>
            <label className="sessions-query-field" style={{ marginTop: 12 }}>
                <span>Group by</span>
                <select
                    value={groupBy?.dimension || ''}
                    onChange={(event) => context.updateVisualizationState({
                        groupBy: event.target.value ? { dimension: event.target.value } : null,
                    })}
                >
                    <option value="">Nothing</option>
                    {dimensions.map((dimension) => (
                        <option key={dimension} value={dimension}>{GROUP_DIMENSION_LABELS[dimension]}</option>
                    ))}
                </select>
            </label>
            {groupBy?.dimension === 'tag' && families.length > 0 ? (
                <label className="sessions-query-field" style={{ marginTop: 8 }}>
                    <span>Tag family</span>
                    <select
                        value={groupBy.familyId || ''}
                        onChange={(event) => context.updateVisualizationState({
                            groupBy: { dimension: 'tag', familyId: event.target.value || null },
                        })}
                    >
                        <option value="">Any tag</option>
                        {families.map((family) => <option key={family.id} value={family.id}>{family.name}</option>)}
                    </select>
                </label>
            ) : null}
        </>
    );
}
