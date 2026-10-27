import React from 'react';

import MediaAttachment from '../notes/MediaAttachment';

/** Previews of the finished pictures and video on a goal's description. */
export default function GoalDescriptionMedia({ draft, rootId }) {
    const ready = draft.items.filter((item) => item.status === 'ready');
    if (!ready.length) return null;
    return ready.map((item) => (
        <MediaAttachment key={item.key} rootId={rootId} asset={{ ...item, id: item.asset_id }} />
    ));
}
