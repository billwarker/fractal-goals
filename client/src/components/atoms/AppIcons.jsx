function SvgIcon({
    children,
    size = 16,
    className = '',
    strokeWidth = 2,
    title,
    ...props
}) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden={title ? undefined : true}
            role={title ? 'img' : undefined}
            focusable="false"
            {...props}
        >
            {title ? <title>{title}</title> : null}
            {children}
        </svg>
    );
}

export function AlertTriangleIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M10.3 4.4 2.9 17.2A2 2 0 0 0 4.6 20h14.8a2 2 0 0 0 1.7-2.8L13.7 4.4a2 2 0 0 0-3.4 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
        </SvgIcon>
    );
}

export function CalendarIcon(props) {
    return (
        <SvgIcon {...props}>
            <rect x="4" y="5" width="16" height="15" rx="3" />
            <path d="M8 3.5v3" />
            <path d="M16 3.5v3" />
            <path d="M4 9h16" />
            <path d="M8 13h2" />
            <path d="M14 13h2" />
            <path d="M8 17h2" />
        </SvgIcon>
    );
}

export function ClipboardIcon(props) {
    return (
        <SvgIcon {...props}>
            <rect x="6" y="4.5" width="12" height="16" rx="2" />
            <path d="M9.5 4h5L15 6.5H9l.5-2.5Z" />
            <path d="M9 11h6" />
            <path d="M9 15h5" />
        </SvgIcon>
    );
}

export function ClockIcon(props) {
    return (
        <SvgIcon {...props}>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
        </SvgIcon>
    );
}

export function EditPencilIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z" />
            <path d="m13.5 6.5 4 4" />
        </SvgIcon>
    );
}

export function FolderIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4l2 2h6a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5v-9Z" />
            <path d="M3.5 9h17" />
        </SvgIcon>
    );
}

export function InboxIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M4 13 6.8 5.5A2.3 2.3 0 0 1 9 4h6a2.3 2.3 0 0 1 2.2 1.5L20 13v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-4Z" />
            <path d="M4 13h5l1.5 2h3L15 13h5" />
            <path d="M12 4v6" />
            <path d="m9.5 7.5 2.5 2.5 2.5-2.5" />
        </SvgIcon>
    );
}

export function LightbulbIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M9 18h6" />
            <path d="M10 21h4" />
            <path d="M8.5 14.5A6 6 0 1 1 15.5 14c-.9.7-1.5 1.8-1.5 3h-4c0-1-.5-1.9-1.5-2.5Z" />
        </SvgIcon>
    );
}

export function NoteIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M6 3.5h8l4 4V19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z" />
            <path d="M14 3.5V8h4" />
            <path d="M8 12h8" />
            <path d="M8 16h6" />
        </SvgIcon>
    );
}

export function PinIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="m14.5 4.5 5 5-3 3 1 3-2 2-4-4-5.5 5.5" />
            <path d="m9 6 9 9" />
        </SvgIcon>
    );
}

export function PlayIcon(props) {
    return (
        <SvgIcon {...props} fill="currentColor" strokeWidth={0}>
            <path d="M8 5.5v13l10-6.5-10-6.5Z" />
        </SvgIcon>
    );
}

export function SparkleIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="M12 3.5 13.8 9 19 10.8 13.8 12.6 12 18l-1.8-5.4L5 10.8 10.2 9 12 3.5Z" />
            <path d="m18.5 3.5.7 2 .8.8-.8.8-.7 2-.7-2-.8-.8.8-.8.7-2Z" />
        </SvgIcon>
    );
}

export function StarIcon(props) {
    return (
        <SvgIcon {...props} fill="currentColor" strokeWidth={0}>
            <path d="m12 3.8 2.4 5 5.5.8-4 3.9.9 5.5-4.8-2.6L7.2 19l.9-5.5-4-3.9 5.5-.8L12 3.8Z" />
        </SvgIcon>
    );
}

export function TargetIcon(props) {
    return (
        <SvgIcon {...props}>
            <circle cx="12" cy="12" r="8.5" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="1" fill="currentColor" strokeWidth={0} />
        </SvgIcon>
    );
}

export function ChevronRightIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="m9 6 6 6-6 6" />
        </SvgIcon>
    );
}

export function ChevronDownIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="m6 9 6 6 6-6" />
        </SvgIcon>
    );
}

export function ChevronUpIcon(props) {
    return (
        <SvgIcon {...props}>
            <path d="m6 15 6-6 6 6" />
        </SvgIcon>
    );
}
