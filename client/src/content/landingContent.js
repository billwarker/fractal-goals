import source from './landing.md?raw';

import { fallbackContent } from './landingFallback';

const metaKeyMap = {
    brand: 'brand',
    description: 'description',
    'email label': 'emailLabel',
    'error message': 'errorMessage',
    eyebrow: 'eyebrow',
    'goal label': 'goalLabel',
    'goal placeholder': 'goalPlaceholder',
    heading: 'heading',
    kicker: 'kicker',
    label: 'label',
    'mobile body': 'mobileBody',
    'nav label': 'navLabel',
    'open graph title': 'ogTitle',
    'submit label': 'submitLabel',
    'submitting label': 'submittingLabel',
    'success created message': 'successCreatedMessage',
    'success updated message': 'successUpdatedMessage',
    title: 'title',
    'validation message': 'validationMessage',
};

const topLevelHeadingPattern = /^##\s+(.+?)\s*$/;
const nestedHeadingPattern = /^###\s+(.+?)\s*$/;
const detailHeadingPattern = /^####\s+(.+?)\s*$/;
const metaPattern = /^\*\*(.+?):\*\*\s*(.+?)\s*$/;
const linkPattern = /^-\s+\[(.+?)]\((.+?)\)\s*$/;

function cloneFallback() {
    return JSON.parse(JSON.stringify(fallbackContent));
}

function normalizeMetaKey(key) {
    return metaKeyMap[key.trim().toLowerCase()] || key.trim().replace(/\s+([a-z])/gi, (_, letter) => letter.toUpperCase());
}

function getTopLevelSection(markdown, title) {
    const lines = markdown.split(/\r?\n/);
    const sectionLines = [];
    let isInside = false;

    for (const line of lines) {
        const match = line.match(topLevelHeadingPattern);
        if (match) {
            if (isInside) break;
            isInside = match[1].trim().toLowerCase() === title.toLowerCase();
            continue;
        }
        if (isInside) sectionLines.push(line);
    }

    return sectionLines.join('\n').trim();
}

function readMetadata(section) {
    return section.split(/\r?\n/).reduce((metadata, line) => {
        const match = line.match(metaPattern);
        if (!match) return metadata;
        return {
            ...metadata,
            [normalizeMetaKey(match[1])]: match[2].trim(),
        };
    }, {});
}

function readFirstHeading(section, level = 1) {
    const prefix = '#'.repeat(level);
    const line = section.split(/\r?\n/).find((current) => current.startsWith(`${prefix} `));
    return line ? line.replace(`${prefix} `, '').trim() : '';
}

function readBody(section, { omitLinks = true } = {}) {
    return section
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .filter((line) => !line.match(metaPattern))
        .filter((line) => !line.startsWith('#'))
        .filter((line) => (omitLinks ? !line.match(linkPattern) : true))
        .join('\n')
        .trim();
}

function readLinks(section) {
    return section
        .split(/\r?\n/)
        .map((line) => line.match(linkPattern))
        .filter(Boolean)
        .map((match) => ({ label: match[1].trim(), href: match[2].trim() }));
}

function readCards(section) {
    const lines = section.split(/\r?\n/);
    const cards = [];
    let current = null;

    for (const line of lines) {
        const match = line.match(nestedHeadingPattern);
        if (match) {
            if (current) cards.push(current);
            current = { title: match[1].trim(), lines: [] };
            continue;
        }
        if (current) current.lines.push(line);
    }

    if (current) cards.push(current);

    return cards.map((card) => {
        const body = readBody(card.lines.join('\n'), { omitLinks: false });
        return { title: card.title, body };
    }).filter((card) => card.title && card.body);
}

function readDetailCards(section) {
    const lines = section.split(/\r?\n/);
    const cards = [];
    let current = null;

    for (const line of lines) {
        const match = line.match(detailHeadingPattern);
        if (match) {
            if (current) cards.push(current);
            current = { title: match[1].trim(), lines: [] };
            continue;
        }
        if (current) current.lines.push(line);
    }

    if (current) cards.push(current);

    return cards.map((card) => {
        const body = readBody(card.lines.join('\n'), { omitLinks: false });
        return { title: card.title, body };
    }).filter((card) => card.title && card.body);
}

function getNestedSection(section, title) {
    const lines = section.split(/\r?\n/);
    const sectionLines = [];
    let isInside = false;

    for (const line of lines) {
        const match = line.match(nestedHeadingPattern);
        if (match) {
            if (isInside) break;
            isInside = match[1].trim().toLowerCase() === title.toLowerCase();
            continue;
        }
        if (isInside) sectionLines.push(line);
    }

    return sectionLines.join('\n').trim();
}

