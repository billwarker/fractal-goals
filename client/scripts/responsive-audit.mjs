import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const checks = [
  {
    file: 'src/app-shell-and-session.css',
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
    file: 'src/components/sessions/SessionCardExpanded.module.css',
    patterns: [/\.cardHeaderTitleLink/, /width:\s*100%/, /\.cardHeaderTitleTemplate/, /min-width:\s*0/],
  },
  {
    file: 'src/pages/Logs.css',
    patterns: [/\.logs-grid-header/, /\.log-item/, /@media\s*\(max-width:\s*768px\)/],
  },
  {
    file: 'src/pages/ProgramCalendarPage.module.css',
    patterns: [/\.workspace/, /\.header/, /@media\s*\(max-width:\s*980px\)/],
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
}

if (hasFailure) {
  process.exit(1);
}

console.log('[responsive-audit] Passed');
