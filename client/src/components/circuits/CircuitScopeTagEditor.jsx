import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import useAnchoredPortalPosition from '../../hooks/useAnchoredPortalPosition';
import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import { canonicalTagName, findTagByName } from '../../utils/tagNames';
import { groupTagsForPicker } from '../../utils/tagPickerOptions';
import Badge from '../atoms/Badge';
import Button from '../atoms/Button';
import CloseButton from '../atoms/CloseButton';
import useTagCountOverflow from '../sessionDetail/useTagCountOverflow';
import styles from '../sessionDetail/ActivityTagEditor.module.css';

const DEFAULT_TAG_COLOR = '#64748B';


function CircuitScopeTagEditor({
    className = '',
    scopeLabel,
    tags = [],
    // The fractal tag catalog ({families, tags}); any tag can scope any circuit.
    availableTags = null,
    disabled = false,
    editable = true,
    triggerFirst = false,
    onChange,
}) {
    const editorRef = useRef(null);
    const pickerRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState('');
    const [color, setColor] = useState(DEFAULT_TAG_COLOR);
    const [search, setSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const selectedIds = useMemo(() => new Set(tags.map((tag) => tag.definition_id)), [tags]);
    const catalogTags = useMemo(() => {
        const byId = new Map((availableTags?.tags || []).map((tag) => [tag.id, tag]));
        tags.forEach((tag) => {
            if (!byId.has(tag.definition_id)) byId.set(tag.definition_id, { id: tag.definition_id, name: tag.name, color: tag.color });
        });
        return [...byId.values()];
    }, [availableTags, tags]);
    const groups = useMemo(() => groupTagsForPicker(
        { families: availableTags?.families || [], tags: catalogTags },
        { keepIds: selectedIds, search },
    ), [availableTags, catalogTags, search, selectedIds]);
    const assignableCount = catalogTags.filter((tag) => !tag.archived).length;
    const nameMatch = findTagByName(catalogTags, name);
    const tagOverflow = useTagCountOverflow(tags, editable);

    useAnchoredPortalPosition({
        open: editable && isOpen,
        anchorRef: tagOverflow.triggerRef,
        overlayRef: pickerRef,
        margin: 16,
        maxWidth: 260,
        estimatedHeight: 320,
    });

    useEffect(() => {
        if (!editable && isOpen) {
            setIsOpen(false);
            setSearch('');
        }
    }, [editable, isOpen]);

    const close = useCallback(({ restoreFocus = true } = {}) => {
        setIsOpen(false);
        setSearch('');
        if (restoreFocus) requestAnimationFrame(() => tagOverflow.triggerRef.current?.focus());
    }, [tagOverflow.triggerRef]);

    useEffect(() => {
        if (!isOpen) return undefined;
        requestAnimationFrame(() => pickerRef.current?.querySelector('input, button')?.focus());
        const onPointerDown = (event) => {
            if (!editorRef.current?.contains(event.target) && !pickerRef.current?.contains(event.target)) {
                close({ restoreFocus: false });
            }
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') close();
            if (event.key !== 'Tab' || !pickerRef.current) return;
            const focusable = [...pickerRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [close, isOpen]);

    const persist = async (tagName, assigned, tagColor = null, definitionId = null) => {
        setIsSaving(true);
        try {
            const result = await onChange({ name: tagName, color: tagColor, assigned, ...(definitionId ? { definition_id: definitionId } : {}) });
            if (result?.error) throw new Error(result.error);
            setName('');
            setColor(DEFAULT_TAG_COLOR);
        } catch (error) {
            notify.error(`Failed to update ${scopeLabel.toLocaleLowerCase()}: ${formatError(error)}`);
        } finally {
            setIsSaving(false);
        }
    };
    const addTagTrigger = editable ? (
        <Button
            ref={tagOverflow.triggerRef}
            variant="secondary"
            size="sm"
            className={styles.addTag}
            disabled={disabled || isSaving}
            aria-label={`Add ${scopeLabel.toLocaleLowerCase()}`}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            onClick={() => (isOpen ? close() : setIsOpen(true))}
        >
            <span className={styles.addTagIcon} aria-hidden="true">+</span>
            Tag
        </Button>
    ) : null;

    return (
        <div
            ref={editorRef}
            className={`${styles.editor} ${styles.instanceEditor} ${styles.scopeEditor} ${className}`}
            role="group"
            aria-label={scopeLabel}
            onClick={(event) => event.stopPropagation()}
        >
            <div className={styles.tags} ref={tagOverflow.containerRef}>
                {triggerFirst ? addTagTrigger : null}
                <span className={styles.measure} ref={tagOverflow.measureRef} aria-hidden="true">
                    {tags.map((tag) => (
                        <span
                            key={`measure-${tag.id || tag.name}`}
                            className={`${styles.choice} ${styles.selected} ${styles.measureItem}`}
                            data-tag-label={tag.name}
                        />
                    ))}
                </span>
                {tagOverflow.isSummaryVisible && tags.length > 0 ? (
                    <Badge
                        size="sm"
                        className={`${styles.choice} ${styles.selected} ${styles.summary}`}
                        aria-label={`${tagOverflow.countLabel} assigned`}
                        title={tags.map((tag) => tag.name).join(', ')}
                    >
                        {tagOverflow.countLabel}
                    </Badge>
                ) : tags.map((tag) => (
                    <label
                        key={tag.definition_id || tag.id || tag.name}
                        className={`${styles.choice} ${styles.selected}`}
                        title={tag.name}
                        style={tag.color ? { '--tag-color': tag.color } : undefined}
                    >
                        <input
                            type="checkbox"
                            checked
                            disabled={disabled || isSaving || !editable}
                            onChange={() => void persist(tag.name, false, tag.color, tag.definition_id)}
                        />
                        {tag.name}
                    </label>
                ))}
                {triggerFirst ? null : addTagTrigger}
            </div>
            {editable && isOpen && createPortal(
                <div
                    ref={pickerRef}
                    className={styles.picker}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Choose ${scopeLabel.toLocaleLowerCase()}`}
                >
                    <div className={styles.pickerHeader}>
                        <span>Choose tags</span>
                        <CloseButton
                            size={14}
                            buttonSize="sm"
                            className={styles.pickerClose}
                            aria-label="Close tag picker"
                            onClick={() => close()}
                        />
                    </div>
                    {assignableCount > 5 && (
                        <input
                            className={styles.pickerSearch}
                            type="search"
                            aria-label={`Search ${scopeLabel.toLocaleLowerCase()}`}
                            placeholder="Search tags"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                        />
                    )}
                    <div className={styles.pickerOptions}>
                        {groups.length ? groups.map((group) => (
                            <section key={group.key} className={styles.pickerGroup} aria-label={group.label}>
                                <h4>
                                    {group.label}
                                    {group.singleSelect ? <span className={styles.pickOne}>Single select · replaces its sibling</span> : null}
                                </h4>
                                {group.tags.map((tag) => {
                                    const selected = selectedIds.has(tag.id);
                                    return (
                                        <label
                                            key={tag.id}
                                            className={styles.pickerOption}
                                            style={tag.color ? { '--tag-color': tag.color } : undefined}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                disabled={disabled || isSaving}
                                                onChange={() => void persist(tag.name, !selected, tag.color, tag.id)}
                                            />
                                            <span className={styles.pickerOptionDot} aria-hidden="true" />
                                            <span>{tag.name}</span>
                                        </label>
                                    );
                                })}
                            </section>
                        )) : <span className={styles.pickerEmpty}>{search ? 'No matching tags' : 'No existing tags'}</span>}
                    </div>
                    <div className={styles.creator}>
                        <input
                            aria-label={`New ${scopeLabel.toLocaleLowerCase()} name`}
                            placeholder="Create a tag"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && canonicalTagName(name)) void persist(canonicalTagName(name), true, color, nameMatch?.id);
                            }}
                        />
                        <input
                            type="color"
                            className={styles.creatorColor}
                            aria-label={`New ${scopeLabel.toLocaleLowerCase()} color`}
                            value={color}
                            onChange={(event) => setColor(event.target.value.toUpperCase())}
                        />
                        <Button
                            size="sm"
                            disabled={!canonicalTagName(name) || disabled || isSaving || Boolean(nameMatch?.archived)}
                            onClick={() => void persist(canonicalTagName(name), true, color, nameMatch?.id)}
                        >
                            {nameMatch ? 'Add' : 'Create'}
                        </Button>
                    </div>
                    {nameMatch ? (
                        <p className={styles.creatorHint} role="status">
                            {nameMatch.archived
                                ? `“${nameMatch.name}” is archived. Restore it from Manage Tags to use it again.`
                                : `“${nameMatch.name}” already exists and will be added.`}
                        </p>
                    ) : null}
                </div>,
                document.body,
            )}
        </div>
    );
}

export default CircuitScopeTagEditor;
