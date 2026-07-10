import { readdirSync, readFileSync, statSync } from 'node:fs';
import module from 'node:module';
import { extname, join, relative, resolve } from 'node:path';

const builtins = new Set(module.builtinModules);
const MAX_SOURCE_LINES = 450;
const HARD_SOURCE_LINES = 800;
const hardSizeBacklog = new Set([
  // Known decomposition backlog. Files here may exceed the S-rank production
  // ceiling, but only up to their explicit sizeException cap below.
  'src/components/__tests__/GoalDetailModal.test.jsx',
  'src/components/analytics/AnalyticsQueryConsole.jsx',
  'src/components/modals/TemplateBuilderModal.jsx',
  'src/components/goalDetail/GoalDetailModalRenderSurface.jsx',
  'src/components/sessionDetail/SessionActivityItemView.jsx',
  'src/components/sessionDetail/__tests__/SessionActivityItem.test.jsx',
  'src/pages/Admin.jsx',
  'src/pages/FractalGoals.jsx',
  'src/pages/Landing.jsx',
  'src/pages/ProgramCalendarPage.jsx',
  'src/pages/__tests__/Landing.test.jsx',
  'src/utils/programViewModel.js',
]);
const sizeExceptions = new Map([
  // Known decomposition backlog. Keep these thresholds close to the current
  // file sizes so the audit still catches meaningful growth while larger
  // extractions are handled deliberately.
  ['src/AppRouter.jsx', 676],
  ['src/components/GoalCharacteristicsSettings.jsx', 500],
  ['src/components/GoalDetailModal.jsx', 777],
  ['src/components/GoalDetailModal.module.css', 850],
  ['src/components/__tests__/GoalDetailModal.test.jsx', 1081],
  ['src/components/activityPicker/ActivityPicker.jsx', 453],
  ['src/components/analytics/AnalyticsQueryConsole.jsx', 831],
  ['src/components/analytics/AnalyticsFiltersSidebar.jsx', 510],
  ['src/components/analytics/LineGraph.jsx', 775],
  ['src/components/analytics/ProfileWindow.jsx', 702],
  ['src/components/analytics/visualizationQueryExplanations.js', 527],
  ['src/components/common/ActivityTimeline.jsx', 483],
  ['src/components/goalDetail/ActivityAssociator.jsx', 800],
  ['src/components/goalDetail/GoalDetailModalRenderSurface.jsx', 847],
  ['src/components/goalDetail/GoalTimelineView.jsx', 488],
  ['src/components/goalDetail/TargetAnalyticsModal.jsx', 743],
  ['src/components/goalDetail/TargetManager.jsx', 675],
  ['src/components/goalDetail/__tests__/TargetAnalyticsModal.test.jsx', 457],
  ['src/components/goals/GoalHierarchyList.jsx', 500],
  ['src/components/goals/GoalOptionsView.jsx', 550],
  ['src/components/landing/LandingFeatureActivity.jsx', 543],
  ['src/components/modals/DayViewModal.jsx', 699],
  ['src/components/modals/ManageMetricsModal.jsx', 506],
  ['src/components/modals/SettingsModal.jsx', 650],
  ['src/components/modals/TemplateBuilderModal.jsx', 905],
  ['src/components/modals/TemplateBuilderModal.module.css', 675],
  ['src/components/notes/NoteCard.jsx', 510],
  ['src/components/notes/NoteComposer.jsx', 500],
  ['src/components/sessionDetail/SessionActivityItem.jsx', 794],
  ['src/components/sessionDetail/SessionActivityItem.module.css', 925],
  ['src/components/sessionDetail/SessionActivityItemView.jsx', 875],
  ['src/components/sessionDetail/__tests__/SessionActivityItem.test.jsx', 1488],
  ['src/components/sessions/ActivityCard.jsx', 516],
  ['src/components/sessions/SessionCardExpanded.jsx', 500],
  ['src/components/sessions/SessionFilterSelectionModal.jsx', 500],
  ['src/components/surface/PageSurface.jsx', 660],
  ['src/components/surface/gridLayout/GridLayout.jsx', 638],
  ['src/contexts/ActiveSessionContext.jsx', 1000],
  ['src/hooks/__tests__/useSessionGoalsViewModel.test.js', 535],
  ['src/hooks/useFlowTreeMetrics.js', 600],
  ['src/hooks/__tests__/useSessionDetailMutations.test.jsx', 631],
  ['src/hooks/useSessionDetailMutations.js', 799],
  ['src/pages/CreateSession.jsx', 625],
  ['src/pages/Analytics.jsx', 570],
  ['src/pages/FractalGoals.jsx', 1030],
  ['src/pages/__tests__/FractalGoalsSearch.test.jsx', 556],
  ['src/pages/ManageActivities.jsx', 650],
  ['src/pages/Notes.jsx', 500],
  ['src/pages/Sessions.jsx', 487],
  ['src/pages/Admin.jsx', 1303],
  ['src/pages/Landing.jsx', 1061],
  ['src/pages/ProgramCalendarPage.jsx', 1122],
  ['src/pages/__tests__/Admin.test.jsx', 707],
  ['src/pages/__tests__/Landing.test.jsx', 892],
  ['src/utils/dateUtils.js', 545],
  ['src/utils/api/__tests__/core.test.js', 656],
  ['src/utils/programViewModel.js', 843],
]);

