import { describe, expect, it } from 'vitest';

import { parseLandingContent } from '../landingContent';

describe('parseLandingContent', () => {
    it('maps editable markdown sections into landing page content', () => {
        const content = parseLandingContent(`
## SEO

**Title:** Custom SEO Title
**Description:** Custom SEO description.
**Open Graph Title:** Custom OG title

## Header

**Brand:** Custom Brand

- [Start](#start)

## Hero

**Kicker:** Custom kicker

# Custom hero title

Custom hero body.

- [Primary](#primary)
- [Secondary](#secondary)

## Audience

**Eyebrow:** Custom audience eyebrow

# Custom audience title

### Custom audience card

Custom audience body.

## Beta Form

**Email Label:** Email address
**Submit Label:** Join
`);

        expect(content.seo.title).toBe('Custom SEO Title');
        expect(content.header.brand).toBe('Custom Brand');
        expect(content.header.nav).toEqual([{ label: 'Start', href: '#start' }]);
        expect(content.hero).toMatchObject({
            kicker: 'Custom kicker',
            title: 'Custom hero title',
            body: 'Custom hero body.',
            actions: [
                { label: 'Primary', href: '#primary' },
                { label: 'Secondary', href: '#secondary' },
            ],
        });
        expect(content.audience.cards).toEqual([
            { title: 'Custom audience card', body: 'Custom audience body.' },
        ]);
        expect(content).not.toHaveProperty('featureSlides');
        expect(content).not.toHaveProperty('faq');
        expect(content.betaForm.emailLabel).toBe('Email address');
        expect(content.betaForm.submitLabel).toBe('Join');
    });

    it('parses the features section with per-feature labels, headings, and bodies', () => {
        const content = parseLandingContent(`
## Features

**Eyebrow:** Custom toolkit

# Custom features title

Custom features intro.

### Session

**Label:** Custom Sessions
**Heading:** Custom session heading.

Custom session body.

### Programs

**Label:** Custom Programs
**Heading:** Custom programs heading.

Custom programs body.

## Feature Extras

### Custom extra

Custom extra body.
`);

        expect(content.features.eyebrow).toBe('Custom toolkit');
        expect(content.features.title).toBe('Custom features title');
        expect(content.features.body).toBe('Custom features intro.');
        expect(content.features.items.session).toEqual({
            label: 'Custom Sessions',
            heading: 'Custom session heading.',
            body: 'Custom session body.',
        });
        expect(content.features.items.programs.body).toBe('Custom programs body.');
        // Features missing from markdown keep their fallback copy.
        expect(content.features.items.activity.label).toBe('Activities');
        expect(content.features.items.analytics.heading).toBe('See whether the work is working.');
        expect(content.features.extras).toEqual([
            { title: 'Custom extra', body: 'Custom extra body.' },
        ]);
    });

    it('parses examples highlight cards without leaking them into the section body', () => {
        const content = parseLandingContent(`
## Examples

# Custom examples title

Custom examples intro.

### Custom highlight

Custom highlight body.
`);

        expect(content.examples.title).toBe('Custom examples title');
        expect(content.examples.body).toBe('Custom examples intro.');
        expect(content.examples.cards).toEqual([
            { title: 'Custom highlight', body: 'Custom highlight body.' },
        ]);

        // Omitting the cards keeps the built-in four.
        const fallbackContent = parseLandingContent('## Examples\n\n# Title only\n');
        expect(fallbackContent.examples.cards).toHaveLength(4);
    });

    it('parses per-section nav labels and falls back when they are omitted', () => {
        const content = parseLandingContent(`
## Hero

**Nav Label:** Start here

# Custom hero title

## Examples

**Nav Label:** Explore

# Custom examples title
`);

        expect(content.hero.navLabel).toBe('Start here');
        expect(content.examples.navLabel).toBe('Explore');
        // Sections without a markdown Nav Label keep the built-in labels.
        expect(content.audience.navLabel).toBe("Who it's for");
        expect(content.features.navLabel).toBe('Features');
        expect(content.beta.navLabel).toBe('Beta');
    });

    it('falls back to built-in features content when markdown omits the sections', () => {
        const content = parseLandingContent('## Hero\n\n# Title only\n');

        expect(content.features.items.session.label).toBe('Sessions');
        expect(content.features.items.more.label).toBe('And more');
        expect(content.features.extras).toHaveLength(4);
        expect(content.features.extras.map((extra) => extra.title)).toContain('Custom goal icons');
    });
});
