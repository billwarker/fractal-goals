import React from 'react';
import { parseVideoUrl } from '../../utils/videoEmbeds';
import VideoEmbed from './VideoEmbed';

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'];

function isSafeHref(href = '') {
    if (!href) return false;
    if (href.startsWith('/') || href.startsWith('#')) return true;
    try {
        return SAFE_PROTOCOLS.includes(new URL(href).protocol);
    } catch {
        return false;
    }
}

/**
 * A paragraph embeds a video when its only meaningful child is a single
 * autolink whose visible text equals its href (i.e. a bare URL pasted on its
 * own line, which remark-gfm autolinks). We inspect the hast node passed by
 * react-markdown to avoid matching URLs that appear inline within a sentence.
 */
function extractSoleVideoLink(node) {
    if (!node || !Array.isArray(node.children)) return null;
    const meaningful = node.children.filter(
        (child) => !(child.type === 'text' && !String(child.value).trim())
    );
    if (meaningful.length !== 1) return null;

    const [child] = meaningful;
    if (child.type !== 'element' || child.tagName !== 'a') return null;

    const href = child.properties && child.properties.href;
    if (!href) return null;

    const linkText = (child.children || [])
        .map((c) => (c.type === 'text' ? c.value : ''))
        .join('')
        .trim();
    if (linkText && linkText !== href) return null;

    return parseVideoUrl(href);
}

export const markdownComponents = {
    p({ node, children, ...props }) {
        const embed = extractSoleVideoLink(node);
        if (embed) {
            return <VideoEmbed provider={embed.provider} embedUrl={embed.embedUrl} />;
        }
        return <p {...props}>{children}</p>;
    },
    a({ href = '', children, ...props }) {
        if (!isSafeHref(href)) {
            return <span>{children}</span>;
        }
        const isExternal = /^https?:\/\//i.test(href);
        // Drop the mdast/hast node before spreading onto the DOM anchor.
        delete props.node;
        return (
            <a
                {...props}
                href={href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
            >
                {children}
            </a>
        );
    },
};
