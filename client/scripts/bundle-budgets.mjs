import { gzipSync } from 'node:zlib';

const budgets = {
    PublicLandingRoot: { label: 'Public landing', js: 175, css: 20 },
    AuthenticatedRoot: { label: 'Authenticated shell', js: 200, css: 40 },
    FractalGoals: { label: 'Goals route', js: 350, css: 65 },
    Sessions: { label: 'Sessions route', js: 300, css: 65 },
    // 322: tag, session-template and program-day filters plus Progress-pane deep links (+1.4 KiB,
    // 2026-10; the filter section itself is lazy-loaded). See planning/progress-pane-scope-and-chart.md.
    Analytics: { label: 'Analytics route', js: 322, css: 65 },
};

export default function bundleBudgets() {
    return {
        name: 'application-bundle-budgets',
        generateBundle(_options, bundle) {
            const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
            const entry = chunks.find((chunk) => chunk.isEntry);
            const shell = chunks.find((chunk) => chunk.name === 'AuthenticatedRoot');
            for (const [name, budget] of Object.entries(budgets)) {
                const roots = chunks.filter((chunk) => chunk.name === name);
                if (!entry || !roots.length || !shell) this.error(`Missing ${name} budget root.`);
                const visited = new Set();
                const visit = (chunk) => {
                    if (!chunk || visited.has(chunk.fileName)) return;
                    visited.add(chunk.fileName);
                    chunk.imports.forEach((fileName) => visit(bundle[fileName]));
                };
                visit(entry);
                if (!['PublicLandingRoot', 'AuthenticatedRoot'].includes(name)) visit(shell);
                roots.forEach(visit);
                const initial = chunks.filter((chunk) => visited.has(chunk.fileName));
                const js = initial.reduce((sum, chunk) => sum + gzipSync(chunk.code).byteLength, 0) / 1024;
                const cssFiles = new Set(initial.flatMap((chunk) => [...(chunk.viteMetadata?.importedCss || [])]));
                const css = [...cssFiles].reduce((sum, file) => sum + gzipSync(bundle[file].source).byteLength, 0) / 1024;
                this.info(`${budget.label} static transfer: ${js.toFixed(1)} KiB JS gzip + ${css.toFixed(1)} KiB CSS gzip.`);
                if (js > budget.js || css > budget.css) this.error(`${budget.label} exceeds ${budget.js} KiB JS / ${budget.css} KiB CSS gzip budget.`);
            }
        },
    };
}
