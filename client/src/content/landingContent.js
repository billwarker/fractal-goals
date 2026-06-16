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
            { label: 'Goals', href: '#examples' },
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
        // Card order maps to the goals-view demo keys in Landing.jsx:
        // lineage, evidence, metrics, layout.
        cards: [
            {
                title: 'Focus on any goal',
                body: "Click a goal to scope the tree to its lineage - everything it serves and everything that serves it.",
            },
            {
                title: 'Evidence-aware branches',
                body: 'Branches with recent completed work stay bright; inactive ones fade so you can see where the work is landing.',
            },
            {
                title: 'Metrics at a glance',
                body: 'Overlay practice time and session counts on every goal, pulled straight from the logged sessions.',
            },
            {
                title: 'Tree or hierarchy',
                body: 'Read the same goals as a spatial tree or a compact hierarchy - whichever fits how you think.',
            },
        ],
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
                cards: [
                    { title: 'One record for the work', body: 'Keep activities, metrics, timers, notes, and completions together instead of scattering the log across tools.' },
                    { title: 'Live or after the fact', body: 'Run a session with a timer or record it later; either path preserves the same evidence trail.' },
                    { title: 'Goal credit is automatic', body: 'Completed work rolls up to every connected goal so progress stays tied to the reason you trained.' },
                    { title: 'Notes stay in context', body: 'Session notes remain attached to the work that produced them, ready for review when patterns emerge.' },
                ],
            },
            activity: {
                label: 'Activities',
                heading: 'Every activity knows which goals it serves.',
                body: "Activities are reusable building blocks with their own metrics. Link an activity to a goal once and every session that includes it feeds that goal automatically - the credit flows up the tree, from today's reps all the way to the ultimate ambition.",
                cards: [
                    { title: 'Reusable building blocks', body: 'Define an activity once, then reuse it across sessions, templates, and programs without rebuilding its metrics.' },
                    { title: 'Goal associations travel with it', body: 'When an activity belongs to a goal, every future session that uses it contributes to that goal automatically.' },
                    { title: 'Metrics are activity-native', body: 'Reps, ratings, durations, weights, attempts, and custom measures live with the activity they describe.' },
                    { title: 'Progress compares to history', body: 'Completed activities can be compared against prior work so the log shows whether practice is improving.' },
                ],
            },
            programs: {
                label: 'Programs',
                heading: 'Structure weeks of work on a real calendar.',
                body: 'Programs organize goals and session templates into blocks and days. Plan a training block, schedule its days on the calendar, and watch completion fill in as the sessions get logged.',
                cards: [
                    { title: 'Blocks create structure', body: 'Group days into training blocks so a long plan has visible phases, focus areas, and deadlines.' },
                    { title: 'Days carry templates', body: 'Attach session templates to program days so planned work is ready when the calendar date arrives.' },
                    { title: 'Calendar and blocks stay synced', body: 'Switch between time-based planning and block-based planning without losing context.' },
                    { title: 'Completion fills itself in', body: 'As sessions are logged, the program shows which days, blocks, and goals are actually getting done.' },
                ],
            },
            analytics: {
                label: 'Analytics',
                heading: 'See whether the work is working.',
                body: 'Sessions feed your charts automatically: duration trends, time per activity, and metric progress over time. No spreadsheets and no manual exports - the training log is the dataset.',
                cards: [
                    { title: 'Views are reusable', body: 'Save focused analytics views and publish the ones that best explain a fractal example.' },
                    { title: 'Filters follow the goal tree', body: 'Slice charts by goals, descendants, activities, groups, and inherited associations.' },
                    { title: 'Multiple charts can coexist', body: 'A view can hold several visualizations, from trends to totals, so the story has context.' },
                    { title: 'No manual export loop', body: 'Every chart is generated from logged sessions, activities, and metrics already in the system.' },
                ],
            },
            more: {
                label: 'And more',
                heading: 'The details that make it livable.',
                body: 'Fractal Goals is built for daily use, not just planning. Notes, automatic progress comparisons, theming, and per-level customization keep the everyday loop fast and pleasant.',
                cards: [],
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
        goalLabel: 'What goal are you trying to achieve?',
        goalPlaceholder: 'e.g. Get strong enough for a one-arm pull-up, learn jazz guitar, run a sub-20 5K...',
        submitLabel: 'Request beta access',
        submittingLabel: 'Sending...',
        validationMessage: 'Add a valid email to request beta access.',
        successCreatedMessage: "You're on the list. We invite new testers in small batches as slots open, and we'll email you from fractalgoals.com when it's your turn.",
        successUpdatedMessage: "Thanks - we've updated your request. We'll email you from fractalgoals.com as new tester slots open.",
        errorMessage: 'Could not send the request. Please try again.',
    },
};

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
