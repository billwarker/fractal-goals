import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useAnalyticsEngine } from '../../hooks/useAnalyticsEngine';
import { useAnalyticsViews } from '../../hooks/useDashboardQueries';
import notify from '../../utils/notify';
import Button from '../atoms/Button';
import styles from './AnalyticsQueryConsole.module.css';


const DEFAULT_SQL = `SELECT name, session_start, duration_seconds
FROM sessions
LIMIT 100`;

const SQL_KEYWORDS = [
    'SELECT',
    'FROM',
    'WHERE',
    'GROUP BY',
    'ORDER BY',
    'LIMIT',
    'AS',
    'DISTINCT',
    'AND',
    'OR',
    'LIKE',
    'ILIKE',
];
const SQL_FUNCTIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX'];


function stringifyCell(value) {
    if (value == null) return '';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
}


function quoteSqlValue(value) {
    if (value == null) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    return `'${String(value).replaceAll("'", "''")}'`;
}


function defaultSqlFor(dataset) {
    if (!dataset) return DEFAULT_SQL;
    const preferred = ['name', 'session_start', 'created_at', 'duration_seconds', 'completed'];
    const fields = preferred.filter((fieldId) => dataset.fields.some((field) => field.id === fieldId));
    const selected = fields.length ? fields.slice(0, 4) : dataset.fields.slice(0, 4).map((field) => field.id);
    return `SELECT ${selected.join(', ')}
FROM ${dataset.id}
LIMIT 100`;
}


function specToSql(spec, datasets) {
    if (spec?.mode === 'sql') return spec.sql || DEFAULT_SQL;

    const dataset = datasets.find((item) => item.id === spec?.dataset);
    if (!dataset) return DEFAULT_SQL;

    const limit = spec.limit || 100;
    const where = spec.filters?.[0]
        ? `\nWHERE ${spec.filters[0].field} ${spec.filters[0].operator === 'contains' ? 'contains' : '='} ${quoteSqlValue(spec.filters[0].value)}`
        : '';

    if (Array.isArray(spec.fields)) {
        return `SELECT ${spec.fields.join(', ')}
FROM ${dataset.id}${where}
LIMIT ${limit}`;
    }

    const dimensions = spec.dimensions || [];
    const measures = (spec.measures || []).map((measure) => {
        if (measure.aggregation === 'count') {
            const target = measure.field && measure.field !== '*'
                ? `${measure.distinct ? 'DISTINCT ' : ''}${measure.field}`
                : '*';
            return `count(${target})${measure.alias ? ` AS ${measure.alias}` : ''}`;
        }
        return `${measure.aggregation}(${measure.field})${measure.alias ? ` AS ${measure.alias}` : ''}`;
    });
    return `SELECT ${[...dimensions, ...measures].join(', ')}
FROM ${dataset.id}${where}
LIMIT ${limit}`;
}


function getSqlToken(sql, cursorPosition) {
    const beforeCursor = sql.slice(0, cursorPosition);
    const match = /[a-zA-Z_][\w]*$/.exec(beforeCursor);
    return {
        token: match?.[0] || '',
        start: match ? cursorPosition - match[0].length : cursorPosition,
        end: cursorPosition,
    };
}


function getDatasetFromSql(sql, datasets) {
    const match = /\bfrom\s+([a-zA-Z_][\w]*)/i.exec(sql);
    if (!match) return null;
    return datasets.find((dataset) => dataset.id.toLowerCase() === match[1].toLowerCase()) || null;
}

