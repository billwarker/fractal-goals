import source from './landing.md?raw';

const fallbackContent = {
    seo: {
        title: 'Fractal Goals - One App for Goals, Programs & Training',
        description: 'Break big goals into trackable trees, build your own programs, and log every session in one composable platform. Built for people training across many disciplines.',
        ogTitle: 'Track every goal, program, and training session in one place',
    },
    header: {
        brand: 'Fractal Goals',
        nav: [
            { label: 'Examples', href: '#examples' },
            { label: 'App showcase', href: '#showcase' },
            { label: 'Private beta', href: '#beta' },
            { label: 'Open app', href: 'https://my.fractalgoals.com' },
        ],
    },
    hero: {
        kicker: 'Composable goal tracking',
        title: 'Track every goal, program, and training session in one place',
        body: 'Want to achieve big goals? Start by making them smaller. Fractal Goals breaks any ambition into a tree of smaller goals, lets you build your own programs toward them, and logs every session, activity, and metric - so all your training, across every discipline, lives in one connected system instead of five scattered apps.',
        actions: [
            { label: 'Request beta access', href: '#beta' },
            { label: 'Go to app', href: 'https://my.fractalgoals.com' },
        ],
    },
    audience: {
        eyebrow: 'Built for serious, self-directed practitioners',
        title: "If you're training for more than one thing, this is your home base.",
        cards: [],
    },
    examples: {
        eyebrow: 'Example fractals',
        title: "See how real goals break down - from ambition to today's session.",
        body: 'Every Fractal Goals plan starts as a single big goal and branches into smaller, trackable goals, programs, and sessions. Here are four complete examples across different disciplines.',
    },
    beta: {
        eyebrow: 'Private beta',
        title: 'Help test the next version of goal-tracking software.',
        body: "Beta access is invite-based while the product is being shaped. Tell us what you want to organize - your training, a creative practice, a language, a startup - and we'll follow up with testers who match the current build.",
    },
    betaForm: {
        nameLabel: 'Name',
        emailLabel: 'Email',
        useCaseLabel: 'Testing focus',
        noteLabel: 'Note',
        submitLabel: 'Request invite',
        submittingLabel: 'Sending...',
        validationMessage: 'Add your name, a valid email, and what you want to test.',
        successCreatedMessage: "You're on the private beta request list.",
        successUpdatedMessage: 'Your private beta request has been updated.',
        errorMessage: 'Could not send the request. Please try again.',
        useCaseOptions: [
            { label: 'Personal goals', value: 'personal goals' },
            { label: 'Creative practice', value: 'creative practice' },
            { label: 'Fitness training', value: 'fitness training' },
            { label: 'Startup or work', value: 'startup or work' },
            { label: 'Research or learning', value: 'research or learning' },
        ],
    },
};

const metaKeyMap = {
    brand: 'brand',
    description: 'description',
    'email label': 'emailLabel',
    'error message': 'errorMessage',
    eyebrow: 'eyebrow',
    kicker: 'kicker',
    label: 'label',
    'name label': 'nameLabel',
    'note label': 'noteLabel',
    'open graph title': 'ogTitle',
    'submit label': 'submitLabel',
    'submitting label': 'submittingLabel',
    'success created message': 'successCreatedMessage',
    'success updated message': 'successUpdatedMessage',
    title: 'title',
    'use case label': 'useCaseLabel',
    'validation message': 'validationMessage',
};

const topLevelHeadingPattern = /^##\s+(.+?)\s*$/;
const nestedHeadingPattern = /^###\s+(.+?)\s*$/;
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

function readPipeOptions(section) {
    return section
        .split(/\r?\n/)
        .filter((line) => line.trim().startsWith('- '))
        .map((line) => line.replace(/^-\s+/, '').split('|').map((part) => part.trim()))
        .filter(([label, value]) => label && value)
        .map(([label, value]) => ({ label, value }));
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

    content.examples = readStandardSection(markdown, 'Examples', content.examples);

    content.beta = readStandardSection(markdown, 'Beta', content.beta);

    const betaFormSection = getTopLevelSection(markdown, 'Beta Form');
    const formMetadata = readMetadata(betaFormSection);
    const optionSection = getNestedSection(betaFormSection, 'Use Case Options');
    const useCaseOptions = readPipeOptions(optionSection);
    content.betaForm = {
        ...content.betaForm,
        ...formMetadata,
        useCaseOptions: useCaseOptions.length ? useCaseOptions : content.betaForm.useCaseOptions,
    };

    return content;
}

const landingContent = parseLandingContent(source);

export default landingContent;
