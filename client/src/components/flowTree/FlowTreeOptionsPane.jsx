import { useState } from 'react';

import Checkbox from '../atoms/Checkbox';

function MobileHierarchyIcon() {
    return (
        <svg className="mobile-goals-view-icon mobile-goals-hierarchy-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 3v18" />
            <path d="M7 8h10" />
            <path d="M7 14h9" />
            <path d="M16 14v5" />
            <path d="M16 19h5" />
        </svg>
    );
}

function MobileTreeIcon() {
    return (
        <svg className="mobile-goals-view-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M11 3v6" />
            <path d="M11 9L5 15" />
            <path d="M11 9l5 5" />
            <path d="M16 14l5 5" />
            <path d="M16 14l-5 5" />
        </svg>
    );
}

function GoalsViewToggle({ goalsViewMode, onChange, className = '' }) {
    return (
        <div className={`mobile-goals-view-toolbar ${className}`.trim()} aria-label="Mobile goals view">
            <button
                type="button"
                className={`mobile-goals-view-toggle ${goalsViewMode === 'hierarchy' ? 'mobile-goals-view-toggle-active' : ''}`}
                aria-label="Hierarchy"
                title="Hierarchy"
                onClick={() => onChange('hierarchy')}
            >
                <MobileHierarchyIcon />
            </button>
            <button
                type="button"
                className={`mobile-goals-view-toggle ${goalsViewMode === 'tree' ? 'mobile-goals-view-toggle-active' : ''}`}
                aria-label="Tree"
                title="Tree"
                onClick={() => onChange('tree')}
            >
                <MobileTreeIcon />
            </button>
        </div>
    );
}

