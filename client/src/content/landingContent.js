import source from './landing.md?raw';

import { fallbackContent } from './landingFallback';

const metaKeyMap = {
    brand: 'brand',
    description: 'description',
    'email label': 'emailLabel',
    'error message': 'errorMessage',
    'goal label': 'goalLabel',
    'goal placeholder': 'goalPlaceholder',
    kicker: 'kicker',
    label: 'label',
    'mobile body': 'mobileBody',
    note: 'note',
    hint: 'hint',
    'open graph title': 'ogTitle',
    'submit label': 'submitLabel',
    'submitting label': 'submittingLabel',
    'success created message': 'successCreatedMessage',
    'success updated message': 'successUpdatedMessage',
    title: 'title',
    'validation message': 'validationMessage',
    'waitlist label': 'waitlistLabel',
};

const topLevelHeadingPattern = /^##\s+(.+?)\s*$/;
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

    content.seo = { ...content.seo, ...readMetadata(getTopLevelSection(markdown, 'SEO')) };

    const headerSection = getTopLevelSection(markdown, 'Header');
    const nav = readLinks(headerSection);
    content.header = {
        ...content.header,
        ...readMetadata(headerSection),
        nav: nav.length ? nav : content.header.nav,
    };

    const footerSection = getTopLevelSection(markdown, 'Footer');
    const footerLinks = readLinks(footerSection);
    content.footer = {
        ...content.footer,
        ...readMetadata(footerSection),
        links: footerLinks.length ? footerLinks : content.footer.links,
    };

    content.hero = readStandardSection(markdown, 'Hero', content.hero);
    content.demo = { ...content.demo, ...readMetadata(getTopLevelSection(markdown, 'Demo')) };
    content.betaForm = { ...content.betaForm, ...readMetadata(getTopLevelSection(markdown, 'Beta Form')) };

    return content;
}

const landingContent = parseLandingContent(source);

export default landingContent;
