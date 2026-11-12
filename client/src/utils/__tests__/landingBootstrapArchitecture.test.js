// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import landingContent from '../../content/landingContent';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('landing bootstrap architecture', () => {
    it('branches into public, demo and authenticated bundles without importing the app shell eagerly', () => {
        const main = read('src/main.jsx');

        expect(main).toContain("import('./PublicLandingRoot')");
        expect(main).toContain("import('./demo/DemoRoot')");
        expect(main).toContain("import('./AuthenticatedRoot')");
        // As one ternary the minifier folds the imports into a single preload with
        // AuthenticatedRoot's dependencies, and the other roots lose their CSS.
        expect(main).not.toMatch(/\?\s*import\(/);
        expect(main).not.toMatch(/from ['"]\.\/AppRouter/);
        expect(main).not.toMatch(/from ['"]\.\/contexts\/AuthContext/);
        expect(main).not.toMatch(/from ['"]@sentry\/react/);

        expect(read('src/PublicLandingRoot.jsx')).toContain("import ApplicationProviders from './ApplicationProviders'");
        expect(read('src/AuthenticatedRoot.jsx')).toContain("import ApplicationProviders from './ApplicationProviders'");
        expect(read('src/demo/DemoRoot.jsx')).toContain("import ApplicationProviders from '../ApplicationProviders'");
    });

    it('ships an accessible landing first-paint shell that mirrors the hero', () => {
        const html = read('index.html');
        const landingCss = read('src/pages/Landing.module.css');

        expect(html).toContain('data-entry-surface');
        expect(html).toContain('id="landing-boot-shell" class="landing-boot-shell"');
        expect(html).toContain('aria-busy="true"');
        expect(html).toMatch(/<main id="landing-boot-shell"[\s\S]*?<\/main>\s*<div id="root"><\/div>/);
        expect(html).toMatch(/\.landing-boot-shell[\s\S]*?position: fixed/);
        expect(html).toMatch(/\.landing-boot-shell[\s\S]*?background-image:[\s\S]*?linear-gradient/);
        expect(html).toMatch(/\.landing-boot-brand[\s\S]*?text-transform: uppercase/);
        // Sizes match the real hero, so the hand-off doesn't jump.
        const titleSize = 'font-size: clamp(2.5rem, min(6.2vw, 8.5vh), 6.4rem)';
        expect(html).toContain(titleSize);
        expect(landingCss).toContain(titleSize);
        // The words match landing.md, so the hand-off doesn't change them.
        expect(html).toContain(`<span>${landingContent.header.nav[0].label}</span>`);
        expect(html).toContain(`<div class="landing-boot-kicker" aria-hidden="true">${landingContent.hero.kicker}</div>`);
        expect(html).toContain(landingContent.hero.title);
        expect(html).toContain(landingContent.hero.body);
        expect(html).toContain(landingContent.hero.mobileBody);
        expect(html).toContain(`>${landingContent.demo.label}</div>`);
        expect(html).toContain(`<title>${landingContent.seo.title}</title>`);
        expect(html).toContain(`content="${landingContent.seo.description}"`);
        expect(landingCss).toContain('--landing-css-ready: 1');
    });
});
