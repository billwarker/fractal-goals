/**
 * NoteComposer — shared compose UI for creating notes.
 * Used on /notes page and inside GoalNotesView (goal detail modal).
 *
 * When prelinkedGoalId is provided, the goal is pre-linked and locked.
 * The right-side panel has tabs for Goal tree browser and Activity picker.
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useQuery } from '@tanstack/react-query';
import { useFractalTree } from '../../hooks/useGoalQueries';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { queryKeys } from '../../hooks/queryKeys';
import { fractalApi } from '../../utils/api';
import GoalTreePicker from '../common/GoalTreePicker';
import styles from './NoteComposer.module.css';

function NoteComposer({
    rootId,
    onSubmit,       // (content, goalId, activityDefinitionId) => Promise
    onCancel,
    initialContent = '',      // pre-populate for edit mode
    submitLabel,              // override submit button label
    prelinkedGoalId = null,   // when set, goal is pre-filled and locked (goal modal context)
    prelinkedGoalName = null,
    isSubmitting: externalSubmitting = false,
    // Controlled link state (used by /notes page to hoist link panel to right column)
    selectedGoalId: controlledGoalId,
    selectedGoalName: controlledGoalName,
    selectedActivityId: controlledActivityId,
    selectedActivityName: controlledActivityName,
    onGoalSelect: controlledGoalSelect,
    onActivitySelect: controlledActivitySelect,
    hideLinkPanel = false,
    bare = false,
}) {
    const [content, setContent] = useState(initialContent);
    const [previewMode, setPreviewMode] = useState(false);
    const [linkTab, setLinkTab] = useState('goal'); // 'goal' | 'activity'
    const [internalGoalId, setInternalGoalId] = useState(prelinkedGoalId);
    const [internalGoalName, setInternalGoalName] = useState(prelinkedGoalName);
    const [internalActivityId, setInternalActivityId] = useState(null);
    const [internalActivityName, setInternalActivityName] = useState(null);
    const [activitySearch, setActivitySearch] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const textareaRef = useRef(null);

    // Use controlled or internal state
    const selectedGoalId = controlledGoalId !== undefined ? controlledGoalId : internalGoalId;
    const selectedGoalName = controlledGoalName !== undefined ? controlledGoalName : internalGoalName;
    const selectedActivityId = controlledActivityId !== undefined ? controlledActivityId : internalActivityId;
    const selectedActivityName = controlledActivityName !== undefined ? controlledActivityName : internalActivityName;

    const { data: treeData } = useFractalTree(rootId, { enabled: !prelinkedGoalId });
    const { getGoalColor, getGoalIcon, getGoalSecondaryColor } = useGoalLevels();

    // For the internal (non-hoisted) activity list
    const { data: internalActivities = [] } = useQuery({
        queryKey: queryKeys.activities(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data || [];
        },
        enabled: Boolean(rootId) && !hideLinkPanel && !prelinkedGoalId,
    });

    const adjustHeight = (el) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
            adjustHeight(textareaRef.current);
        }
    }, []);

    const handleGoalSelect = (node) => {
        if (controlledGoalSelect) {
            controlledGoalSelect(node.id === selectedGoalId ? null : node.id, node.id === selectedGoalId ? null : node.name);
        } else {
            setInternalGoalId(node.id);
            setInternalGoalName(node.name);
        }
    };

    const handleActivitySelect = (activity) => {
        const next = selectedActivityId === activity.id ? null : activity.id;
        const nextName = selectedActivityId === activity.id ? null : activity.name;
        if (controlledActivitySelect) {
            controlledActivitySelect(next, nextName);
        } else {
            setInternalActivityId(next);
            setInternalActivityName(nextName);
        }
    };

    const clearGoal = () => {
        if (controlledGoalSelect) controlledGoalSelect(null, null);
        else { setInternalGoalId(null); setInternalGoalName(null); }
    };

    const clearActivity = () => {
        if (controlledActivitySelect) controlledActivitySelect(null, null);
        else { setInternalActivityId(null); setInternalActivityName(null); }
    };

    const handleSubmit = async () => {
        if (!content.trim()) return;
        setIsSubmitting(true);
        try {
            await onSubmit(content.trim(), selectedGoalId, selectedActivityId);
            setContent('');
            setInternalGoalId(prelinkedGoalId);
            setInternalGoalName(prelinkedGoalName);
            setInternalActivityId(null);
            setInternalActivityName(null);
            if (controlledGoalSelect && !prelinkedGoalId) controlledGoalSelect(null, null);
            if (controlledActivitySelect) controlledActivitySelect(null, null);
            setPreviewMode(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const filteredActivities = internalActivities.filter(a =>
        !activitySearch || a.name.toLowerCase().includes(activitySearch.toLowerCase())
    );

    // Build a flat tree for the root
    const rootNode = treeData;

    return (
        <div className={[styles.composer, bare ? styles.bare : ''].filter(Boolean).join(' ')}>
            <div className={styles.composerBody}>
                {/* Left: write/preview area */}
                <div className={styles.writeArea}>
                    <div className={styles.writeToolbar}>
                        <button
                            className={[styles.modeBtn, !previewMode ? styles.modeBtnActive : ''].filter(Boolean).join(' ')}
                            onClick={() => setPreviewMode(false)}
                            type="button"
                        >
                            Write
                        </button>
                        <button
                            className={[styles.modeBtn, previewMode ? styles.modeBtnActive : ''].filter(Boolean).join(' ')}
                            onClick={() => setPreviewMode(true)}
                            type="button"
                        >
                            Preview
                        </button>
                    </div>

                    {previewMode ? (
                        <div className={styles.previewPane}>
                            {content.trim() ? (
                                <div className={styles.markdownPreview}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                                </div>
                            ) : (
                                <span className={styles.previewEmpty}>Nothing to preview.</span>
                            )}
                        </div>
                    ) : (
                        <textarea
                            ref={textareaRef}
                            className={styles.textarea}
                            value={content}
                            onChange={(e) => { setContent(e.target.value); adjustHeight(e.target); }}
                            onKeyDown={handleKeyDown}
                            placeholder="Write a note… (Markdown supported, ⌘Enter to submit)"
                            rows={4}
                        />
                    )}

                    {/* Selected links */}
                    <div className={styles.linkedChips}>
                        {selectedGoalId && (
                            <span className={styles.chip}>
                                Goal: {selectedGoalName || selectedGoalId}
                                {!prelinkedGoalId && (
                                    <button className={styles.chipRemove} onClick={clearGoal} type="button">×</button>
                                )}
                            </span>
                        )}
                        {selectedActivityId && (
                            <span className={styles.chip}>
                                Activity: {selectedActivityName || selectedActivityId}
                                <button className={styles.chipRemove} onClick={clearActivity} type="button">×</button>
                            </span>
                        )}
                    </div>

                    <div className={styles.submitRow}>
                        <button
                            className={styles.submitBtn}
                            onClick={handleSubmit}
                            disabled={!content.trim() || isSubmitting || externalSubmitting}
                            type="button"
                        >
                            {isSubmitting ? 'Saving…' : (submitLabel || 'Save note')}
                        </button>
                        {onCancel && (
                            <button className={styles.cancelBtn} onClick={onCancel} type="button">
                                Cancel
                            </button>
                        )}
                    </div>
                </div>

                {/* Right: link panel (hidden when hoisted to parent column) */}
                {!prelinkedGoalId && !hideLinkPanel && (
                    <div className={styles.linkPanel}>
                        <div className={styles.linkTabs}>
                            <button
                                className={[styles.linkTab, linkTab === 'goal' ? styles.linkTabActive : ''].filter(Boolean).join(' ')}
                                onClick={() => setLinkTab('goal')}
                                type="button"
                            >
                                Goal
                            </button>
                            <button
                                className={[styles.linkTab, linkTab === 'activity' ? styles.linkTabActive : ''].filter(Boolean).join(' ')}
                                onClick={() => setLinkTab('activity')}
                                type="button"
                            >
                                Activity
                            </button>
                        </div>

                        <div className={styles.linkPanelContent}>
                            {linkTab === 'goal' && (
                                <div className={styles.goalTree}>
                                    <GoalTreePicker
                                        treeData={rootNode}
                                        selectedGoalIds={selectedGoalId ? [selectedGoalId] : []}
                                        onSelectionChange={(ids, names) => {
                                            if (controlledGoalSelect) {
                                                controlledGoalSelect(ids[0] || null, names[0] || null);
                                            } else {
                                                setInternalGoalId(ids[0] || null);
                                                setInternalGoalName(names[0] || null);
                                            }
                                        }}
                                        showHideCompleted={true}
                                        showHideMicroNano={true}
                                        allowLineageSelection={false}
                                        getGoalColor={getGoalColor}
                                        getGoalIcon={getGoalIcon}
                                        getGoalSecondaryColor={getGoalSecondaryColor}
                                    />
                                </div>
                            )}
                            {linkTab === 'activity' && (
                                <div className={styles.activityList}>
                                    <input
                                        className={styles.activitySearch}
                                        placeholder="Search activities…"
                                        value={activitySearch}
                                        onChange={(e) => setActivitySearch(e.target.value)}
                                        type="text"
                                    />
                                    {filteredActivities.length === 0 && (
                                        <span className={styles.panelEmpty}>No activities found.</span>
                                    )}
                                    {filteredActivities.map(activity => (
                                        <div
                                            key={activity.id}
                                            className={[
                                                styles.activityItem,
                                                selectedActivityId === activity.id ? styles.activityItemSelected : '',
                                            ].filter(Boolean).join(' ')}
                                            onClick={() => handleActivitySelect(activity)}
                                        >
                                            {activity.name}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/**
 * ComposeLinkPanel — standalone link panel for use when the panel is hoisted
 * to a parent column (e.g. the /notes page right column during compose mode).
 * Uses ActivitySelectorPanel for activities and GoalIcon tree for goals.
 */
export function ComposeLinkPanel({
    rootId,
    selectedGoalId,
    selectedActivityId,
    onGoalSelect,
    onActivitySelect,
}) {
    const [linkTab, setLinkTab] = useState('goal');
    const [browseGroupId, setBrowseGroupId] = useState(null);
    const { data: treeData } = useFractalTree(rootId);
    const { getGoalColor, getGoalIcon, getGoalSecondaryColor } = useGoalLevels();

    const { data: activities = [] } = useQuery({
        queryKey: queryKeys.activities(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivities(rootId);
            return res.data || [];
        },
        enabled: Boolean(rootId),
    });
    const { data: activityGroups = [] } = useQuery({
        queryKey: queryKeys.activityGroups(rootId),
        queryFn: async () => {
            const res = await fractalApi.getActivityGroups(rootId);
            return res.data || [];
        },
        enabled: Boolean(rootId),
    });

    const groupMap = useMemo(() => Object.fromEntries(activityGroups.map(g => [g.id, g])), [activityGroups]);
    const childGroupsByParent = useMemo(() => {
        const m = {};
        activityGroups.forEach(g => {
            const pid = g.parent_id || '__root__';
            if (!m[pid]) m[pid] = [];
            m[pid].push(g);
        });
        return m;
    }, [activityGroups]);
    const activitiesByGroup = useMemo(() => {
        const m = {};
        activities.forEach(a => {
            const gid = a.group_id || '__ungrouped__';
            if (!m[gid]) m[gid] = [];
            m[gid].push(a);
        });
        return m;
    }, [activities]);

    const currentGroup = browseGroupId ? groupMap[browseGroupId] : null;
    const currentSubGroups = childGroupsByParent[browseGroupId || '__root__'] || [];
    const currentActivities = activitiesByGroup[browseGroupId] || [];

    const toggleActivity = (activity) => {
        const isDeselect = selectedActivityId === activity.id;
        onActivitySelect(isDeselect ? null : activity.id, isDeselect ? null : activity.name);
    };

    const handleBack = () => {
        const parent = groupMap[browseGroupId]?.parent_id || null;
        setBrowseGroupId(parent);
    };

    return (
        <div className={styles.standaloneLinkPanel}>
            <div className={styles.linkTabs}>
                <button
                    className={[styles.linkTab, linkTab === 'goal' ? styles.linkTabActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setLinkTab('goal')}
                    type="button"
                >
                    Goal
                </button>
                <button
                    className={[styles.linkTab, linkTab === 'activity' ? styles.linkTabActive : ''].filter(Boolean).join(' ')}
                    onClick={() => setLinkTab('activity')}
                    type="button"
                >
                    Activity
                </button>
            </div>
            <div className={styles.standaloneLinkPanelContent}>
                {linkTab === 'goal' && (
                    <div className={styles.goalTree}>
                        <GoalTreePicker
                            treeData={treeData}
                            selectedGoalIds={selectedGoalId ? [selectedGoalId] : []}
                            onSelectionChange={(ids, names) => {
                                onGoalSelect(ids[0] || null, names[0] || null);
                            }}
                            showHideCompleted={true}
                            showHideMicroNano={true}
                            allowLineageSelection={false}
                            getGoalColor={getGoalColor}
                            getGoalIcon={getGoalIcon}
                            getGoalSecondaryColor={getGoalSecondaryColor}
                        />
                    </div>
                )}
                {linkTab === 'activity' && (
                    <div className={styles.activityBrowser}>
                        {/* breadcrumb / back */}
                        {browseGroupId && (
                            <div className={styles.activityBrowserNav}>
                                <button className={styles.activityBrowserBack} onClick={handleBack} type="button">
                                    ‹ {currentGroup?.name || 'Back'}
                                </button>
                            </div>
                        )}

                        {/* sub-groups */}
                        {currentSubGroups.length > 0 && (
                            <div className={styles.activityGroupList}>
                                {currentSubGroups.map(group => {
                                    const actCount = (activitiesByGroup[group.id] || []).length;
                                    const hasChildren = (childGroupsByParent[group.id] || []).length > 0;
                                    return (
                                        <button
                                            key={group.id}
                                            className={styles.activityGroupRow}
                                            onClick={() => setBrowseGroupId(group.id)}
                                            type="button"
                                        >
                                            <span>{group.name}</span>
                                            <span className={styles.activityGroupMeta}>
                                                {hasChildren ? '›' : `${actCount}`}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* activities */}
                        {currentActivities.length > 0 && (
                            <div className={styles.activityCheckList}>
                                {currentSubGroups.length > 0 && (
                                    <div className={styles.activityCheckListDivider}>Activities</div>
                                )}
                                {currentActivities.map(activity => (
                                    <label key={activity.id} className={styles.activityCheckRow}>
                                        <input
                                            type="checkbox"
                                            checked={selectedActivityId === activity.id}
                                            onChange={() => toggleActivity(activity)}
                                        />
                                        <span className={styles.activityCheckName}>{activity.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {/* ungrouped at root */}
                        {!browseGroupId && (activitiesByGroup['__ungrouped__'] || []).length > 0 && (
                            <div className={styles.activityCheckList}>
                                <div className={styles.activityCheckListDivider}>Ungrouped</div>
                                {(activitiesByGroup['__ungrouped__'] || []).map(activity => (
                                    <label key={activity.id} className={styles.activityCheckRow}>
                                        <input
                                            type="checkbox"
                                            checked={selectedActivityId === activity.id}
                                            onChange={() => toggleActivity(activity)}
                                        />
                                        <span className={styles.activityCheckName}>{activity.name}</span>
                                    </label>
                                ))}
                            </div>
                        )}

                        {currentSubGroups.length === 0 && currentActivities.length === 0 && !browseGroupId && (
                            <span className={styles.activityEmpty}>No activities found.</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default NoteComposer;
