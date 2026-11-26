// Writes the favicon and app icons from the logo geometry in src/brand/logoGeometry.js.
// The outputs are committed; rerun after changing the logo:  npm run brand:assets
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { BRAND_TILE, brandMarkSquares, brandMarkSvg, brandMarkViewBox } from '../src/brand/logoGeometry.js';

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');
const desktopIcons = resolve(publicDir, '../../desktop/icons');

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

// The Mac app's Dock icon (Apple's rounded tile inside a margin) and its menu-bar icon, which macOS
// recolours, so only its shape counts. `npm run icons` in desktop/ then makes the .icns.
const dockMark = brandMarkSvg({ size: 620 }).replace('<svg ', '<svg x="202" y="202" ');
const DESKTOP_ASSETS = [
    { path: 'app-icon.png', size: 1024, svg: [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">',
        `<rect x="100" y="100" width="824" height="824" rx="185" fill="${BRAND_TILE}"/>${dockMark}</svg>`,
    ].join('') },
    { path: 'menu-bar.png', size: 44, svg: [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${brandMarkViewBox({ strokeWidth: 7, padding: 0.08 })}">`,
        '<g fill="none" stroke="#000" stroke-width="7">',
        ...brandMarkSquares().filter(({ size }) => size === 60)
            .map(({ x, y, size, transform = '' }) => `<rect x="${x}" y="${y}" width="${size}" height="${size}" transform="${transform}"/>`),
        '</g></svg>',
    ].join('') },
];

function write(path, contents, dir = publicDir) {
    const target = resolve(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
    console.log(`Wrote ${target}`);
}

const renderPng = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

function main() {
    write('favicon.svg', FAVICON_SVG);
    for (const asset of RASTER_ASSETS) {
        const svg = brandMarkSvg({ size: asset.size, ...asset.svg });
        write(asset.path, renderPng(svg, asset.size));
    }
    for (const { path, size, svg } of DESKTOP_ASSETS) write(path, renderPng(svg, size), desktopIcons);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
