/**
 * SidePane Component Exports
 */

export { SidePaneProvider, useSidePane } from './SidePaneContext';
export { default as GlobalSidePane } from './GlobalSidePane';
export { default as SidePaneHeader } from './SidePaneHeader';
export { default as SidePaneModeTabs } from './SidePaneModeTabs';
export { default as SidePaneTrigger } from './SidePaneTrigger';

// Mode components
export { default as NotesMode } from './modes/NotesMode';
export { default as DetailsMode } from './modes/DetailsMode';
export { default as HistoryMode } from './modes/HistoryMode';
export { default as RelatedMode } from './modes/RelatedMode';
export { default as AnalyticsMode } from './modes/AnalyticsMode';
export { default as ActionsMode } from './modes/ActionsMode';
