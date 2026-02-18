import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

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
    file: 'src/pages/Programs.jsx',
    substrings: ['fractalApi.getPrograms(', 'fractalApi.getGoals('],
    reason: 'Programs read-path should be encapsulated in useProgramsPageData hook.',
  },
  {
    type: 'no-substring',
    file: 'src/components/analytics/WeeklyBarChart.jsx',
    substrings: ['style={{'],
    reason: 'WeeklyBarChart should rely on CSS module classes over inline style blocks.',
  },
  {
    type: 'require-substring',
    file: 'src/hooks/useLogsData.js',
    substrings: ['useQuery', 'useMutation', "queryKey: ['logs'"],
    reason: 'Logs data hook should remain React Query based.',
  },
  {
    type: 'require-substring',
    file: 'src/hooks/useProgramsPageData.js',
    substrings: ['useQuery', "queryKey: ['programs'", "queryKey: ['goals-tree'"],
    reason: 'Programs page data hook should remain React Query based.',
  },
];

const globalNoImportPatterns = [
  /from\s+['"].*SessionDetail\.css['"]/,
  /from\s+['"].*Sessions\.css['"]/,
  /import\s+['"].*SessionDetail\.css['"]/,
  /import\s+['"].*Sessions\.css['"]/,
];

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

const sourceFiles = collectSourceFiles(resolve('src'));

for (const file of sourceFiles) {
  const content = readFileSync(file, 'utf8');
  if (!content) continue;

  for (const pattern of globalNoImportPatterns) {
    if (pattern.test(content)) {
      console.error(
        `[maintainability-audit] ${file} reintroduced a removed legacy CSS import: ${pattern}`
      );
      hasFailure = true;
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log('[maintainability-audit] Passed');
