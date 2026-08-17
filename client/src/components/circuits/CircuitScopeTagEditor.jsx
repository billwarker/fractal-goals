import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { formatError } from '../../utils/mutationNotify';
import notify from '../../utils/notify';
import Badge from '../atoms/Badge';
import Button from '../atoms/Button';
import CloseButton from '../atoms/CloseButton';
import useTagCountOverflow from '../sessionDetail/useTagCountOverflow';
import styles from '../sessionDetail/ActivityTagEditor.module.css';


function CircuitScopeTagEditor({
    className = '',
    scopeLabel,
    tags = [],
    availableTags = [],
    disabled = false,
    editable = true,
    triggerFirst = false,
    onChange,
}) {
    const editorRef = useRef(null);
    const pickerRef = useRef(null);
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState('');
    const [search, setSearch] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const selectedNames = useMemo(
        () => new Set(tags.map((tag) => tag.name.toLocaleLowerCase())),
        [tags],
    );
    const logicalTags = useMemo(() => {
        const byName = new Map();
        availableTags.forEach((tag) => {
            const key = tag.name.toLocaleLowerCase();
            if (!tag.archived && !byName.has(key)) byName.set(key, tag);
        });
        tags.forEach((tag) => {
            const key = tag.name.toLocaleLowerCase();
            if (!byName.has(key)) byName.set(key, tag);
        });
        return [...byName.values()].sort((left, right) => left.name.localeCompare(right.name));
    }, [availableTags, tags]);
    const filtered = logicalTags.filter((tag) => tag.name.toLocaleLowerCase().includes(
        search.trim().toLocaleLowerCase(),
    ));
    const tagOverflow = useTagCountOverflow(tags, editable);

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
            if (!editorRef.current?.contains(event.target)) close({ restoreFocus: false });
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

    const persist = async (tagName, assigned, color = null) => {
        setIsSaving(true);
        try {
            const result = await onChange({ name: tagName, color, assigned });
            if (result?.error) throw new Error(result.error);
            setName('');
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
                            className={`${styles.tag} ${styles.selected} ${styles.measureItem}`}
                            data-tag-label={tag.name}
                        />
                    ))}
                </span>
                {tagOverflow.isSummaryVisible && tags.length > 0 ? (
                    <Badge
                        size="sm"
                        className={`${styles.tag} ${styles.selected} ${styles.summary}`}
                        aria-label={`${tagOverflow.countLabel} assigned`}
                        title={tags.map((tag) => tag.name).join(', ')}
                    >
                        {tagOverflow.countLabel}
                    </Badge>
                ) : tags.map((tag) => (
                    <label
                        key={tag.id || tag.name}
                        className={`${styles.tag} ${styles.selected}`}
                        style={tag.color ? { '--tag-color': tag.color } : undefined}
                    >
                        <input
                            type="checkbox"
                            checked
                            disabled={disabled || isSaving || !editable}
                            onChange={() => void persist(tag.name, false, tag.color)}
                        />
                        {tag.name}
                    </label>
                ))}
                {triggerFirst ? null : addTagTrigger}
            </div>
            {editable && isOpen && (
                <div
                    ref={pickerRef}
                    className={styles.picker}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Choose ${scopeLabel.toLocaleLowerCase()}`}
                >
                    <div className={styles.pickerHeader}>
                        <span>{scopeLabel}</span>
                        <CloseButton
                            size={14}
                            buttonSize="sm"
                            className={styles.pickerClose}
                            aria-label="Close tag picker"
                            onClick={() => close()}
                        />
                    </div>
                    {logicalTags.length > 5 && (
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
                        {filtered.length ? filtered.map((tag) => {
                            const selected = selectedNames.has(tag.name.toLocaleLowerCase());
                            return (
                                <label
                                    key={tag.id || tag.name}
                                    className={styles.pickerOption}
                                    style={tag.color ? { '--tag-color': tag.color } : undefined}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        disabled={disabled || isSaving}
                                        onChange={() => void persist(tag.name, !selected, tag.color)}
                                    />
                                    <span className={styles.pickerOptionDot} aria-hidden="true" />
                                    <span>{tag.name}</span>
                                </label>
                            );
                        }) : <span className={styles.pickerEmpty}>No matching tags</span>}
                    </div>
                    <div className={styles.creator}>
                        <input
                            aria-label={`New ${scopeLabel.toLocaleLowerCase()} name`}
                            placeholder="Create a tag"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && name.trim()) void persist(name.trim(), true);
                            }}
                        />
                        <Button
                            size="sm"
                            disabled={!name.trim() || disabled || isSaving}
                            onClick={() => void persist(name.trim(), true)}
                        >
                            Create
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CircuitScopeTagEditor;
