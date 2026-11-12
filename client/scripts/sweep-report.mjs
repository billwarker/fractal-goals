#!/usr/bin/env node
// Builds sweep-results/index.html: one contact sheet of every surface the visual sweep
// captured (e2e/sweep), each viewport × theme side by side, with its layout and
// accessibility findings. Open the file directly in a browser.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { RESULTS_DIR, SURFACES, THEMES, VIEWPORTS } = await import(path.join(clientRoot, 'e2e/sweep/manifest.js'));
const resultsRoot = path.join(clientRoot, RESULTS_DIR);

const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]
));

async function readResult(surfaceId, name) {
    try {
        return JSON.parse(await fs.readFile(path.join(resultsRoot, surfaceId, `${name}.json`), 'utf8'));
    } catch {
        return null;
    }
}

function counts(result) {
    if (!result) return null;
    return {
        overflow: result.overflow > 1 ? 1 : 0,
        failingTargets: result.targets.filter((item) => item.failing).length,
        smallTargets: result.targets.filter((item) => !item.failing).length,
        serious: result.violations.filter((item) => ['serious', 'critical'].includes(item.impact)).length,
        minor: result.violations.filter((item) => !['serious', 'critical'].includes(item.impact)).length,
    };
}

function badges(total) {
    const parts = [];
    if (total.overflow) parts.push(`<span class="bad">overflow ×${total.overflow}</span>`);
    if (total.failingTargets) parts.push(`<span class="bad">${total.failingTargets} targets &lt;24px</span>`);
    if (total.serious) parts.push(`<span class="bad">${total.serious} serious a11y</span>`);
    if (total.smallTargets) parts.push(`<span class="warn">${total.smallTargets} targets &lt;40px</span>`);
    if (total.minor) parts.push(`<span class="warn">${total.minor} minor a11y</span>`);
    return parts.length ? parts.join(' ') : '<span class="ok">clean</span>';
}

function findingsList(result) {
    if (!result) return '';
    const items = [];
    if (result.overflow > 1) items.push(`<li class="bad">Page scrolls sideways by ${result.overflow}px</li>`);
    for (const violation of result.violations) {
        const tone = ['serious', 'critical'].includes(violation.impact) ? 'bad' : 'warn';
        items.push(`<li class="${tone}">a11y · ${escape(violation.id)} (${escape(violation.impact)}, ${violation.count}×): ${escape(violation.help)}<br><code>${escape(violation.example)}</code></li>`);
    }
    for (const item of result.targets) {
        items.push(`<li class="${item.failing ? 'bad' : 'warn'}">target ${item.width}×${item.height}: <code>${escape(item.element)}</code></li>`);
    }
    return items.length ? `<ul>${items.join('')}</ul>` : '<p class="ok">No findings.</p>';
}

const viewportNames = Object.keys(VIEWPORTS);
const sections = [];
const summaryRows = [];
let captured = 0;

