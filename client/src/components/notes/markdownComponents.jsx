import React from 'react';

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

export const markdownComponents = {
    a({ href = '', children, ...props }) {
        if (!isSafeHref(href)) {
            return <span>{children}</span>;
        }
        const isExternal = /^https?:\/\//i.test(href);
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