const importOrderExceptions = new Set([
  'src/main.jsx',
  // Existing import ordering debt. New files remain covered by the audit.
  'src/AppRouter.jsx',
  'src/components/ActivityCard.jsx',
  'src/components/AddTargetModal.jsx',
  'src/components/GoalCharacteristicsSettings.jsx',
  'src/components/GoalDetailModal.jsx',
  'src/components/activityBuilder/ActivityAssociationsField.jsx',
  'src/components/activityBuilder/ActivityBuilderForm.jsx',
  'src/components/analytics/AnalyticsExtraCharts.jsx',
  'src/components/analytics/GenericGraphModal.jsx',
  'src/components/analytics/visualizations/activities/index.jsx',
  'src/components/atoms/Modal.jsx',
  'src/components/createSession/GoalAssociation.jsx',
  'src/components/createSession/TemplatePicker.jsx',
  'src/components/goalDetail/ActivityAssociator.jsx',
  'src/components/modals/AuthModal.jsx',
  'src/components/modals/LogsModal.jsx',
  'src/components/modals/ProgramDayModal.jsx',
  'src/components/modals/TemplateBuilderModal.jsx',
  'src/components/notes/MarkdownNoteContent.jsx',
  'src/components/programs/ProgramBlockView.jsx',
  'src/components/sessionDetail/QuickSessionWorkspace.jsx',
  'src/components/sessionDetail/SessionActivityItem.jsx',
  'src/components/sessionDetail/SessionDetailModals.jsx',
  'src/components/sessionDetail/SessionGoalHierarchyPanel.jsx',
  'src/components/sessionDetail/SessionInfoPanel.jsx',
  'src/components/sessionDetail/SessionNotesPanel.jsx',
  'src/components/sessionDetail/SessionSection.jsx',
  'src/hooks/useActivityGoalAssociations.js',
  'src/hooks/useGoalAssociationMutations.js',
  'src/hooks/useProgramDetailMutations.js',
  'src/hooks/useSessionDetailData.js',
  'src/hooks/useSessionDetailMutations.js',
  'src/hooks/useSessionQueries.js',
  'src/pages/CreateSession.jsx',
  'src/pages/CreateSessionTemplate.jsx',
  'src/pages/Logs.jsx',
  'src/pages/ManageActivities.jsx',
  'src/pages/Selection.jsx',
  'src/pages/Sessions.jsx',
  'src/utils/api/__tests__/core.test.js',
  'src/utils/mutationNotify.js',
]);

