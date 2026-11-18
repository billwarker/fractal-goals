// @vitest-environment node
/**
 * services/tracking_plan.json lists every event the server keeps. Each call site must name a
 * planned event of the right surface, and every planned event must still be sent from
 * somewhere, so the plan (and the Privacy Policy listing it) never drifts from the code.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, '..', '..');
const plan = JSON.parse(readFileSync(join(srcRoot, '..', '..', 'services', 'tracking_plan.json'), 'utf8'));
const surfaceOf = new Map(plan.events.map((event) => [event.name, event.surface]));

const sourceFiles = (directory) => readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'test' ? [] : sourceFiles(path);
    return /\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
});

function callSites() {
    const sites = [];
    for (const file of sourceFiles(srcRoot)) {
        const content = readFileSync(file, 'utf8');
        const where = relative(srcRoot, file);
        for (const [, fn, name] of content.matchAll(/\b(trackEvent|trackPublicEvent)\(\s*'([a-z_]+)'/g)) {
            sites.push({ name, surface: fn === 'trackPublicEvent' ? 'public' : 'app', where });
        }
        // The outbox's health events are mapped by name and sent through trackEvent.
        const healthMap = content.match(/const HEALTH_EVENTS = \{([\s\S]*?)\};/);
        if (healthMap) {
            for (const [, name] of healthMap[1].matchAll(/:\s*'([a-z_]+)'/g)) sites.push({ name, surface: 'app', where });
        }
    }
    return sites;
}

describe('tracking plan call sites', () => {
    const sites = callSites();

    it('finds the instrumented call sites', () => {
        expect(sites.length).toBeGreaterThan(20);
    });

    it('sends only planned events, each on its own surface', () => {
        const wrong = sites.filter((site) => surfaceOf.get(site.name) !== site.surface);
        expect(wrong).toEqual([]);
    });

    it('still sends every planned event', () => {
        const sent = new Set(sites.map((site) => site.name));
        const unsent = plan.events.map((event) => event.name).filter((name) => !sent.has(name));
        expect(unsent).toEqual([]);
    });
});