function inferVisualizationSuggestions(result) {
    const columns = result?.columns || [];
    if (!columns.length) return [];
    const numeric = columns.filter((column) => column.type === 'number');
    const temporal = columns.filter((column) => ['date', 'datetime'].includes(column.type) || /date|time|at$/i.test(column.id));
    const dimensions = columns.filter((column) => !numeric.includes(column));
    const suggestions = [];
    const push = (suggestion) => {
        if (!suggestions.some((item) => item.type === suggestion.type && item.x === suggestion.x && item.y === suggestion.y)) {
            suggestions.push(suggestion);
        }
    };

    if (temporal[0] && numeric[0]) {
        push({ type: 'line', label: `${numeric[0].label || numeric[0].id} over time`, x: temporal[0].id, y: numeric[0].id, confidence: 0.9 });
    }
    if (dimensions[0] && numeric[0]) {
        push({ type: 'bar', label: `${numeric[0].label || numeric[0].id} by ${dimensions[0].label || dimensions[0].id}`, x: dimensions[0].id, y: numeric[0].id, confidence: 0.84 });
    }
    if (numeric.length >= 2) {
        push({ type: 'scatter', label: `${numeric[1].label || numeric[1].id} vs ${numeric[0].label || numeric[0].id}`, x: numeric[0].id, y: numeric[1].id, confidence: 0.76 });
    }
    push({ type: 'table', label: 'Table', confidence: 1.0, x: columns[0]?.id || '', y: numeric[0]?.id || '' });
    return suggestions;
}