const checks = [
  {
    type: 'no-substring',
    file: 'src/components/sessionDetail/index.js',
    substrings: ['SessionControls'],
    reason: 'Legacy SessionControls export should remain removed.',
  },
  {
    type: 'no-substring',
    file: 'src/pages/Logs.jsx',
    substrings: ['fractalApi.getLogs('],
    reason: 'Logs read-path should be encapsulated in useLogsData hook.',
  },
  {
    type: 'no-substring',
    file: 'src/pages/ProgramCalendarPage.jsx',
    substrings: ['fractalApi.getPrograms(', 'fractalApi.getGoals('],
    reason: 'Programs calendar read-path should be encapsulated in program data hooks.',
  },
  {
    type: 'require-substring',
    file: 'src/hooks/useLogsData.js',
    substrings: ['useQuery', 'useMutation', 'queryKey: queryKeys.logs('],
    reason: 'Logs data hook should remain React Query based.',
  },
  {
    type: 'require-substring',
    file: 'src/hooks/useProgramsCalendarData.js',
    substrings: ['useQuery', 'queryKeys.programs(', 'useFractalTree('],
    reason: 'Programs calendar data hook should remain React Query based.',
  },
  {
    type: 'require-substring',
    file: 'src/hooks/useProgramData.js',
    substrings: ['useQuery', 'queryKeys.program(', 'useFractalTree('],
    reason: 'Program detail data hook should remain React Query based.',
  },
  {
    type: 'no-substring',
    file: 'src/pages/Admin.module.css',
    substrings: [
      'background: rgba(16, 24, 32',
      'background: rgba(17, 24, 33',
    ],
    reason: 'Admin surfaces must use theme tokens rather than dark-mode background literals.',
  },
];

const globalNoImportPatterns = [
  /from\s+['"].*SessionDetail\.css['"]/,
  /from\s+['"].*Sessions\.css['"]/,
  /import\s+['"].*SessionDetail\.css['"]/,
  /import\s+['"].*Sessions\.css['"]/,
];

const INLINE_STYLE_GLOBAL_BUDGET = 356;
const RAW_CLOSE_GLYPH_BUDGET = 3;
const RAW_BUTTON_CLASS_DRIFT_BUDGET = 137;
// The audited starting worktree contains 181 legacy selectors. This is a
// no-growth ratchet; feature work must use Badge while page migrations reduce it.
const BESPOKE_BADGE_SELECTOR_BUDGET = 181;
const GLOBAL_TOKEN_PREFIX = /^--(?:color|spacing|border-radius|shadow|font|line-height|duration|ease|z|panel|surface|sheet)-/;
const BESPOKE_OVERLAY_FILE_BUDGET = 9;
const RAW_MOTION_LITERAL_BUDGET = 664;
const inlineStyleBudgets = new Map([
  ['src/components/GoalDetailModal.jsx', 18],
  ['src/components/goalDetail/GoalTimelineView.jsx', 1],
  ['src/components/goals/GoalHeader.jsx', 1],
  ['src/components/goals/GoalUncompletionModal.jsx', 0],
]);

const importGroupOrder = {
  builtin: 0,
  external: 1,
  parent: 2,
  sibling: 3,
  index: 4,
  style: 5,
};

let hasFailure = false;

const readFile = (file) => {
  const absolutePath = resolve(file);
  try {
    return readFileSync(absolutePath, 'utf8');
  } catch {
    console.error(`[maintainability-audit] Missing file: ${file}`);
    hasFailure = true;
    return '';
  }
};

const collectSourceFiles = (directory) => {
  const entries = readdirSync(directory);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }

    const extension = extname(fullPath);
    if (extension === '.js' || extension === '.jsx' || extension === '.ts' || extension === '.tsx') {
      files.push(fullPath);
    }
  }
  return files;
};

const collectFilesByExtension = (directory, extensions) => {
  const entries = readdirSync(directory);
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectFilesByExtension(fullPath, extensions));
      continue;
    }

    if (extensions.has(extname(fullPath))) {
      files.push(fullPath);
    }
  }
  return files;
};

const classifyImport = (specifier) => {
  if (specifier.endsWith('.css') || specifier.endsWith('.module.css')) return 'style';
  if (specifier === '.' || specifier === './' || specifier === './index' || specifier === './index.js' || specifier === './index.jsx') {
    return 'index';
  }
  if (specifier.startsWith('../')) return 'parent';
  if (specifier.startsWith('./')) return 'sibling';
  if (specifier.startsWith('node:') || builtins.has(specifier)) return 'builtin';
  return 'external';
};

