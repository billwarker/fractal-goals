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
            { label: 'Features', href: '#features' },
            { label: 'Private beta', href: '#beta' },
            { label: 'Open app', href: 'https://my.fractalgoals.com' },
        ],
    },
    hero: {
        kicker: 'Composable goal tracking',
        navLabel: 'Top',
        title: 'Track every goal, program, and training session in one place',
        body: 'Want to achieve big goals? Start by making them smaller. Fractal Goals breaks any ambition into a tree of smaller goals, lets you build your own programs toward them, and logs every session, activity, and metric - so all your training, across every discipline, lives in one connected system instead of five scattered apps.',
        actions: [
            { label: 'Request beta access', href: '#beta' },
            { label: 'Go to app', href: 'https://my.fractalgoals.com' },
        ],
    },
    audience: {
        eyebrow: 'Built for serious, self-directed practitioners',
        navLabel: "Who it's for",
        title: "If you're training for more than one thing, this is your home base.",
        cards: [],
    },
    examples: {
        eyebrow: 'Example fractals',
        navLabel: 'Goals',
        title: "See how real goals break down - from ambition to today's session.",
        body: 'Every Fractal Goals plan starts as a single big goal and branches into smaller, trackable goals, programs, and sessions. Here are four complete examples across different disciplines.',
    },
    features: {
        eyebrow: 'The full toolkit',
        navLabel: 'Features',
        title: 'Plan it, run it, measure it - one connected system.',
        body: 'Pick a feature to see it running on real data from the example fractal above.',
        items: {
            session: {
                label: 'Sessions',
                heading: 'Log the work, not just the plan.',
                body: 'A session is one real block of work: its activities, metrics, timers, and notes in a single record. Run it live with a timer or log it after the fact - either way it rolls up to the goals it serves, so the log always tells you what the work was for.',
            },
            activity: {
                label: 'Activities',
                heading: 'Every activity knows which goals it serves.',
                body: "Activities are reusable building blocks with their own metrics. Link an activity to a goal once and every session that includes it feeds that goal automatically - the credit flows up the tree, from today's reps all the way to the ultimate ambition.",
            },
            programs: {
                label: 'Programs',
                heading: 'Structure weeks of work on a real calendar.',
                body: 'Programs organize goals and session templates into blocks and days. Plan a training block, schedule its days on the calendar, and watch completion fill in as the sessions get logged.',
            },
            analytics: {
                label: 'Analytics',
                heading: 'See whether the work is working.',
                body: 'Sessions feed your charts automatically: duration trends, time per activity, and metric progress over time. No spreadsheets and no manual exports - the training log is the dataset.',
            },
            more: {
                label: 'And more',
                heading: 'The details that make it livable.',
                body: 'Fractal Goals is built for daily use, not just planning. Notes, automatic progress comparisons, theming, and per-level customization keep the everyday loop fast and pleasant.',
            },
        },
        extras: [
            {
                title: 'Notes',
                body: 'Attach notes - including images - to any goal, session, or activity, and browse everything on one searchable timeline.',
            },
            {
                title: 'Progress tracking',
                body: "Completed activities are compared against your own history automatically, so every session shows whether you're trending up.",
            },
            {
                title: 'Light & dark mode',
                body: 'A full theme system that is easy on the eyes at 6am or midnight. Try the toggle.',
            },
            {
                title: 'Custom goal icons',
                body: 'Every goal level has a configurable shape and color, so your tree reads at a glance.',
            },
        ],
    },
    beta: {
        eyebrow: 'Private beta',
        navLabel: 'Beta',
        title: 'Help test the next version of goal-tracking software.',
        body: "Beta access is invite-based while the product is being shaped. Drop your email and we'll follow up as new tester slots open.",
    },
    betaForm: {
        emailLabel: 'Email',
        submitLabel: 'Request beta access',
        submittingLabel: 'Sending...',
        validationMessage: 'Add a valid email to request beta access.',
        successCreatedMessage: "You're on the private beta request list.",
        successUpdatedMessage: 'Your private beta request has been updated.',
        errorMessage: 'Could not send the request. Please try again.',
    },
};

const metaKeyMap = {
    brand: 'brand',
    description: 'description',
    'email label': 'emailLabel',
    'error message': 'errorMessage',
    eyebrow: 'eyebrow',
    heading: 'heading',
    kicker: 'kicker',
    label: 'label',
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
            const itemMeta = itemSection ? readMetadata(itemSection) : {};
            items[key] = {
                ...content.features.items[key],
                ...itemMeta,
                body: (itemSection && readBody(itemSection)) || content.features.items[key].body,
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
