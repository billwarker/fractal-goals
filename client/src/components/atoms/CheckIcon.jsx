function CheckIcon({ size = 16, className = '', strokeWidth = 2.4, ...props }) {
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
            <path d="M5 12.5 9.5 17 19 7" />
        </svg>
    );
}

export default CheckIcon;
