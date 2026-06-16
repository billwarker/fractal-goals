// Renders the static Open Graph cover (scripts/og-cover.svg) to
// public/og-cover.png. Social unfurlers (Twitter, LinkedIn, Slack, iMessage)
// require a raster image, so the committed PNG is the served artifact and the
// SVG is just its editable source.
//
// Run after editing og-cover.svg:  node scripts/generate-og-image.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const here = dirname(fileURLToPath(import.meta.url));
const svgPath = resolve(here, 'og-cover.svg');
const outPath = resolve(here, '../public/og-cover.png');

const svg = readFileSync(svgPath, 'utf8');
const resvg = new Resvg(svg, {
    // The SVG is authored at its final pixel size; render 1:1.
    fitTo: { mode: 'width', value: 1200 },
    font: {
        loadSystemFonts: true,
        // Generic families in the SVG resolve to whatever the system provides;
        // serif headings degrade gracefully on machines without DM Serif.
        defaultFontFamily: 'Helvetica',
    },
    background: '#0a0f16',
});

const png = resvg.render().asPng();
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes)`);
