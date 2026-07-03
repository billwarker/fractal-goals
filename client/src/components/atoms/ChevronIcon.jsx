import styles from './ChevronIcon.module.css';

function ChevronIcon({
    size = 16,
    direction = 'down',
    className = '',
    strokeWidth = 2.2,
    ...props
}) {
    const directionClass = styles[direction] || styles.down;

    return (
        <svg
            className={[styles.chevron, directionClass, className].filter(Boolean).join(' ')}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
            {...props}
        >
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}

export default ChevronIcon;