const auditImportOrder = (file, content) => {
  if (importOrderExceptions.has(file)) return;

  const lines = content.split('\n');
  const imports = [];
  let inImportBlock = true;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) {
      if (imports.length > 0) continue;
      continue;
    }
    if (!inImportBlock) break;
    if (!line.startsWith('import ')) {
      inImportBlock = false;
      continue;
    }

    const match = line.match(/from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/);
    if (!match) continue;

    const specifier = match[1] || match[2];
    imports.push({
      line: index + 1,
      specifier,
      group: classifyImport(specifier),
    });
  }

  let highestGroupSeen = -1;
  for (const entry of imports) {
    const groupIndex = importGroupOrder[entry.group];
    if (groupIndex < highestGroupSeen) {
      console.error(
        `[maintainability-audit] ${file}:${entry.line} import "${entry.specifier}" is out of order. ` +
        'Expected builtin/external before relative imports, with style imports last.'
      );
      hasFailure = true;
      break;
    }
    highestGroupSeen = Math.max(highestGroupSeen, groupIndex);
  }
};

const auditFileSize = (file, content) => {
  const lineCount = content.split('\n').length;
  const threshold = sizeExceptions.get(file) ?? MAX_SOURCE_LINES;
  if (lineCount > HARD_SOURCE_LINES && !hardSizeBacklog.has(file)) {
    console.error(
      `[maintainability-audit] ${file} has ${lineCount} lines, exceeding the hard ${HARD_SOURCE_LINES}-line ceiling. ` +
      'Add it to the decomposition backlog with an explicit cap, or split it before merging.'
    );
    hasFailure = true;
    return;
  }

  if (lineCount > threshold) {
    console.error(
      `[maintainability-audit] ${file} has ${lineCount} lines, exceeding the limit of ${threshold}. ` +
      'Extract coordinator logic or move helpers into adjacent modules.'
    );
    hasFailure = true;
  }
};

