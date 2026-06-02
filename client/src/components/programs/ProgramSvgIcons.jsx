import React from 'react';

function SvgIcon({ children, size = 16, className = '', title }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
        >
            {title ? <title>{title}</title> : null}
            {children}
        </svg>
    );
}

export function ProgramCalendarIcon(props) {
    return (
        <SvgIcon {...props}>
            <rect x="4" y="5" width="16" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 3.5v3M16 3.5v3M4 9h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 13h2M12 13h2M16 13h1M8 16.5h2M12 16.5h2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </SvgIcon>
    );
}

export function ProgramTargetIcon(props) {
    return (
        <SvgIcon {...props}>
            <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <path d="M16.5 7.5l3-3M18.4 4.6h1.9v1.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </SvgIcon>
    );
}

export function ProgramCheckIcon(props) {
    return (
        <SvgIcon {...props}>
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 12.2l2.5 2.5L16.4 8.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </SvgIcon>
    );
}

export function ProgramPendingIcon(props) {
    return (
        <SvgIcon {...props}>
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
        </SvgIcon>
    );
}

export function ProgramPlusIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgIcon>
    );
}

export function ProgramMinusIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </SvgIcon>
    );
}
