import fs from 'node:fs';
import path from 'node:path';
import landingContent from '../../content/landingContent';

describe('landing bootstrap architecture', () => {
    it('branches into public and authenticated bundles without importing the app shell eagerly', () => {
        const main = fs.readFileSync(path.join(process.cwd(), 'src/main.jsx'), 'utf8');

        expect(main).toContain("import('./PublicLandingRoot')");
        expect(main).toContain("import('./AuthenticatedRoot')");
        expect(main).not.toMatch(/from ['"]\.\/AppRouter/);
        expect(main).not.toMatch(/from ['"]\.\/contexts\/AuthContext/);
        expect(main).not.toMatch(/from ['"]@sentry\/react/);

        const publicRoot = fs.readFileSync(path.join(process.cwd(), 'src/PublicLandingRoot.jsx'), 'utf8');
        const authenticatedRoot = fs.readFileSync(path.join(process.cwd(), 'src/AuthenticatedRoot.jsx'), 'utf8');
        expect(publicRoot).toContain("import ApplicationProviders from './ApplicationProviders'");
        expect(authenticatedRoot).toContain("import ApplicationProviders from './ApplicationProviders'");
    });

    it('ships an accessible landing first-paint shell before React boots', () => {
        const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
        const landingCss = fs.readFileSync(path.join(process.cwd(), 'src/pages/Landing.module.css'), 'utf8');

        expect(html).toContain('data-entry-surface');
        expect(html).toContain('id="landing-boot-shell" class="landing-boot-shell"');
        expect(html).toContain('aria-busy="true"');
        expect(html).toMatch(/<main id="landing-boot-shell"[\s\S]*?<\/main>\s*<div id="root"><\/div>/);
        expect(html).toMatch(/\.landing-boot-shell[\s\S]*?position: fixed/);
        expect(html).toMatch(/\.landing-boot-shell[\s\S]*?background-image:[\s\S]*?linear-gradient/);
        expect(landingCss).toContain('--landing-css-ready: 1');
        expect(landingCss).toMatch(/\.page[\s\S]*?background-image:[\s\S]*?linear-gradient/);
        expect(html).toContain(landingContent.hero.title);
        expect(html).toContain(landingContent.hero.body);
    });
});
