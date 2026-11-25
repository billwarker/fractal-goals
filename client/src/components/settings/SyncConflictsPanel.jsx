import React from 'react';

import { useSyncConflicts } from '../../hooks/useSyncConflicts';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import SettingsSection from './SettingsSection';
import styles from './SyncConflictsPanel.module.css';

const ENTITY_LABELS = {
    goal: 'Goal', note: 'Note', program: 'Program', template: 'Template', activity: 'Activity', session: 'Session',
};
const FIELD_LABELS = { name: 'name', description: 'description', deadline: 'due date', content: 'text', color: 'colour' };

function Value({ label, value }) {
    return (
        <div>
            <dt>{label}</dt>
            <dd>{value || <em>Empty</em>}</dd>
        </div>
    );
}

/** Edits set aside because another device changed the same field later. */
function SyncConflictsPanel() {
    const { conflicts, dismiss, restore, isSaving } = useSyncConflicts();

    const run = async (action, conflict, failure) => {
        try {
            await action(conflict);
        } catch (error) {
            notify.error(error?.response?.status === 404 ? 'That item has been deleted.' : failure);
        }
    };

    return (
        <SettingsSection
            title="Edited in two places"
            description="These were changed on two devices before they could sync. The later edit was kept; the other is here in case you want it back."
        >
            <ul className={styles.list}>
                {conflicts.map((conflict) => {
                    const entity = ENTITY_LABELS[conflict.type] || conflict.type;
                    const title = `${entity}${conflict.entity_name ? ` “${conflict.entity_name}”` : ''}: ${FIELD_LABELS[conflict.field] || conflict.field}`;
                    return (
                        <li key={conflict.id} className={styles.item} aria-label={title}>
                            <h4 className={styles.title}>{title}</h4>
                            <dl className={styles.values}>
                                <Value label="Kept" value={conflict.kept_value} />
                                <Value label="Set aside" value={conflict.lost_value} />
                            </dl>
                            <div className={styles.actions}>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    disabled={isSaving}
                                    onClick={() => run(dismiss, conflict, "Couldn't save that. Please try again.")}
                                >
                                    Keep as is
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={isSaving}
                                    onClick={() => run(restore, conflict, "Couldn't restore that. Please try again.")}
                                >
                                    Use the other
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </SettingsSection>
    );
}

export default SyncConflictsPanel;