export default function FlowTreeOptionsPane({
    isMobile,
    isMinimized,
    onToggleMinimized,
    goalsViewMode,
    onGoalsViewModeChange,
    viewSettings,
    onToggleViewSetting,
    inactiveBranchTooltip,
    hideInactiveTooltip,
    hideCompletedTooltip,
    isConfigureMode = false,
    onToggleConfigureMode,
    onCancelConfigureMode,
    surfaces = [],
    activeSurfaceId = null,
    isSurfaceDirty = false,
    onSelectSurface,
    onSaveSurface,
    onSaveSurfaceAs,
    onSetDefaultSurface,
    onDeleteSurface,
    surfacePointerCell = null,
    surfaceConfigTarget = 'desktop',
    onSurfaceConfigTargetChange,
    surfaceViewMode = 'overview',
}) {
    const [isNamingSurface, setIsNamingSurface] = useState(false);
    const [surfaceNameDraft, setSurfaceNameDraft] = useState('');

    const handleSaveAsSubmit = (event) => {
        event.preventDefault();
        const name = surfaceNameDraft.trim();
        if (!name) return;
        onSaveSurfaceAs?.(name);
        setSurfaceNameDraft('');
        setIsNamingSurface(false);
    };

    const handleCancelSaveAs = () => {
        setSurfaceNameDraft('');
        setIsNamingSurface(false);
    };
    return (
        <div className={`flowtree-options-pane ${isMobile ? 'flowtree-options-pane-mobile' : ''} ${isMinimized ? 'flowtree-options-pane-minimized' : ''}`}>
            <div className="flowtree-options-header">
                <div className="flowtree-options-title">
                    {goalsViewMode === 'hierarchy' ? 'Hierarchy View' : 'Tree View'}
                </div>
                <div className="flowtree-options-header-actions">
                    <GoalsViewToggle
                        goalsViewMode={goalsViewMode}
                        onChange={onGoalsViewModeChange}
                        className="mobile-goals-view-toolbar-integrated"
                    />
                    <button
                        type="button"
                        className="flowtree-options-minimize-btn"
                        onClick={onToggleMinimized}
                        aria-label={isMinimized ? 'Expand tree view options' : 'Minimize tree view options'}
                        title={isMinimized ? 'Expand' : 'Minimize'}
                    >
                        {isMinimized ? '+' : '-'}
                    </button>
                </div>
            </div>
            {!isMinimized && (
                <>
                    <Checkbox
                        className="flowtree-options-check"
                        label={<span title={inactiveBranchTooltip}>Fade inactive branches</span>}
                        checked={viewSettings.fadeInactiveBranches}
                        onChange={onToggleViewSetting('fadeInactiveBranches')}
                    />
                    <Checkbox
                        className="flowtree-options-check"
                        label={<span title={hideInactiveTooltip}>Hide inactive goals</span>}
                        checked={viewSettings.hideInactiveGoals}
                        onChange={onToggleViewSetting('hideInactiveGoals')}
                    />
                    <Checkbox
                        className="flowtree-options-check"
                        label={<span title={hideCompletedTooltip}>Hide completed goals</span>}
                        checked={viewSettings.hideCompletedGoals}
                        onChange={onToggleViewSetting('hideCompletedGoals')}
                    />
                    <Checkbox
                        className="flowtree-options-check"
                        label="Show metrics overlay"
                        checked={viewSettings.showMetricsOverlay}
                        onChange={onToggleViewSetting('showMetricsOverlay')}
                    />
                    {onToggleConfigureMode && (
                        <div className="flowtree-options-surface">
                            {isConfigureMode && (
                                <div className={`flowtree-surface-mode flowtree-surface-mode-${surfaceViewMode}`}>
                                    <span>Editing</span>
                                    <strong>{surfaceViewMode === 'scoped' ? 'Scoped' : 'Overview'}</strong>
                                    <em>{isSurfaceDirty ? 'Unsaved' : 'Saved'}</em>
                                </div>
                            )}
                            {isConfigureMode && (
                                <div className="flowtree-cell-tracker" aria-live="polite">
                                    {surfacePointerCell ? (
                                        <>
                                            <span>Cell {surfacePointerCell.x},{surfacePointerCell.y}</span>
                                            <span>{surfacePointerCell.columns}x{surfacePointerCell.rows}</span>
                                            <span>
                                                {Math.round(surfacePointerCell.relativeX * 100)}%,{Math.round(surfacePointerCell.relativeY * 100)}%
                                            </span>
                                            <span>R{surfacePointerCell.fromRight} B{surfacePointerCell.fromBottom}</span>
                                        </>
                                    ) : (
                                        <span>Hover grid cells</span>
                                    )}
                                </div>
                            )}
                            {isConfigureMode && onSurfaceConfigTargetChange && (
                                <div className="flowtree-surface-target" aria-label="Surface layout target">
                                    <button
                                        type="button"
                                        className={`flowtree-surface-target-btn ${surfaceConfigTarget === 'desktop' ? 'flowtree-surface-target-btn-active' : ''}`}
                                        onClick={() => onSurfaceConfigTargetChange('desktop')}
                                    >
                                        Desktop
                                    </button>
                                    <button
                                        type="button"
                                        className={`flowtree-surface-target-btn ${surfaceConfigTarget === 'mobile' ? 'flowtree-surface-target-btn-active' : ''}`}
                                        onClick={() => onSurfaceConfigTargetChange('mobile')}
                                    >
                                        Mobile
                                    </button>
                                </div>
                            )}
                            {!isConfigureMode && (
                                <div className="flowtree-options-surface-row">
                                    {surfaces.length > 0 && (
                                        <select
                                            className="flowtree-surface-select"
                                            value={activeSurfaceId || ''}
                                            onChange={(e) => onSelectSurface?.(e.target.value || null)}
                                            aria-label="Surface layout"
                                        >
                                            <option value="">Default</option>
                                            {surfaces.map((s) => (
                                                <option key={s.id} value={s.id}>
                                                    {s.name}{s.is_default ? ' (default)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    <button
                                        type="button"
                                        className="flowtree-surface-btn flowtree-surface-btn-primary"
                                        onClick={onToggleConfigureMode}
                                    >
                                        Configure
                                    </button>
                                </div>
                            )}
                            {isConfigureMode && (
                                <div className="flowtree-options-surface-actions flowtree-options-surface-actions-primary">
                                    <button type="button" className="flowtree-surface-btn flowtree-surface-btn-primary" onClick={onSaveSurface}>
                                        Save
                                    </button>
                                    <button type="button" className="flowtree-surface-btn" onClick={onCancelConfigureMode}>
                                        Cancel
                                    </button>
                                </div>
                            )}
                            {isConfigureMode && (
                                <div className="flowtree-options-surface-actions">
                                    {!isNamingSurface && (
                                        <button type="button" className="flowtree-surface-btn" onClick={() => setIsNamingSurface(true)}>
                                            Save as...
                                        </button>
                                    )}
                                    {activeSurfaceId && (
                                        <button type="button" className="flowtree-surface-btn" onClick={onSetDefaultSurface}>
                                            Set default
                                        </button>
                                    )}
                                    {activeSurfaceId && (
                                        <button type="button" className="flowtree-surface-btn flowtree-surface-btn-danger" onClick={onDeleteSurface}>
                                            Delete
                                        </button>
                                    )}
                                </div>
                            )}
                            {isConfigureMode && isNamingSurface && (
                                <form className="flowtree-surface-save-as" onSubmit={handleSaveAsSubmit}>
                                    <input
                                        className="flowtree-surface-name-input"
                                        type="text"
                                        value={surfaceNameDraft}
                                        onChange={(event) => setSurfaceNameDraft(event.target.value)}
                                        placeholder="Surface name"
                                        aria-label="Surface name"
                                        autoFocus
                                    />
                                    <div className="flowtree-options-surface-actions flowtree-options-surface-actions-primary">
                                        <button
                                            type="submit"
                                            className="flowtree-surface-btn flowtree-surface-btn-primary"
                                            disabled={!surfaceNameDraft.trim()}
                                        >
                                            Save copy
                                        </button>
                                        <button type="button" className="flowtree-surface-btn" onClick={handleCancelSaveAs}>
                                            Cancel
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
