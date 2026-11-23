// Writes the favicon and app icons from the logo geometry in src/brand/logoGeometry.js.
// The outputs are committed; rerun after changing the logo:  npm run brand:assets
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { BRAND_TILE, brandMarkSvg } from '../src/brand/logoGeometry.js';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');

// Browser tabs: the mark alone on transparency.
export const FAVICON_SVG = brandMarkSvg({ size: 32 });

// Raster outputs. Home-screen and install icons must be opaque squares; the maskable icon
// keeps the mark inside the central 80% that every launcher mask leaves visible.
export const RASTER_ASSETS = [
    { path: 'favicon-16.png', size: 16 },
    { path: 'favicon-32.png', size: 32 },
    { path: 'apple-touch-icon.png', size: 180, svg: { padding: 0.14, background: BRAND_TILE } },
    { path: 'icons/icon-192.png', size: 192, svg: { padding: 0.1, background: BRAND_TILE } },
    { path: 'icons/icon-512.png', size: 512, svg: { padding: 0.1, background: BRAND_TILE } },
    { path: 'icons/icon-maskable-512.png', size: 512, svg: { padding: 0.2, background: BRAND_TILE } },
    // OAuth consent screens (Google: 120×120; Dropbox: 64 and 256), on transparency.
    { path: 'brand/logo-120.png', size: 120, svg: { padding: 0.06 } },
    { path: 'brand/logo-64.png', size: 64, svg: { padding: 0.06 } },
    { path: 'brand/logo-256.png', size: 256, svg: { padding: 0.06 } },
];

function write(path, contents) {
    const target = resolve(publicDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
    console.log(`Wrote public/${path}`);
}

function main() {
    write('favicon.svg', FAVICON_SVG);
    for (const asset of RASTER_ASSETS) {
        const svg = brandMarkSvg({ size: asset.size, ...asset.svg });
        const png = new Resvg(svg, { fitTo: { mode: 'width', value: asset.size } }).render().asPng();
        write(asset.path, png);
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
