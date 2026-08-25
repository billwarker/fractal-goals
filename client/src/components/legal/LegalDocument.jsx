import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './LegalDocument.module.css';
import { formatEffectiveDate } from '../../content/legal/legalContent';

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
 * Legal documents deliberately do not reuse `markdownComponents` from notes:
 * that map turns a lone link in a paragraph into a video embed, which has no
 * place in a policy. Only the safe-href guard is shared behaviour.
 */
const legalMarkdownComponents = {
    a({ href = '', children, ...props }) {
        if (!isSafeHref(href)) {
            return <span>{children}</span>;
        }
        const isExternal = /^https?:\/\//i.test(href);
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
    // Wide tables (subprocessors, retention) scroll within their own bounds
    // instead of forcing the surrounding surface to scroll horizontally.
    table({ node, children, ...props }) {
        return (
            <div className={styles.tableScroll}>
                <table {...props}>{children}</table>
            </div>
        );
    },
};

/**
 * Renders one legal document. Used by both the Settings Legal tab and the
 * public /privacy and /terms routes, so the same copy and typography serve
 * authenticated and anonymous readers.
 */
function LegalDocument({ document, showMeta = true, className = '' }) {
    if (!document) return null;

    const effectiveLabel = formatEffectiveDate(document.effective);

    return (
        <article className={[styles.document, className].filter(Boolean).join(' ')}>
            {showMeta && effectiveLabel && (
                <p className={styles.meta}>
                    Version {document.version} · Effective {effectiveLabel}
                </p>
            )}
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={legalMarkdownComponents}>
                {document.body}
            </ReactMarkdown>
        </article>
    );
}

export default LegalDocument;
