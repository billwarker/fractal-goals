import React, { useId, useState } from 'react';

import SidePaneHeader from '../common/SidePaneHeader';
import SidePaneHeaderButton from '../common/SidePaneHeaderButton';
import { hasActiveGlobalFilters } from './analyticsGlobalFilters';
import AnalyticsScopePane from './AnalyticsScopePane';
import ChartTitle from './ChartTitle';
import { getChartNumbers, getChartTitle } from './chartTitles';
import styles from './AnalyticsFiltersSidebar.module.css';

/** Shared filters stay above chart tabs; each tab edits only its chart's scope and settings. */
export default function AnalyticsFiltersSidebar(props) {
    const { windowStates = {}, shownGrains = {}, selectedWindowId, onUpdateWindowState, onSelectWindow, onToggleCollapse, isMobile } = props;
    const [localTab, setLocalTab] = useState(selectedWindowId);
    const tabId = useId();
    const panels = Object.entries(windowStates || {}).filter(([, state]) => state?.selectedCategory && state?.selectedVisualization);
    const chartNumbers = getChartNumbers(windowStates);
    const dashboard = panels.length > 1 || panels.some(([, state]) => hasActiveGlobalFilters(state.localFilters));
    if (!dashboard) return <AnalyticsScopePane {...props} chartNumber={chartNumbers[selectedWindowId]} shownGrain={shownGrains[selectedWindowId]} />;
    const selectedId = onSelectWindow ? (selectedWindowId || localTab) : localTab;
    const [activeId, activeState] = panels.find(([id]) => id === selectedId) || panels[0];
    const select = (id) => { setLocalTab(id); onSelectWindow?.(id); };
    const reset = () => {
        props.onReset?.();
        props.onDateRangeChange?.({ start: null, end: null });
        panels.forEach(([id]) => onUpdateWindowState?.(id, { localFilters: null }));
    };
    const navigateTabs = (event, index) => {
        const targets = { ArrowRight: (index + 1) % panels.length, ArrowLeft: (index + panels.length - 1) % panels.length, Home: 0, End: panels.length - 1 };
        if (!(event.key in targets)) return;
        event.preventDefault();
        const target = targets[event.key];
        select(panels[target][0]);
        event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[target].focus();
    };
    return (
        <div className={`sessions-query-sidebar ${styles.sidebar}`}>
            <SidePaneHeader title="Filters" subtitle={`${panels.length} ${panels.length === 1 ? 'chart' : 'charts'}`} actions={<>
                <SidePaneHeaderButton variant="reset" onClick={reset}>Reset Filters</SidePaneHeaderButton>
                {onToggleCollapse && <SidePaneHeaderButton onClick={onToggleCollapse} aria-label="Collapse filters panel">{isMobile ? 'Hide' : 'Collapse'}</SidePaneHeaderButton>}
            </>} />
            <section className={styles.global} aria-label="Global filters">
                <AnalyticsScopePane {...props} embedded scopeKind="global" selectedWindowState={null} />
            </section>
            <div className={styles.tabs} role="tablist" aria-label="Chart filters">
                {panels.map(([id, state], index) => {
                    const name = getChartTitle(state);
                    return <button key={id} type="button" role="tab" id={`${tabId}-${id}`}
                        className={styles.tab} aria-label={`${name}, chart ${chartNumbers[id]}`}
                        aria-selected={id === activeId} aria-controls={`${tabId}-panel`} tabIndex={id === activeId ? 0 : -1}
                        onClick={() => select(id)} onKeyDown={(event) => navigateTabs(event, index)}>
                        <ChartTitle number={chartNumbers[id]} name={name} active={id === activeId} />
                    </button>;
                })}
            </div>
            <div className={styles.chartPane} role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${activeId}`} tabIndex={0}>
                <AnalyticsScopePane key={activeId} {...props} embedded scopeKind="chart" selectedWindowState={activeState} windowStates={{ [activeId]: activeState }} shownGrain={shownGrains[activeId]}
                    filters={activeState.localFilters} inheritedFilters={props.filters} dateRange={null}
                    onChange={(localFilters) => onUpdateWindowState?.(activeId, { localFilters })}
                    onReset={() => onUpdateWindowState?.(activeId, { localFilters: null })}
                    onUpdateSelectedWindowState={(updates) => onUpdateWindowState?.(activeId, updates)} />
            </div>
        </div>
    );
}
