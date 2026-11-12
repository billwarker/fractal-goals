// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseLandingContent } from '../landingContent';
import landingContent from '../landingContent';
import { fallbackContent } from '../landingFallback';

describe('parseLandingContent', () => {
    it('maps the editable markdown into the one-page landing', () => {
        const content = parseLandingContent(`
## SEO

**Title:** Custom SEO Title
**Description:** Custom SEO description.
**Open Graph Title:** Custom OG title

## Header

**Brand:** Custom Brand

- [Sign in](https://example.com)

## Hero

**Kicker:** Custom kicker
**Mobile Body:** Short body.

# Custom hero title

Custom hero body.

## Demo

**Label:** Explore it
**Hint:** No account needed.
**Waitlist Label:** or wait

## Beta Form

**Email Label:** Email address
**Submit Label:** Join

## Footer

**Note:** Custom note.

- [Privacy](/privacy)
`);

        expect(content.seo).toEqual({ title: 'Custom SEO Title', description: 'Custom SEO description.', ogTitle: 'Custom OG title' });
        expect(content.header).toEqual({ brand: 'Custom Brand', nav: [{ label: 'Sign in', href: 'https://example.com' }] });
        expect(content.hero).toMatchObject({
            kicker: 'Custom kicker',
            mobileBody: 'Short body.',
            title: 'Custom hero title',
            body: 'Custom hero body.',
        });
        expect(content.demo).toEqual({ label: 'Explore it', hint: 'No account needed.', waitlistLabel: 'or wait' });
        expect(content.betaForm.emailLabel).toBe('Email address');
        expect(content.betaForm.submitLabel).toBe('Join');
        expect(content.betaForm.errorMessage).toBe(fallbackContent.betaForm.errorMessage);
        expect(content.footer).toEqual({ note: 'Custom note.', links: [{ label: 'Privacy', href: '/privacy' }] });
    });

    it('falls back section by section when the markdown omits them', () => {
        expect(parseLandingContent('')).toEqual(fallbackContent);
    });

    it('ships every section from landing.md', () => {
        expect(landingContent.hero.title).toBe('Achieve Your Most Ambitious Goals');
        expect(landingContent.demo.label).toBe('Try the live demo');
        expect(landingContent.header.nav[0].label).toBe('Log in');
        expect(landingContent.footer.links).toHaveLength(2);
    });
});