function getDetailIntro(section) {
    const lines = section.split(/\r?\n/);
    const introLines = [];
    for (const line of lines) {
        if (line.match(detailHeadingPattern)) break;
        introLines.push(line);
    }
    return introLines.join('\n').trim();
}

function getSectionIntro(section) {
    const lines = section.split(/\r?\n/);
    const introLines = [];
    for (const line of lines) {
        if (line.match(nestedHeadingPattern)) break;
        introLines.push(line);
    }
    return introLines.join('\n').trim();
}

function readStandardSection(markdown, sectionName, fallback) {
    const section = getTopLevelSection(markdown, sectionName);
    if (!section) return fallback;
    const metadata = readMetadata(section);
    return {
        ...fallback,
        ...metadata,
        title: readFirstHeading(section) || metadata.title || fallback.title,
        body: readBody(section) || fallback.body,
    };
}

export function parseLandingContent(markdown) {
    const content = cloneFallback();

    const seo = readMetadata(getTopLevelSection(markdown, 'SEO'));
    content.seo = { ...content.seo, ...seo };

    const headerSection = getTopLevelSection(markdown, 'Header');
    const headerMeta = readMetadata(headerSection);
    const nav = readLinks(headerSection);
    content.header = {
        ...content.header,
        ...headerMeta,
        nav: nav.length ? nav : content.header.nav,
    };

    const footerSection = getTopLevelSection(markdown, 'Footer');
    const footerMeta = readMetadata(footerSection);
    const footerLinks = readLinks(footerSection);
    content.footer = {
        ...content.footer,
        ...footerMeta,
        links: footerLinks.length ? footerLinks : content.footer.links,
    };

    const hero = readStandardSection(markdown, 'Hero', content.hero);
    const heroActions = readLinks(getTopLevelSection(markdown, 'Hero'));
    content.hero = {
        ...hero,
        actions: heroActions.length ? heroActions : content.hero.actions,
    };

    const audienceSection = getTopLevelSection(markdown, 'Audience');
    const audience = readStandardSection(markdown, 'Audience', content.audience);
    const audienceCards = readCards(audienceSection);
    content.audience = {
        ...audience,
        cards: audienceCards.length ? audienceCards : content.audience.cards,
    };

    const examplesSection = getTopLevelSection(markdown, 'Examples');
    content.examples = readStandardSection(markdown, 'Examples', content.examples);
    if (examplesSection) {
        // Keep nested highlight-card copy out of the section body.
        const examplesIntro = getSectionIntro(examplesSection);
        content.examples.body = readBody(examplesIntro) || content.examples.body;
        const exampleCards = readCards(examplesSection);
        content.examples.cards = exampleCards.length ? exampleCards : content.examples.cards;
    }

    const featuresSection = getTopLevelSection(markdown, 'Features');
    if (featuresSection) {
        const featuresIntro = getSectionIntro(featuresSection);
        const featuresMeta = readMetadata(featuresIntro);
        const items = {};
        // Per-feature parsing degrades per key: a missing/partial markdown
        // sub-block falls back to the hardcoded copy for that feature only.
        Object.entries({
            session: 'Session',
            activity: 'Activity',
            programs: 'Programs',
            analytics: 'Analytics',
            more: 'More',
        }).forEach(([key, headingTitle]) => {
            const itemSection = getNestedSection(featuresSection, headingTitle);
            const itemIntro = itemSection ? getDetailIntro(itemSection) : '';
            const itemMeta = itemIntro ? readMetadata(itemIntro) : {};
            const itemCards = itemSection ? readDetailCards(itemSection) : [];
            items[key] = {
                ...content.features.items[key],
                ...itemMeta,
                body: (itemIntro && readBody(itemIntro)) || content.features.items[key].body,
                cards: itemCards.length ? itemCards : content.features.items[key].cards,
            };
        });
        content.features = {
            ...content.features,
            ...featuresMeta,
            title: readFirstHeading(featuresIntro) || featuresMeta.title || content.features.title,
            body: readBody(featuresIntro) || content.features.body,
            items,
        };
    }

    const extrasSection = getTopLevelSection(markdown, 'Feature Extras');
    const extras = extrasSection ? readCards(extrasSection) : [];
    content.features.extras = extras.length ? extras : content.features.extras;

    content.beta = readStandardSection(markdown, 'Beta', content.beta);

    const betaFormSection = getTopLevelSection(markdown, 'Beta Form');
    const formMetadata = readMetadata(betaFormSection);
    content.betaForm = {
        ...content.betaForm,
        ...formMetadata,
    };

    return content;
}

const landingContent = parseLandingContent(source);

export default landingContent;
