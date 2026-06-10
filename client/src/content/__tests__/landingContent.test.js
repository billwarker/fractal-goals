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

**Name Label:** Full name
**Submit Label:** Join

### Use Case Options

- Testing | testing
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
        expect(content).not.toHaveProperty('features');
        expect(content).not.toHaveProperty('featureSlides');
        expect(content).not.toHaveProperty('faq');
        expect(content.betaForm.nameLabel).toBe('Full name');
        expect(content.betaForm.submitLabel).toBe('Join');
        expect(content.betaForm.useCaseOptions).toEqual([
            { label: 'Testing', value: 'testing' },
        ]);
    });
});
