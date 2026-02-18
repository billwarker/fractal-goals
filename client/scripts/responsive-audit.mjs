import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checks = [
  {
    file: 'src/App.css',
    patterns: [/\.top-nav-links/, /\.page-container/, /@media\s*\(max-width:\s*768px\)/],
  },
  {
    file: 'src/pages/SessionDetail.module.css',
    patterns: [/\.mobileBottomDock/, /\.mobilePaneSheet/, /@media\s*\(max-width:\s*768px\)/],
  },
  {
    file: 'src/pages/Sessions.module.css',
    patterns: [/\.pageContainer/, /\.rightPanel/, /@media\s*\(max-width:\s*768px\)/],
  },
  {
    file: 'src/pages/Logs.css',
    patterns: [/\.logs-grid-header/, /\.log-item/, /@media\s*\(max-width:\s*768px\)/],
  },
  {
    file: 'src/pages/Programs.module.css',
    patterns: [/\.grid/, /\.header/, /@media\s*\(max-width:\s*768px\)/],
  },
  {
    file: 'src/FlowTree.jsx',
    patterns: [/fitViewOptions/, /minZoom=\{isMobile \? 0\.06 : 0\.1\}/, /getLayoutedElements\(nodes, edges, 'TB', isMobile\)/],
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
}

if (hasFailure) {
  process.exit(1);
}

console.log('[responsive-audit] Passed');
