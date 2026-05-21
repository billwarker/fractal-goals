import { readdirSync, readFileSync, statSync } from 'node:fs';
import module from 'node:module';
import { extname, join, relative, resolve } from 'node:path';

const builtins = new Set(module.builtinModules);
const MAX_SOURCE_LINES = 450;
const sizeExceptions = new Map([
  // Known decomposition backlog. Keep these thresholds close to the current
  // file sizes so the audit still catches meaningful growth while larger
  // extractions are handled deliberately.
  ['src/components/GoalCharacteristicsSettings.jsx', 500],
  ['src/components/GoalDetailModal.jsx', 1350],
  ['src/components/GoalDetailModal.module.css', 850],
  ['src/components/__tests__/GoalDetailModal.test.jsx', 650],
  ['src/components/analytics/AnalyticsFiltersSidebar.jsx', 500],
  ['src/components/analytics/LineGraph.jsx', 775],
  ['src/components/analytics/ProfileWindow.jsx', 600],
  ['src/components/goalDetail/ActivityAssociator.jsx', 800],
  ['src/components/goalDetail/TargetManager.jsx', 625],
  ['src/components/goals/GoalHierarchyList.jsx', 500],
  ['src/components/goals/GoalOptionsView.jsx', 550],
  ['src/components/modals/DayViewModal.jsx', 650],
  ['src/components/modals/SettingsModal.jsx', 650],
  ['src/components/modals/TemplateBuilderModal.jsx', 850],
  ['src/components/modals/TemplateBuilderModal.module.css', 675],
  ['src/components/notes/NoteComposer.jsx', 500],
  ['src/components/sessionDetail/SessionActivityItem.jsx', 1300],
  ['src/components/sessionDetail/SessionActivityItem.module.css', 925],
  ['src/components/sessionDetail/__tests__/SessionActivityItem.test.jsx', 725],
  ['src/components/sessions/ActivityCard.jsx', 500],
  ['src/components/sessions/SessionCardExpanded.jsx', 500],
  ['src/components/sessions/SessionFilterSelectionModal.jsx', 500],
  ['src/contexts/ActiveSessionContext.jsx', 1000],
  ['src/hooks/__tests__/useSessionGoalsViewModel.test.js', 500],
  ['src/hooks/useFlowTreeMetrics.js', 600],
  ['src/hooks/useSessionDetailMutations.js', 600],
  ['src/pages/CreateSession.jsx', 625],
  ['src/pages/FractalGoals.jsx', 650],
  ['src/pages/ManageActivities.jsx', 650],
  ['src/pages/Notes.jsx', 500],
  ['src/pages/ProgramCalendarPage.jsx', 1250],
  ['src/utils/dateUtils.js', 500],
  ['src/utils/programViewModel.js', 725],
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
  'src/components/analytics/GenericGraphModal.jsx',
  'src/components/atoms/Modal.jsx',
  'src/components/createSession/GoalAssociation.jsx',
  'src/components/createSession/TemplatePicker.jsx',
  'src/components/modals/AuthModal.jsx',
  'src/components/modals/ProgramDayModal.jsx',
  'src/components/modals/TemplateBuilderModal.jsx',
  'src/components/programs/ProgramBlockView.jsx',
  'src/components/sessionDetail/QuickSessionWorkspace.jsx',
  'src/components/sessionDetail/SessionActivityItem.jsx',
  'src/components/sessionDetail/SessionDetailModals.jsx',
  'src/components/sessionDetail/SessionSection.jsx',
  'src/hooks/useActivityGoalAssociations.js',
  'src/hooks/useSessionDetailData.js',
  'src/hooks/useSessionDetailMutations.js',
  'src/hooks/useSessionQueries.js',
  'src/pages/CreateSessionTemplate.jsx',
  'src/pages/Logs.jsx',
  'src/pages/ManageActivities.jsx',
  'src/pages/Selection.jsx',
  'src/pages/Sessions.jsx',
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
    substrings: ['useQuery', 'useMutation', "queryKey: ['logs'"],
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
];

const globalNoImportPatterns = [
  /from\s+['"].*SessionDetail\.css['"]/,
  /from\s+['"].*Sessions\.css['"]/,
  /import\s+['"].*SessionDetail\.css['"]/,
  /import\s+['"].*Sessions\.css['"]/,
];

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
  if (lineCount > threshold) {
    console.error(
      `[maintainability-audit] ${file} has ${lineCount} lines, exceeding the limit of ${threshold}. ` +
      'Extract coordinator logic or move helpers into adjacent modules.'
    );
    hasFailure = true;
  }
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
}

if (hasFailure) {
  process.exit(1);
}

console.log('[maintainability-audit] Passed');