const countInlineStyleBlocks = (content) => (content.match(/style=\{\{/g) ?? []).length;
const countRawCloseGlyphs = (content) => (
  content.match(/aria-label=\{?['"`][^'"`]*[Cc]lose[^'"`]*['"`]\}?[^>]*>[\s\S]{0,80}?(?:&times;|×|x)/g) ?? []
).length;
const countRawButtonClassDrift = (content) => (
  content.match(/<button\b[^>]*className=\{?[^>]*(?:btn|button|Button)[^>]*>/g) ?? []
).length;
const countBespokeBadgeSelectors = (file, content) => {
  if (file === 'src/components/atoms/Badge.module.css') return 0;
  return (
    content.match(/\.(?:[A-Za-z0-9_-]*(?:badge|Badge|pill|Pill|chip|Chip|tag|Tag)[A-Za-z0-9_-]*)\b/g) ?? []
  ).length;
};

const auditInlineStyles = (file, content) => {
  const count = countInlineStyleBlocks(content);
  const budget = inlineStyleBudgets.get(file);
  if (budget === undefined || count <= budget) return count;

  console.error(
    `[maintainability-audit] ${file} has ${count} inline style blocks, exceeding the limit of ${budget}. ` +
    'Move static styles into CSS modules and keep inline styles limited to runtime CSS variables or measured layout values.'
  );
  hasFailure = true;
  return count;
};

for (const check of checks) {
  const content = readFile(check.file);
  if (!content) continue;

  if (check.type === 'no-substring') {
    for (const substring of check.substrings) {
      if (content.includes(substring)) {
        console.error(
          `[maintainability-audit] ${check.file} contains forbidden text "${substring}". ${check.reason}`
        );
        hasFailure = true;
      }
    }
  }

  if (check.type === 'require-substring') {
    for (const substring of check.substrings) {
      if (!content.includes(substring)) {
        console.error(
          `[maintainability-audit] ${check.file} missing required text "${substring}". ${check.reason}`
        );
        hasFailure = true;
      }
    }
  }
}

const sourceFiles = collectSourceFiles(resolve('src'));
let inlineStyleCount = 0;
let rawCloseGlyphCount = 0;
let rawButtonClassDriftCount = 0;
let bespokeOverlayFileCount = 0;
for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8');
  if (!content) continue;

  for (const pattern of globalNoImportPatterns) {
    if (pattern.test(content)) {
      console.error(
        `[maintainability-audit] ${relative(resolve(''), file)} reintroduced a removed legacy CSS import: ${pattern}`
      );
      hasFailure = true;
    }
  }

  const relativePath = relative(resolve(''), file);
  auditImportOrder(relativePath, content);
  auditFileSize(relativePath, content);
  inlineStyleCount += auditInlineStyles(relativePath, content);
  rawCloseGlyphCount += countRawCloseGlyphs(content);
  rawButtonClassDriftCount += countRawButtonClassDrift(content);
  if (/styles\.(?:overlay|modalOverlay)|className=["'][^"']*modal-overlay/.test(content)) {
    bespokeOverlayFileCount += 1;
  }
}

const cssFiles = collectFilesByExtension(resolve('src'), new Set(['.css']));
let bespokeBadgeSelectorCount = 0;
let rawMotionLiteralCount = 0;
const definedCssTokens = new Set();
const referencedCssTokens = new Set();
for (const file of cssFiles) {
  const relativePath = relative(resolve(''), file);
  const content = readFileSync(file, 'utf8');
  bespokeBadgeSelectorCount += countBespokeBadgeSelectors(relativePath, content);
  for (const match of content.matchAll(/(--[\w-]+)\s*:/g)) definedCssTokens.add(match[1]);
  for (const match of content.matchAll(/var\((--[\w-]+)/g)) referencedCssTokens.add(match[1]);
  rawMotionLiteralCount += (content.match(/\b[0-9.]+(?:ms|s)\b|cubic-bezier\([^)]*\)/g) ?? []).length;
}

const undefinedGlobalTokens = [...referencedCssTokens]
  .filter((token) => GLOBAL_TOKEN_PREFIX.test(token) && !definedCssTokens.has(token))
  .sort();
if (undefinedGlobalTokens.length > 0) {
  console.error(
    `[maintainability-audit] Undefined global design tokens: ${undefinedGlobalTokens.join(', ')}. ` +
    'Define shared semantic tokens before using them; local runtime variables should use a feature-specific prefix.'
  );
  hasFailure = true;
}

if (inlineStyleCount > INLINE_STYLE_GLOBAL_BUDGET) {
  console.error(
    `[maintainability-audit] Frontend has ${inlineStyleCount} inline style blocks, exceeding the repo budget of ` +
    `${INLINE_STYLE_GLOBAL_BUDGET}. Convert static styles to CSS modules before adding more.`
  );
  hasFailure = true;
}

if (rawCloseGlyphCount > RAW_CLOSE_GLYPH_BUDGET) {
  console.error(
    `[maintainability-audit] Found ${rawCloseGlyphCount} raw close glyph controls, exceeding the baseline ` +
    `budget of ${RAW_CLOSE_GLYPH_BUDGET}. Use CloseButton for dismissals or RemoveButton for collection-item removal.`
  );
  hasFailure = true;
}

if (rawButtonClassDriftCount > RAW_BUTTON_CLASS_DRIFT_BUDGET) {
  console.error(
    `[maintainability-audit] Found ${rawButtonClassDriftCount} raw button class controls, exceeding the baseline ` +
    `budget of ${RAW_BUTTON_CLASS_DRIFT_BUDGET}. Use Button or IconButton for new controls.`
  );
  hasFailure = true;
}

if (bespokeBadgeSelectorCount > BESPOKE_BADGE_SELECTOR_BUDGET) {
  console.error(
    `[maintainability-audit] Found ${bespokeBadgeSelectorCount} bespoke badge/pill/chip/tag CSS selectors, exceeding ` +
    `the baseline budget of ${BESPOKE_BADGE_SELECTOR_BUDGET}. Use atoms/Badge.jsx for new compact labels.`
  );
  hasFailure = true;
}

if (bespokeOverlayFileCount > BESPOKE_OVERLAY_FILE_BUDGET) {
  console.error(
    `[maintainability-audit] Found bespoke overlay shells in ${bespokeOverlayFileCount} files, exceeding ` +
    `the no-growth budget of ${BESPOKE_OVERLAY_FILE_BUDGET}. Compose atoms/Modal or ModalBackdrop.`
  );
  hasFailure = true;
}

if (rawMotionLiteralCount > RAW_MOTION_LITERAL_BUDGET) {
  console.error(
    `[maintainability-audit] Found ${rawMotionLiteralCount} raw motion literals, exceeding the no-growth budget of ` +
    `${RAW_MOTION_LITERAL_BUDGET}. Use --duration-* and --ease-* tokens for new motion.`
  );
  hasFailure = true;
}

if (hasFailure) {
  process.exit(1);
}

console.log('[maintainability-audit] Passed');