for (const surface of SURFACES) {
    const cells = [];
    const total = { overflow: 0, failingTargets: 0, smallTargets: 0, serious: 0, minor: 0 };
    let latest = '';
    for (const theme of THEMES) {
        for (const viewportName of viewportNames) {
            const name = `${viewportName}-${theme}`;
            const result = await readResult(surface.id, name);
            const tally = counts(result);
            if (tally) {
                captured += 1;
                for (const key of Object.keys(total)) total[key] += tally[key];
                if (result.capturedAt > latest) latest = result.capturedAt;
            }
            const image = `${surface.id}/${name}.png`;
            cells.push(`<figure class="cell" data-theme-shot="${theme}">
  <figcaption>${viewportName} · ${theme} ${tally ? badges(tally) : '<span class="warn">not captured</span>'}</figcaption>
  ${result ? `<a href="${image}" target="_blank" rel="noopener"><img loading="lazy" src="${image}" alt="${escape(surface.id)} at ${viewportName} in ${theme}"></a>` : '<div class="missing">—</div>'}
  ${result ? `<details><summary>Findings</summary>${findingsList(result)}</details>` : ''}
</figure>`);
        }
    }
    summaryRows.push(`<tr><td><a href="#${surface.id}">${escape(surface.id)}</a></td><td>${badges(total)}</td><td>${latest ? escape(latest.slice(0, 16).replace('T', ' ')) : '—'}</td></tr>`);
    sections.push(`<section id="${surface.id}">
  <h2>${escape(surface.id)} <small><code>${escape(surface.path)}</code></small></h2>
  <div class="grid" style="--columns:${viewportNames.length}">${cells.join('')}</div>
</section>`);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual sweep</title>
<style>
:root { --bg: #f4f4f2; --card: #fff; --text: #111; --muted: #666; --border: #d0d0cc; --bad: #b3261e; --warn: #8a5a00; --ok: #1e6b2a; }
@media (prefers-color-scheme: dark) { :root { --bg: #15181d; --card: #1d2229; --text: #e8ecf1; --muted: #98a3b0; --border: #333b46; --bad: #ff8a80; --warn: #ffcc66; --ok: #7bd389; } }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--text); font: 14px/1.45 system-ui, sans-serif; }
h1 { margin: 0 0 4px; font-size: 22px; }
h2 { font-size: 17px; margin: 40px 0 12px; } h2 small { font-weight: 400; color: var(--muted); }
.lede { color: var(--muted); margin: 0 0 20px; }
.toolbar { position: sticky; top: 0; z-index: 2; display: flex; gap: 8px; padding: 8px 0; background: var(--bg); }
.toolbar button { font: inherit; padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; }
.toolbar button[aria-pressed=true] { outline: 2px solid currentColor; }
table { border-collapse: collapse; background: var(--card); border: 1px solid var(--border); width: 100%; max-width: 900px; }
td, th { padding: 6px 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
.grid { display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); gap: 12px; align-items: start; }
@media (max-width: 900px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cell { margin: 0; background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 8px; min-width: 0; }
.cell figcaption { font-size: 12px; margin-bottom: 6px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.cell img { display: block; width: 100%; max-height: 720px; object-fit: cover; object-position: top; border: 1px solid var(--border); border-radius: 4px; }
.missing { height: 120px; display: grid; place-items: center; color: var(--muted); }
details { margin-top: 6px; font-size: 12px; } details ul { padding-left: 16px; margin: 6px 0; } code { font-size: 11px; word-break: break-all; }
.bad { color: var(--bad); } .warn { color: var(--warn); } .ok { color: var(--ok); }
span.bad, span.warn, span.ok { font-size: 11px; border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; }
body[data-only=light] [data-theme-shot=dark], body[data-only=dark] [data-theme-shot=light] { display: none; }
</style>
</head>
<body>
<h1>Visual sweep</h1>
<p class="lede">${captured} captures across ${SURFACES.length} surfaces. Click a screenshot to open it full size. Regenerate with <code>npm run sweep</code>.</p>
<div class="toolbar" role="group" aria-label="Themes shown">
  <button type="button" data-only="" aria-pressed="true">Both themes</button>
  <button type="button" data-only="light" aria-pressed="false">Light</button>
  <button type="button" data-only="dark" aria-pressed="false">Dark</button>
</div>
<table><thead><tr><th>Surface</th><th>Findings (all captures)</th><th>Captured (UTC)</th></tr></thead><tbody>${summaryRows.join('')}</tbody></table>
${sections.join('\n')}
<script>
for (const button of document.querySelectorAll('[data-only]')) {
  if (!button.matches('button')) continue;
  button.addEventListener('click', () => {
    document.body.dataset.only = button.dataset.only;
    for (const other of document.querySelectorAll('button[data-only]')) other.setAttribute('aria-pressed', String(other === button));
  });
}
</script>
</body>
</html>
`;

await fs.mkdir(resultsRoot, { recursive: true });
const output = path.join(resultsRoot, 'index.html');
await fs.writeFile(output, html);
console.log(`Sweep report: ${output} (${captured} captures)`);
