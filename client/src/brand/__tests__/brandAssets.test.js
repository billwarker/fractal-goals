// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { FAVICON_SVG, RASTER_ASSETS } from '../../../scripts/build-brand-assets.mjs';
import {
    BRAND_INK,
    BRAND_MARK_STROKE,
    BRAND_RED,
    brandMarkSquares,
    brandMarkViewBox,
} from '../logoGeometry';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

// Every <rect …> between `marker` and the group that closes the mark, normalised for comparison.
function rectsAfter(source, marker) {
    const start = source.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);
    const block = source.slice(start, source.indexOf('</g>', start));
    return [...block.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"(?: transform="([^"]+)")?/g)]
        .map(([, x, y, width, , transform]) => `${x},${y},${width},${transform || ''}`);
}

const expectedRects = brandMarkSquares().map(({ x, y, size, transform }) => `${x},${y},${size},${transform || ''}`);

describe('brand assets', () => {
    it('reaches the edge of its view box without clipping the mitred corners', () => {
        const [min, , side] = brandMarkViewBox().split(' ').map(Number);
        expect(min + side / 2).toBeCloseTo(50, 3);
        // Outer squares are 60 wide; rotated, they need more than their own width plus a stroke.
        expect(side).toBeGreaterThan(60 + BRAND_MARK_STROKE);
        expect(side).toBeLessThan(100);
        const padded = brandMarkViewBox({ padding: 0.2 }).split(' ').map(Number)[2];
        expect(side / padded).toBeCloseTo(0.6, 3);
    });

    it('commits the favicon the generator writes', () => {
        expect(read('public/favicon.svg')).toBe(FAVICON_SVG);
        for (const asset of RASTER_ASSETS) {
            expect(fs.existsSync(path.join(process.cwd(), 'public', asset.path)), asset.path).toBe(true);
        }
    });

    it('draws the same mark in the boot shell and the social cover', () => {
        const html = read('index.html');
        expect(rectsAfter(html, '<svg class="landing-boot-mark"')).toEqual(expectedRects);
        expect(html).toContain(`<svg class="landing-boot-mark" viewBox="${brandMarkViewBox()}"`);
        expect(html).toContain(`fill="${BRAND_INK}" stroke="${BRAND_RED}"`);
        expect(html).toContain('href="/apple-touch-icon.png');

        const cover = read('scripts/og-cover.svg');
        expect(rectsAfter(cover, 'The logo (src/brand/logoGeometry.js)')).toEqual(expectedRects);
    });
});
