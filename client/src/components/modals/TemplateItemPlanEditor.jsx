import React from 'react';
import { useParams } from 'react-router-dom';

import CircuitPrescriptionEditor from '../prescriptions/CircuitPrescriptionEditor';
import PrescriptionEditor from '../prescriptions/PrescriptionEditor';

/**
 * The "Planned values" editor for one template item: an activity's sets, tags and notes,
 * or a circuit's rounds. The open editor is the scoped item, so its note composer and tag
 * pickers are always live; clicking a set or round narrows them to it.
 */
export default function TemplateItemPlanEditor({ item, definition, circuit, activityById, idPrefix, onChange }) {
    const { rootId } = useParams();
    if (circuit) {
        return (
            <CircuitPrescriptionEditor
                circuit={circuit}
                activityById={activityById}
                value={item.prescription || null}
                idPrefix={idPrefix}
                onChange={onChange}
            />
        );
    }
    return (
        <PrescriptionEditor
            rootId={rootId}
            definition={definition}
            itemName={item.name || definition?.name}
            value={item.prescription || null}
            idPrefix={idPrefix}
            onChange={onChange}
        />
    );
}
