function PlusIcon({ size = 16, className = '', strokeWidth = 2.4, ...props }) {
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
            aria-hidden="true"
            focusable="false"
            {...props}
        >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
        </svg>
    );
}

export default PlusIcon;
