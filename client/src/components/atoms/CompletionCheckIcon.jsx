function CompletionCheckIcon({ checked = false, size = 18, className = '', ...props }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="square"
            strokeLinejoin="miter"
            aria-hidden="true"
            focusable="false"
            {...props}
        >
            {checked && <path d="M5.5 12.25 10 16.75 18.75 7.25" />}
        </svg>
    );
}

export default CompletionCheckIcon;
