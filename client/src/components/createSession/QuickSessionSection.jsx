import React, { useMemo, useState } from 'react';

import { MAX_QUICK_SESSION_ACTIVITIES, canAddQuickActivity } from '../../utils/createSessionQuickDraft';
import CloseIcon from '../atoms/CloseIcon';
import { Heading } from '../atoms/Typography';
import SectionHeader from '../common/SectionHeader';
import PlanItemPicker from '../prescriptions/PlanItemPicker';
import PlanItemRow from '../prescriptions/PlanItemRow';
import PrescriptionEditor from '../prescriptions/PrescriptionEditor';
import { isCardBackgroundClick, isItemSurfaceClick, shouldScopeOnFocus } from '../prescriptions/usePlanRowSelection';
import styles from './QuickSessionSection.module.css';

const NO_SCOPE = { key: null, setIndex: null };

/**
 * The quick session being logged: its activities in the program-day plan's item rows and
 * editors, with values entered as logged values (no timers, tags, notes or completion per
 * activity: everything completes with the session). An activity repeated from a past quick session
 * shows last time's values as placeholders.
 */
function QuickSessionSection({
    rootId,
    draft,
    activityDefinitions,
    activityGroups,
    onAddActivity,
    onRemoveActivity,
    onMoveActivity,
    onChangeValue,
}) {
    // What is scoped, as on a plan card: an item, optionally narrowed to one of its sets.
    const [scope, setScope] = useState(NO_SCOPE);
    const definitionById = useMemo(
        () => new Map((activityDefinitions || []).map((definition) => [definition.id, definition])),
        [activityDefinitions],
    );
    const items = draft?.items || [];
    const scopeItem = (key) => setScope((current) => (current.key === key ? current : { ...NO_SCOPE, key }));

    return (
        <section
            className={styles.section}
            aria-labelledby="quick-session-activities"
            onClick={(event) => { if (isCardBackgroundClick(event)) setScope(NO_SCOPE); }}
        >
            <SectionHeader
                className={styles.header}
                title={(
                    <Heading level={3} id="quick-session-activities" className={styles.title}>
                        Activities
                    </Heading>
                )}
                meta={items.length > 0 ? (
                    <span className={styles.count}>{items.length} / {MAX_QUICK_SESSION_ACTIVITIES}</span>
                ) : null}
            />

            {items.length === 0 ? (
                <p className={styles.empty}>
                    Add what you did. Every activity is completed when you complete the session.
                </p>
            ) : (
                <div className={styles.list}>
                    {items.map((item, index) => {
                        const definition = definitionById.get(item.activity_definition_id);
                        const selected = scope.key === item.key;
                        return (
                            <PlanItemRow
                                key={item.key}
                                name={item.name || definition?.name}
                                selected={selected}
                                onClick={(event) => {
                                    if (isItemSurfaceClick(event)) setScope({ ...NO_SCOPE, key: item.key });
                                    else scopeItem(item.key);
                                }}
                                onFocus={(event) => { if (shouldScopeOnFocus(event)) scopeItem(item.key); }}
                                actions={(
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => onMoveActivity(index, -1)}
                                            disabled={index === 0}
                                            aria-label={`Move ${item.name} up`}
                                        >↑</button>
                                        <button
                                            type="button"
                                            onClick={() => onMoveActivity(index, 1)}
                                            disabled={index === items.length - 1}
                                            aria-label={`Move ${item.name} down`}
                                        >↓</button>
                                        <button
                                            type="button"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                setScope(NO_SCOPE);
                                                onRemoveActivity(item.key);
                                            }}
                                            aria-label={`Remove ${item.name}`}
                                        ><CloseIcon size={12} /></button>
                                    </>
                                )}
                            >
                                {definition ? (
                                    <PrescriptionEditor
                                        rootId={rootId}
                                        definition={definition}
                                        itemName={item.name}
                                        value={item.value}
                                        previous={item.previous}
                                        onChange={(value) => onChangeValue(item.key, value)}
                                        idPrefix={`quick-${item.key}`}
                                        active={selected}
                                        selectedSetIndex={selected ? scope.setIndex : null}
                                        onSelectSet={(setIndex) => setScope({ key: item.key, setIndex })}
                                        valueKind="logged"
                                        allowTags={false}
                                        allowNotes={false}
                                    />
                                ) : (
                                    <p className={styles.empty}>This activity was deleted and will be left out.</p>
                                )}
                            </PlanItemRow>
                        );
                    })}
                </div>
            )}

            {canAddQuickActivity(draft) ? (
                <PlanItemPicker
                    rootId={rootId}
                    activities={activityDefinitions}
                    activityGroups={activityGroups}
                    allowCircuits={false}
                    onAdd={onAddActivity}
                />
            ) : (
                <p className={styles.empty} role="status">
                    A quick session holds up to {MAX_QUICK_SESSION_ACTIVITIES} activities.
                </p>
            )}
        </section>
    );
}

export default QuickSessionSection;
