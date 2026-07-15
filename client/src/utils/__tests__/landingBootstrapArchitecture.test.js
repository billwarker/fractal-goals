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
    });

    it('ships an accessible landing first-paint shell before React boots', () => {
        const html = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');

        expect(html).toContain('data-entry-surface');
        expect(html).toContain('class="landing-boot-shell"');
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain(landingContent.hero.title);
        expect(html).toContain(landingContent.hero.body);
    });
});
