import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checks = [
  {
    file: 'src/App.css',
    patterns: [
      /\.content-container\s*\{[^}]*background-color:\s*var\(--color-bg-app\);[^}]*background-image:[^}]*linear-gradient\(var\(--color-grid\)/s,
    ],
    forbiddenPatterns: [
      /\.main-content(?:\.with-window)?\s*\{/,
    ],
  },
  {
    file: 'src/app-shell-and-session.css',
    patterns: [
      /\.top-nav-links/,
      /\.page-container/,
      /\.mobile-sheet-enter\s*\{[^}]*animation:\s*mobileSheetSlideUp 0\.28s cubic-bezier\(0\.32, 0\.72, 0, 1\);/s,
      /\.mobile-sheet-backdrop-enter\s*\{[^}]*animation:\s*mobileSheetBackdropFadeIn 0\.2s ease;/s,
      /@media\s*\(max-width:\s*768px\)/,
    ],
    forbiddenPatterns: [/linear-gradient\(var\(--color-grid\)/],
  },
  {
    file: 'src/pages/SessionDetail.module.css',
    patterns: [
      /\.sessionDetailContainer\s*\{[^}]*background:\s*transparent;/s,
      /\.sessionMainContent\s*\{[^}]*background:\s*transparent;/s,
      /--mobile-session-footer-height:\s*calc\(68px \+ env\(safe-area-inset-bottom, 0px\)\);/,
      /\.mobileBottomDock\s*\{[^}]*right:\s*0;[^}]*bottom:\s*0;[^}]*left:\s*0;[^}]*z-index:\s*calc\(var\(--z-sheet\) \+ 2\);[^}]*height:\s*var\(--mobile-session-footer-height\);[^}]*border-top:/s,
      /\.mobilePaneOverlay\s*\{[^}]*bottom:\s*var\(--mobile-session-footer-height, 0px\);[^}]*z-index:\s*calc\(var\(--z-sheet\) \+ 1\);/s,
      /\.mobilePaneSheet/,
      /padding-bottom:\s*calc\(var\(--mobile-session-footer-height\) \+ var\(--spacing-(?:lg|md)\)\);/,
      /@media\s*\(max-width:\s*768px\)/,
    ],
    forbiddenPatterns: [
      /linear-gradient\(var\(--color-grid\)/,
      /background(?:-color)?:\s*var\(--color-bg-app\)/,
      /\.mobileSession(?:Header|Title|Status|Meta)/,
      /\.mobileOpenPaneButton/,
      /padding-top:\s*84px/,
      /--mobile-dock-reserved-space/,
      /z-index:\s*(?:1300|1400)/,
    ],
  },
  {
    file: 'src/components/ActivityBuilder.module.css',
    patterns: [
      /\.actionBtn\s*\{[^}]*flex:\s*1;[^}]*min-width:\s*0;/s,
      /@media\s*\(max-width:\s*768px\)\s*\{[^}]*\.actionsRow\s*\{[^}]*flex-direction:\s*row;[^}]*gap:\s*var\(--spacing-sm\);/s,
    ],
    forbiddenPatterns: [
      /\.actionsRow\s*\{[^}]*flex-direction:\s*column(?:-reverse)?;/s,
      /\.actionsRow\s*\{[^}]*(?:background|box-shadow)\s*:/s,
    ],
  },
  {
    file: 'src/components/atoms/Modal.module.css',
    patterns: [
      /--modal-available-height:\s*calc\(/,
      /padding:\s*var\(--modal-edge-top\) var\(--modal-edge-right\) var\(--modal-edge-bottom\) var\(--modal-edge-left\);/,
      /\.content\s*\{[^}]*max-height:\s*min\(90vh,\s*var\(--modal-available-height\)\);[^}]*min-height:\s*0;/s,
      /\.header\s*\{[^}]*flex:\s*0 0 auto;/s,
      /\.body\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior-y:\s*contain;/s,
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.container\s*\{[^}]*width:\s*100%;[^}]*max-height:\s*var\(--modal-available-height\);/,
    ],
    forbiddenPatterns: [
      /max-height:\s*calc\(100vh - 16px\)/,
    ],
  },
  {
    file: 'src/components/atoms/ModalBackdrop.module.css',
    patterns: [
      /\.visualViewport\s*\{[^}]*top:\s*var\(--modal-viewport-top,\s*0px\);[^}]*left:\s*var\(--modal-viewport-left,\s*0px\);/s,
      /width:\s*var\(--modal-viewport-width,\s*100vw\);/,
      /height:\s*var\(--modal-viewport-height,\s*var\(--app-viewport-height,\s*100dvh\)\);/,
      /overscroll-behavior:\s*contain;/,
    ],
  },
  {
    file: 'src/components/atoms/ModalBackdrop.jsx',
    patterns: [
      /constrainToVisualViewport = true/,
      /window\.visualViewport/,
      /visualViewport\?\.addEventListener\('resize', syncVisualViewport\)/,
      /visualViewport\?\.addEventListener\('scroll', syncVisualViewport\)/,
    ],
  },
  {
    file: 'src/components/sessionDetail/SessionOptionsModal.module.css',
    patterns: [
      /@media\s*\(max-width:\s*640px\)[\s\S]*?\.content\s*\{[^}]*gap:\s*var\(--spacing-sm\);/,
      /\.optionHeader > :global\(button\)\s*\{[^}]*width:\s*100%;/s,
    ],
  },
  {
    file: 'src/components/common/ActivitySummaryRail.module.css',
    patterns: [
      /\.rail\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*align-items:\s*baseline;/s,
      /\.metric\s*\{[^}]*display:\s*inline-flex;[^}]*max-width:\s*100%;[^}]*white-space:\s*nowrap;/s,
      /\.metric \+ \.metric::before\s*\{[^}]*content:\s*'·';/s,
    ],
    forbiddenPatterns: [
      /overflow-x:\s*auto/,
      /flex-direction:\s*column/,
    ],
  },
  {
    file: 'src/components/GoalDetailModal.module.css',
    patterns: [
      /@media\s*\(max-width:\s*560px\)[\s\S]*?\.activitiesFooterPrimaryActions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/,
      /@media\s*\(max-width:\s*560px\)[\s\S]*?\.activitiesFooterSelectionActions\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*\}[\s\S]*?\.activitiesFooterSelectionActions \.activitiesFooterConfirmButton\s*\{[^}]*grid-column:\s*1 \/ -1;/,
    ],
  },
  {
    file: 'src/components/goalDetail/GoalDetailModalFooter.jsx',
    patterns: [/completionFooterSplit[^`]*activitiesFooterPrimaryActions/],
  },
  {
    file: 'src/components/goals/GoalHeader.module.css',
    patterns: [
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.header\s*\{[^}]*margin:\s*-18px -16px 0;[^}]*padding:\s*16px 16px 10px;/,
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.metadataRail\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*justify-content:\s*safe center;[^}]*overflow-x:\s*auto;[^}]*overscroll-behavior-x:\s*contain;[^}]*touch-action:\s*pan-x pan-y;[^}]*-webkit-overflow-scrolling:\s*touch;/,
    ],
  },
  {
    file: 'src/components/goalDetail/ActivityAssociator.module.css',
    patterns: [
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.embeddedHeader \.metricsBreakdown\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*justify-content:\s*safe center;/,
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.embeddedHeader \.metricItem\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-height:\s*20px;/,
      /\.metricLabelCompact\s*\{[^}]*display:\s*none;/,
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.metricLabelCompact\s*\{[^}]*display:\s*inline;/,
    ],
  },
  {
    file: 'src/pages/Sessions.module.css',
    patterns: [/\.pageContainer/, /\.rightPanel/, /@media\s*\(max-width:\s*768px\)/],
    forbiddenPatterns: [/@keyframes\s+(?:sheetSlideUp|backdropFadeIn)/],
  },
  {
    file: 'src/pages/Sessions.jsx',
    patterns: [/mobile-sheet-enter/, /mobile-sheet-backdrop-enter/],
  },
  {
    file: 'src/components/sessionDetail/SessionDetailPaneLayout.jsx',
    patterns: [/mobile-sheet-enter/, /mobile-sheet-backdrop-enter/],
  },
  {
    file: 'src/components/sessions/SessionCardExpanded.module.css',
    patterns: [/\.cardHeaderTitleLink/, /width:\s*100%/, /\.cardHeaderTitleTemplate/, /min-width:\s*0/],
  },
  {
    file: 'src/components/sessionDetail/SessionActivityItem.module.css',
    patterns: [
      /@container\s*\(max-width:\s*760px\)/,
      /\.timerControlsGrid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s,
      /\.timerActionColumn\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(120px,\s*100%\),\s*1fr\)\);/s,
      /\.metricMeta,\s*\.metricMetaLarge\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*2;/s,
      /\.metricUnit,\s*\.metricUnitLarge\s*\{[^}]*white-space:\s*nowrap;/s,
    ],
    forbiddenPatterns: [
      /\.progressSummaryRow/,
      /\.progressSummary\s*\{[^}]*overflow-x:\s*auto;/s,
    ],
  },
  {
    file: 'src/components/circuits/CircuitRunCard.module.css',
    patterns: [
      /@container\s*\(max-width:\s*760px\)/,
      /\.runScopeControl\s*\{[^}]*min-width:\s*58px;[^}]*max-width:\s*100%;/s,
      /\.roundHeader\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/s,
      /\.memberHeader\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/s,
    ],
  },
  {
    file: 'src/pages/Logs.css',
    patterns: [/\.logs-grid-header/, /\.log-item/, /@media\s*\(max-width:\s*768px\)/],
  },
  {
    file: 'src/pages/ProgramCalendarPage.module.css',
    patterns: [
      /\.container\s*\{[^}]*background:\s*transparent;/s,
      /\.workspace\s*\{[^}]*background:\s*transparent;/s,
      /\.calendarPanel\s*\{[^}]*background:\s*transparent;/s,
      /@media\s*\(max-width:\s*980px\)/,
    ],
    forbiddenPatterns: [
      /linear-gradient\(var\(--color-grid\)/,
    ],
  },
  {
    file: 'src/components/programs/ProgramSidePane.module.css',
    patterns: [
      /@media\s*\(max-width:\s*768px\)\s*\{[^}]*\.mobileSidePaneBackdrop\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*calc\(var\(--z-sheet\) \+ 1\);/s,
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.mobileSidePaneSheet\s*\{[^}]*height:\s*min\(82dvh, 760px\);[^}]*padding-bottom:\s*env\(safe-area-inset-bottom, 0px\);/s,
      /\.sidePaneViewToggle :global\(button\[role="tab"\]\)\s*\{[^}]*min-height:\s*44px;/s,
    ],
  },
  {
    file: 'src/pages/ProgramCalendarPage.jsx',
    patterns: [/ResponsiveProgramSidePane/, /<PageHeader[\s\S]*?hideTitleOnMobile[\s\S]*?actions=\{viewActions\}/],
    forbiddenPatterns: [/className=\{styles\.programPageHeader\}/, /compactMobileContext/],
  },
  {
    file: 'src/components/programs/ProgramMobileSidePane.jsx',
    patterns: [/createPortal\(sheet, document\.body\)/, /mobile-sheet-enter/, /mobile-sheet-backdrop-enter/, /aria-modal="true"/],
  },
  {
    file: 'src/components/programs/ProgramCalendarView.module.css',
    patterns: [
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.calendarContainer\s*\{[^}]*min-height:\s*640px;[^}]*height:\s*auto;/,
      /\.mobileControlRow\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;[^}]*flex-wrap:\s*wrap;/s,
      /\.calendarContainerMobileToolbar :global\(\.fc-toolbar-chunk:first-child\),[\s\S]*?:global\(\.fc-toolbar-chunk:last-child\)\s*\{[^}]*display:\s*none !important;/,
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.headerActions\s*\{[^}]*position:\s*static;[^}]*min-height:\s*44px;/,
      /\.customBtn\s*\{[^}]*min-height:\s*44px;/s,
      /:global\(\.fc-button\)\s*\{[^}]*min-height:\s*44px !important;/s,
    ],
    forbiddenPatterns: [/padding-right:\s*116px/, /\n\s+height:\s*640px;/],
  },
  {
    file: 'src/components/layout/HeaderButton.module.css',
    patterns: [/@media\s*\(max-width:\s*768px\)\s*\{[^}]*\.button\s*\{[^}]*min-height:\s*44px;/s],
  },
  {
    file: 'src/components/landing/LandingFeaturesSection.module.css',
    patterns: [
      /\.featureMain\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s,
      /\.featureStage\s*\{[^}]*min-height:\s*0;[^}]*max-height:\s*100%;/s,
      /\.programPagePreview,\s*\.analyticsPagePreview\s*\{[^}]*min-height:\s*0;/s,
    ],
  },
  {
    file: 'src/pages/Landing.module.css',
    patterns: [
      /\.page\s*\{[^}]*height:\s*var\(--app-viewport-height\);[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*none;/s,
      /\.page::-webkit-scrollbar\s*\{[^}]*display:\s*none;/s,
      /\.snapSection\s*\{[^}]*height:\s*100%;/s,
    ],
  },
  {
    file: 'src/index.css',
    patterns: [
      /--app-viewport-height:\s*100vh;/,
      /@supports\s*\(height:\s*100dvh\)/,
      /--app-viewport-height:\s*100dvh;/,
    ],
  },
  {
    file: 'src/FlowTree.jsx',
    patterns: [
      /fitViewOptions/,
      /minZoom=\{isMobile \? 0\.06 : 0\.1\}/,
    ],
  },
  {
    file: 'src/components/flowTree/flowTreeGraphUtils.js',
    patterns: [
      /getLayoutedElements\([^,]+,\s*[^,]+,\s*'TB',\s*isMobile\)/,
    ],
  },
];

let hasFailure = false;

for (const check of checks) {
  const absolutePath = resolve(check.file);
  let content = '';
  try {
    content = readFileSync(absolutePath, 'utf8');
  } catch (error) {
    console.error(`[responsive-audit] Missing file: ${check.file}`);
    hasFailure = true;
    continue;
  }

  for (const pattern of check.patterns) {
    if (!pattern.test(content)) {
      console.error(`[responsive-audit] ${check.file} missing pattern: ${pattern}`);
      hasFailure = true;
    }
  }

  for (const pattern of check.forbiddenPatterns || []) {
    if (pattern.test(content)) {
      console.error(`[responsive-audit] ${check.file} contains forbidden pattern: ${pattern}`);
      hasFailure = true;
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log('[responsive-audit] Passed');