function AnalyticsQueryConsole({ rootId = null, initialSql = '' }) {
    const {
        catalog,
        catalogLoading,
        catalogError,
        refetchCatalog,
        profiles,
        profilesLoading,
        runQuery,
        isRunning,
        createProfile,
        updateProfile,
        deleteProfile,
    } = useAnalyticsEngine();
    const { createAnalyticsView } = useAnalyticsViews(rootId);

    const datasets = useMemo(() => catalog.datasets || [], [catalog.datasets]);
    const catalogErrorMessage = catalogError
        ? catalogError?.response?.data?.error
            || catalogError?.response?.data?.message
            || catalogError.message
            || 'Analytics catalog is unavailable'
        : '';
    const [isBrowserCollapsed, setIsBrowserCollapsed] = useState(false);
    const [activeDatasetId, setActiveDatasetId] = useState('');
    const [sql, setSql] = useState(DEFAULT_SQL);
    const [profileName, setProfileName] = useState('');
    const [selectedProfileId, setSelectedProfileId] = useState('');
    const [result, setResult] = useState(null);
    const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
    const [fieldMapping, setFieldMapping] = useState({ x: '', y: '', group: '' });
    const [browserWidth, setBrowserWidth] = useState(248);
    const [editorHeight, setEditorHeight] = useState(300);
    const [sqlError, setSqlError] = useState('');
    const [objectSearch, setObjectSearch] = useState('');
    const [expandedDatasetIds, setExpandedDatasetIds] = useState(() => new Set());
    const [autocomplete, setAutocomplete] = useState({ open: false, items: [], index: 0 });
    const consoleRef = useRef(null);
    const workbenchRef = useRef(null);
    const sqlEditorRef = useRef(null);

    const effectiveDataset = useMemo(() => (
        datasets.find((dataset) => dataset.id === activeDatasetId)
        || datasets.find((dataset) => sql.toLowerCase().includes(`from ${dataset.id.toLowerCase()}`))
        || datasets[0]
        || null
    ), [activeDatasetId, datasets, sql]);

    useEffect(() => {
        if (!initialSql) return;
        setSql(initialSql);
        setActiveDatasetId(getDatasetFromSql(initialSql, datasets)?.id || '');
        setResult(null);
        setSqlError('');
    }, [datasets, initialSql]);

    const compatibleVisualizations = useMemo(() => {
        const inferred = inferVisualizationSuggestions(result);
        const backendSuggestions = result?.chart_suggestions || [];
        const merged = [...backendSuggestions, ...inferred];
        return merged.filter((suggestion, index) => (
            merged.findIndex((item) => item.type === suggestion.type && item.x === suggestion.x && item.y === suggestion.y) === index
        ));
    }, [result]);

    const selectedSuggestion = compatibleVisualizations[selectedSuggestionIndex] || compatibleVisualizations[0] || null;

    useEffect(() => {
        if (!selectedSuggestion) {
            setFieldMapping({ x: '', y: '', group: '' });
            return;
        }
        setFieldMapping({
            x: selectedSuggestion.x || '',
            y: selectedSuggestion.y || '',
            group: selectedSuggestion.group || '',
        });
    }, [selectedSuggestion]);

    const filteredDatasets = useMemo(() => {
        const query = objectSearch.trim().toLowerCase();
        if (!query) return datasets;
        return datasets.filter((dataset) => (
            dataset.id.toLowerCase().includes(query)
            || dataset.label.toLowerCase().includes(query)
            || dataset.fields.some((field) => field.id.toLowerCase().includes(query))
        ));
    }, [datasets, objectSearch]);

    const visibleFieldsFor = (dataset) => {
        const query = objectSearch.trim().toLowerCase();
        if (!query || dataset.id.toLowerCase().includes(query) || dataset.label.toLowerCase().includes(query)) {
            return dataset.fields;
        }
        return dataset.fields.filter((field) => field.id.toLowerCase().includes(query));
    };

    const applyDatasetTemplate = (dataset) => {
        setActiveDatasetId(dataset.id);
        setExpandedDatasetIds((current) => new Set(current).add(dataset.id));
        setSql(defaultSqlFor(dataset));
        setResult(null);
        setSqlError('');
    };

    const insertField = (fieldId) => {
        setSql((current) => `${current.trimEnd()} ${fieldId}`);
    };

    const buildAutocompleteItems = (
        sqlText = sql,
        cursorPosition = sqlEditorRef.current?.selectionStart || sqlText.length,
    ) => {
        const { token } = getSqlToken(sqlText, cursorPosition);
        const prefix = token.toLowerCase();
        const contextBeforeCursor = sqlText.slice(0, cursorPosition).toLowerCase();
        const activeSqlDataset = getDatasetFromSql(sqlText, datasets) || effectiveDataset;
        const items = [];
        const pushItem = (value, type, detail = '') => {
            if (!value.toLowerCase().startsWith(prefix)) return;
            if (items.some((item) => item.value === value && item.type === type)) return;
            items.push({ value, type, detail });
        };

        SQL_KEYWORDS.forEach((keyword) => pushItem(keyword, 'keyword'));
        SQL_FUNCTIONS.forEach((fn) => pushItem(`${fn}()`, 'function'));

        const wantsTable = /\bfrom\s+[a-zA-Z_]*$/i.test(contextBeforeCursor);
        const wantsColumn = /\bselect\b/i.test(contextBeforeCursor) || /\bwhere\b/i.test(contextBeforeCursor);
        if (wantsTable || !wantsColumn) {
            datasets.forEach((dataset) => pushItem(dataset.id, 'table', `${dataset.fields.length} columns`));
        }
        if (wantsColumn && activeSqlDataset) {
            activeSqlDataset.fields.forEach((field) => pushItem(field.id, 'column', field.type));
        }

        return items.slice(0, 12);
    };

    const openAutocomplete = () => {
        const items = buildAutocompleteItems();
        setAutocomplete({ open: items.length > 0, items, index: 0 });
    };

    const closeAutocomplete = () => {
        setAutocomplete((current) => ({ ...current, open: false }));
    };

    const insertAutocompleteItem = (item) => {
        const textarea = sqlEditorRef.current;
        if (!textarea || !item) return;
        const cursorPosition = textarea.selectionStart;
        const { start, end } = getSqlToken(sql, cursorPosition);
        const value = item.value.endsWith('()') ? item.value.slice(0, -1) : item.value;
        const nextSql = `${sql.slice(0, start)}${value}${sql.slice(end)}`;
        const nextCursor = start + value.length;
        setSql(nextSql);
        setSqlError('');
        closeAutocomplete();
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
        });
    };

    const handleSqlChange = (event) => {
        const nextSql = event.target.value;
        setSql(nextSql);
        setSqlError('');
        const items = buildAutocompleteItems(nextSql, event.target.selectionStart);
        setAutocomplete({ open: items.length > 0, items, index: 0 });
    };

    const handleSqlKeyDown = (event) => {
        if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
            event.preventDefault();
            openAutocomplete();
            return;
        }
        if (!autocomplete.open) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setAutocomplete((current) => ({
                ...current,
                index: Math.min(current.index + 1, current.items.length - 1),
            }));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setAutocomplete((current) => ({
                ...current,
                index: Math.max(current.index - 1, 0),
            }));
        } else if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            insertAutocompleteItem(autocomplete.items[autocomplete.index]);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            closeAutocomplete();
        }
    };

    const handleProfileChange = (profileId) => {
        setSelectedProfileId(profileId);
        const profile = profiles.find((item) => item.id === profileId);
        if (!profile) {
            setProfileName('');
            return;
        }
        setProfileName(profile.name);
        setSql(profile.visualization_spec?.sql || specToSql(profile.query_spec, datasets));
        setResult(null);
        setSqlError('');
    };

    const compileSql = () => {
        const trimmedSql = sql.trim();
        if (!trimmedSql) {
            setSqlError('Enter a SQL query before running.');
            return null;
        }
        setSqlError('');
        return {
            version: 1,
            mode: 'sql',
            sql: trimmedSql,
            limit: 5000,
        };
    };

    const handleRun = async () => {
        const querySpec = compileSql();
        if (!querySpec) return;
        try {
            const payload = await runQuery(querySpec);
            setResult(payload);
            setSelectedSuggestionIndex(0);
        } catch (error) {
            setSqlError(error?.response?.data?.error || error?.response?.data?.message || 'Failed to run SQL query');
        }
    };

    const ensureSavedProfile = async () => {
        const querySpec = compileSql();
        if (!querySpec) return null;
        const payload = {
            name: profileName.trim() || `SQL view ${new Date().toLocaleString()}`,
            query_spec: querySpec,
            visualization_spec: {
                sql,
                suggestion: selectedSuggestion || null,
                mapping: fieldMapping,
            },
        };
        const saved = selectedProfileId
            ? await updateProfile({ profileId: selectedProfileId, ...payload })
            : await createProfile(payload);
        if (saved) {
            setSelectedProfileId(saved.id);
            setProfileName(saved.name);
        }
        return saved;
    };

    const handleSaveAnalyticsView = async () => {
        if (!rootId) {
            notify.error('Open a fractal before saving an analytics view');
            return;
        }
        if (!selectedSuggestion) {
            notify.error('Run a query and choose a compatible visualization first');
            return;
        }
        try {
            const savedProfile = await ensureSavedProfile();
            if (!savedProfile) return;
            const created = await createAnalyticsView({
                name: `${savedProfile.name} ${selectedSuggestion.label || 'Visualization'}`,
                kind: 'view',
                layout: {
                    type: 'analytics_view',
                    version: 1,
                    profile: {
                        selectedCategory: 'query',
                        selectedVisualization: selectedSuggestion.type,
                        selectedActivity: null,
                        selectedGoal: null,
                        visualizationState: {
                            queryProfileId: savedProfile.id,
                            sql,
                            suggestion: selectedSuggestion,
                            mapping: fieldMapping,
                        },
                        visualizationStateByKey: {},
                    },
                    global_filters: {},
                },
            });
            if (created) {
                notify.success('Analytics view saved from SQL');
            }
        } catch {
            // hook toasts cover API errors
        }
    };

    const handleSave = async () => {
        if (!profileName.trim()) {
            notify.error('Name the query profile before saving');
            return;
        }
        const querySpec = compileSql();
        if (!querySpec) return;
        const payload = {
            name: profileName.trim(),
            query_spec: querySpec,
            visualization_spec: {
                sql,
                suggestion: result?.chart_suggestions?.[0] || null,
            },
        };
        const saved = selectedProfileId
            ? await updateProfile({ profileId: selectedProfileId, ...payload })
            : await createProfile(payload);
        if (saved) {
            notify.success(selectedProfileId ? 'SQL query profile updated' : 'SQL query profile saved');
            setSelectedProfileId(saved.id);
            setProfileName(saved.name);
        }
    };

    const handleDelete = async () => {
        if (!selectedProfileId) return;
        await deleteProfile(selectedProfileId);
        notify.success('SQL query profile deleted');
        setSelectedProfileId('');
        setProfileName('');
    };

    const startBrowserResize = (event) => {
        if (isBrowserCollapsed) return;
        event.preventDefault();
        const bounds = consoleRef.current?.getBoundingClientRect();
        if (!bounds) return;

        const onMove = (moveEvent) => {
            const nextWidth = moveEvent.clientX - bounds.left;
            setBrowserWidth(Math.max(180, Math.min(420, nextWidth)));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const startEditorResize = (event) => {
        event.preventDefault();
        const bounds = workbenchRef.current?.getBoundingClientRect();
        if (!bounds) return;

        const onMove = (moveEvent) => {
            const nextHeight = bounds.bottom - moveEvent.clientY;
            const maxHeight = Math.max(220, bounds.height - 220);
            setEditorHeight(Math.max(180, Math.min(maxHeight, nextHeight)));
        };
        const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
    };

    const toggleDataset = (datasetId) => {
        setExpandedDatasetIds((current) => {
            const next = new Set(current);
            if (next.has(datasetId)) {
                next.delete(datasetId);
            } else {
                next.add(datasetId);
            }
            return next;
        });
    };

    return (
        <section ref={consoleRef} className={styles.console} aria-label="Analytics query console">
            <aside
                className={`${styles.browser} ${isBrowserCollapsed ? styles.browserCollapsed : ''}`}
                style={!isBrowserCollapsed ? { '--browser-pane-width': `${browserWidth}px` } : undefined}
            >
                <div className={styles.browserHeader}>
                    {!isBrowserCollapsed && (
                        <div>
                            <h2>Objects</h2>
                            <span>{datasets.length} tables</span>
                        </div>
                    )}
                    <button
                        type="button"
                        className={styles.collapseButton}
                        onClick={() => setIsBrowserCollapsed((current) => !current)}
                        aria-label={isBrowserCollapsed ? 'Expand object browser' : 'Collapse object browser'}
                    >
                        {isBrowserCollapsed ? '>' : '<'}
                    </button>
                </div>

                {!isBrowserCollapsed && (
                    <>
                        <label className={styles.searchBox}>
                            <span className={styles.searchIcon} aria-hidden="true" />
                            <input
                                value={objectSearch}
                                onChange={(event) => setObjectSearch(event.target.value)}
                                placeholder="Search tables and columns"
                                aria-label="Search database objects"
                            />
                        </label>

                        {catalogErrorMessage && (
                            <div className={styles.catalogNotice} role="status">
                                <span>{catalogErrorMessage}</span>
                                <button type="button" onClick={() => refetchCatalog()}>
                                    Retry
                                </button>
                            </div>
                        )}

                        <div className={styles.objectList} role="listbox" aria-label="Database objects">
                            {!catalogLoading && !catalogErrorMessage && datasets.length === 0 && (
                                <div className={styles.catalogNotice} role="status">
                                    No queryable tables were returned for this account.
                                </div>
                            )}
                            {!catalogErrorMessage && filteredDatasets.length > 0 && (
                                <div className={styles.resourceTree} aria-label="Queryable database tables">
                                    <div className={styles.workspaceRow}>
                                        <span className={styles.workspaceChevron} aria-hidden="true" />
                                        <span className={styles.workspaceIcon} aria-hidden="true" />
                                        <span>analytics_catalog</span>
                                    </div>
                                    {filteredDatasets.map((dataset) => {
                                        const isExpanded = expandedDatasetIds.has(dataset.id) || dataset.id === effectiveDataset?.id;
                                        const isSelected = dataset.id === effectiveDataset?.id;
                                        const visibleFields = visibleFieldsFor(dataset);
                                        return (
                                            <div
                                                key={dataset.id}
                                                className={styles.objectNode}
                                                data-expanded={isExpanded ? 'true' : 'false'}
                                            >
                                                <div className={`${styles.objectRow} ${isSelected ? styles.objectRowActive : ''}`}>
                                                    <button
                                                        type="button"
                                                        className={styles.treeToggle}
                                                        onClick={() => toggleDataset(dataset.id)}
                                                        aria-label={isExpanded ? `Collapse ${dataset.id}` : `Expand ${dataset.id}`}
                                                        aria-expanded={isExpanded}
                                                    >
                                                        <span aria-hidden="true" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.objectButton}
                                                        onClick={() => applyDatasetTemplate(dataset)}
                                                    >
                                                        <span className={styles.tableIcon} aria-hidden="true" />
                                                        <span className={styles.objectName}>{dataset.id}</span>
                                                        <small>{dataset.fields.length}</small>
                                                    </button>
                                                </div>

                                                {isExpanded && (
                                                    <div className={styles.fieldList}>
                                                        {visibleFields.map((field) => (
                                                            <button
                                                                key={field.id}
                                                                type="button"
                                                                className={styles.columnButton}
                                                                onClick={() => insertField(field.id)}
                                                            >
                                                                <span className={styles.columnIcon} aria-hidden="true" />
                                                                <span>{field.id}</span>
                                                                <small>{field.type}</small>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <label className={`${styles.field} ${styles.savedViewControl}`}>
                            <span className={styles.label}>Query Profile</span>
                            <select
                                className={styles.select}
                                value={selectedProfileId}
                                onChange={(event) => handleProfileChange(event.target.value)}
                                disabled={profilesLoading}
                            >
                                <option value="">Draft SQL</option>
                                {profiles.map((profile) => (
                                    <option key={profile.id} value={profile.id}>{profile.name}</option>
                                ))}
                            </select>
                        </label>
                    </>
                )}
            </aside>

            <div
                className={`${styles.browserResizeHandle} ${isBrowserCollapsed ? styles.browserResizeHandleDisabled : ''}`}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize object browser"
                onPointerDown={startBrowserResize}
            />

            <main
                ref={workbenchRef}
                className={styles.workbench}
                style={{ '--editor-pane-height': `${editorHeight}px` }}
            >
                <section className={styles.resultsPane} aria-label="Query results and visualization">
                    <div className={styles.paneHeader}>
                        <div>
                            <h2>Results</h2>
                            <span>{effectiveDataset?.label || 'No dataset selected'}</span>
                        </div>
                        <div className={styles.resultMeta}>
                            {result?.metadata ? (
                                <>
                                    <span>{result.metadata.row_count} rows</span>
                                    <span>{result.metadata.cache_hit ? 'cache' : 'live'}</span>
                                    {result.metadata.duration_ms != null && <span>{result.metadata.duration_ms}ms</span>}
                                </>
                            ) : (
                                <span>Waiting for run</span>
                            )}
                        </div>
                    </div>

                    <div className={styles.visualizationSpace}>
                        {compatibleVisualizations.length > 0 ? (
                            <>
                                <div className={styles.recommendationHeader}>
                                    <strong>Recommended Visualizations</strong>
                                    <Button size="sm" variant="secondary" onClick={handleSaveAnalyticsView}>Save as View</Button>
                                </div>
                                <div className={styles.recommendationList}>
                                    {compatibleVisualizations.slice(0, 4).map((suggestion, index) => (
                                        <button
                                            key={`${suggestion.type}-${suggestion.label}-${suggestion.x || ''}-${suggestion.y || ''}`}
                                            type="button"
                                            className={index === selectedSuggestionIndex ? styles.suggestionActive : styles.suggestion}
                                            onClick={() => setSelectedSuggestionIndex(index)}
                                        >
                                            {suggestion.label}
                                        </button>
                                    ))}
                                </div>
                                {selectedSuggestion && (
                                    <div className={styles.mappingGrid}>
                                        {['x', 'y', 'group'].map((field) => (
                                            <label key={field}>
                                                <span>{field.toUpperCase()}</span>
                                                <select
                                                    value={fieldMapping[field] || ''}
                                                    onChange={(event) => setFieldMapping((current) => ({ ...current, [field]: event.target.value }))}
                                                >
                                                    <option value="">None</option>
                                                    {(result?.columns || []).map((column) => (
                                                        <option key={column.id} value={column.id}>{column.label || column.id}</option>
                                                    ))}
                                                </select>
                                            </label>
                                        ))}
                                        <div className={styles.previewSummary}>
                                            {selectedSuggestion.type} · {fieldMapping.x || 'no x'} / {fieldMapping.y || 'no y'}
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <span>Visualization suggestions appear after a query runs.</span>
                        )}
                    </div>

                    <div className={styles.tableWrap}>
                        {!result?.rows?.length ? (
                            <div className={styles.empty}>Run SQL to preview governed analytics rows.</div>
                        ) : (
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        {result.columns.map((column) => (
                                            <th key={column.id}>{column.label}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.rows.map((row, index) => (
                                        <tr key={index}>
                                            {result.columns.map((column) => (
                                                <td key={column.id}>{stringifyCell(row[column.id])}</td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>

                <div
                    className={styles.editorResizeHandle}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize results and SQL editor"
                    onPointerDown={startEditorResize}
                />

                <section className={styles.editorPane} aria-label="SQL editor">
                    <div className={styles.paneHeader}>
                        <div>
                            <h2>SQL Editor</h2>
                            <span>Read-only PostgreSQL against tenant-scoped catalog tables</span>
                        </div>
                        <div className={styles.headerActions}>
                            <Button size="sm" onClick={handleRun} isLoading={isRunning} disabled={catalogLoading}>Run</Button>
                            <Button size="sm" variant="secondary" onClick={handleSave}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={handleDelete} disabled={!selectedProfileId}>Delete</Button>
                        </div>
                    </div>

                    <label className={styles.profileName}>
                        <span className={styles.label}>Profile Name</span>
                        <input
                            className={styles.input}
                            value={profileName}
                            onChange={(event) => setProfileName(event.target.value)}
                            placeholder="Name this SQL view"
                        />
                    </label>

                    <div className={styles.sqlEditorShell}>
                        <textarea
                            ref={sqlEditorRef}
                            className={styles.sqlEditor}
                            value={sql}
                            onChange={handleSqlChange}
                            onKeyDown={handleSqlKeyDown}
                            onFocus={openAutocomplete}
                            onBlur={() => window.setTimeout(closeAutocomplete, 120)}
                            spellCheck="false"
                            aria-label="SQL query editor"
                            aria-autocomplete="list"
                        />
                        {autocomplete.open && (
                            <div className={styles.autocompleteMenu} role="listbox" aria-label="SQL autocomplete suggestions">
                                {autocomplete.items.map((item, index) => (
                                    <button
                                        key={`${item.type}-${item.value}`}
                                        type="button"
                                        className={index === autocomplete.index ? styles.autocompleteItemActive : styles.autocompleteItem}
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            insertAutocompleteItem(item);
                                        }}
                                    >
                                        <span>{item.value}</span>
                                        <small>{item.detail || item.type}</small>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={styles.editorFooter}>
                        {sqlError ? (
                            <span className={styles.error}>{sqlError}</span>
                        ) : (
                            <span>PostgreSQL SELECT/WITH queries run against tenant-scoped catalog tables</span>
                        )}
                    </div>
                </section>
            </main>
        </section>
    );
}

export default AnalyticsQueryConsole;
