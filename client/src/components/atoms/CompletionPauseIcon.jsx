function CompletionPauseIcon({ size = 18, className = '', ...props }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            focusable="false"
            {...props}
        >
            <rect x="8" y="7" width="2.8" height="10" fill="currentColor" />
            <rect x="13.2" y="7" width="2.8" height="10" fill="currentColor" />
        </svg>
    );
}

export default CompletionPauseIcon;
