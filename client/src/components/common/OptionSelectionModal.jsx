import React, { useMemo, useState } from 'react';

import Button from '../atoms/Button';
import Checkbox from '../atoms/Checkbox';
import Input from '../atoms/Input';
import Modal from '../atoms/Modal';
import ModalBody from '../atoms/ModalBody';
import ModalFooter from '../atoms/ModalFooter';
import styles from './OptionSelectionModal.module.css';

/**
 * Pick any number of named options from a list, with search for long lists. `options` are
 * `{ id, name, count?, group? }`: count shows as "N sessions"; options with a `group`
 * (`{ id, name, color }`) list under their group's header, whose checkbox picks the whole group.
 * `renderLabel(option)` draws an option (e.g. as a badge). Nothing changes until Apply; Clear
 * empties the selection.
 */
export default function OptionSelectionModal({
    isOpen,
    title,
    options = [],
    selectedIds = [],
    onApply,
    onClose,
    searchPlaceholder = 'Search…',
    countLabel = 'session',
    renderLabel = (option) => option.name,
}) {
    const [draft, setDraft] = useState(() => new Set(selectedIds));
    const [search, setSearch] = useState('');
    const visible = useMemo(() => {
        const needle = search.trim().toLocaleLowerCase();
        return needle ? options.filter((option) => option.name.toLocaleLowerCase().includes(needle)) : options;
    }, [options, search]);
    const toggle = (id) => setDraft((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
    });
    const setMany = (ids, on) => setDraft((current) => {
        const next = new Set(current);
        ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
        return next;
    });
    // Groups in first-appearance order; ungrouped options come last, without a header.
    const sections = useMemo(() => {
        const byGroup = new Map();
        visible.forEach((option) => {
            const key = option.group?.id || '';
            if (!byGroup.has(key)) byGroup.set(key, { group: option.group || null, options: [] });
            byGroup.get(key).options.push(option);
        });
        return [...byGroup.values()].sort((a, b) => Number(!a.group) - Number(!b.group));
    }, [visible]);
    const renderOption = (option) => (
        <Checkbox
            key={option.id}
            checked={draft.has(option.id)}
            onChange={() => toggle(option.id)}
            label={(
                <span className={styles.option}>
                    <span className={styles.optionLabel}>{renderLabel(option)}</span>
                    {option.count != null ? (
                        <span className={styles.count}>{option.count} {countLabel}{option.count === 1 ? '' : 's'}</span>
                    ) : null}
                </span>
            )}
        />
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
            <ModalBody>
                {options.length > 8 ? (
                    <Input
                        fullWidth
                        type="search"
                        value={search}
                        placeholder={searchPlaceholder}
                        aria-label={searchPlaceholder}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                ) : null}
                <div className={styles.list} role="group" aria-label={title}>
                    {sections.map(({ group, options: groupOptions }) => {
                        if (!group) return groupOptions.map(renderOption);
                        const ids = groupOptions.map((option) => option.id);
                        const allOn = ids.every((id) => draft.has(id));
                        return (
                            <div
                                key={group.id}
                                className={styles.group}
                                style={group.color ? { '--option-group-color': group.color } : undefined}
                                role="group"
                                aria-label={group.name}
                            >
                                <Checkbox
                                    checked={allOn}
                                    onChange={() => setMany(ids, !allOn)}
                                    aria-label={`All of ${group.name}`}
                                    label={<span className={styles.groupName}>{group.name}</span>}
                                />
                                <div className={styles.groupOptions}>{groupOptions.map(renderOption)}</div>
                            </div>
                        );
                    })}
                    {visible.length === 0 ? <p className={styles.empty}>No matches</p> : null}
                </div>
            </ModalBody>
            <ModalFooter align="between">
                <Button variant="ghost" size="sm" onClick={() => setDraft(new Set())} disabled={draft.size === 0}>Clear</Button>
                <div className={styles.actions}>
                    <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            // Keep the options' order, not the order they were ticked.
                            onApply(options.map((option) => option.id).filter((id) => draft.has(id)));
                            onClose();
                        }}
                    >
                        Apply
                    </Button>
                </div>
            </ModalFooter>
        </Modal>
    );
}
