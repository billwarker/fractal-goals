import React from 'react';

/**
 * Linkify Component
 * 
 * Takes a string of text and renders it with clickable links for any URLs found.
 * 
 * @param {Object} props
 * @param {string} props.children - The text content to process
 * @param {string} props.className - Optional class name for the container
 * @param {Object} props.style - Optional inline styles
 * @param {string} props.linkStyle - Optional inline styles for the link
 */
const Linkify = ({ children, className, style, linkColor }) => {
    if (!children || typeof children !== 'string') {
        return <span className={className} style={style}>{children}</span>;
    }

    // Regex to detect URLs (simple version)
    // Matches http:// or https:// followed by non-whitespace characters
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    const parts = children.split(urlRegex);

    return (
        <span className={className} style={style}>
            {parts.map((part, index) => {
                if (part.match(urlRegex)) {
                    return (
                        <a
                            key={index}
                            href={part}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()} // Prevent triggering parent click handlers (e.g., cards)
                            style={{
                                color: linkColor || 'var(--color-brand-primary)',
                                textDecoration: 'underline',
                                cursor: 'pointer',
                                wordBreak: 'break-all'
                            }}
                        >
                            {part}
                        </a>
                    );
                }
                return part;
            })}
        </span>
    );
};

export default Linkify;
