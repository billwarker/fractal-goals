function InheritanceArrowIcon({
    direction = 'up',
    size = 14,
    className = '',
    strokeWidth = 2.5,
    ...props
}) {
    const isDown = direction === 'down' || direction === 'parent';

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
            {isDown ? (
                <>
                    <path d="M12 5v14" />
                    <path d="m7 14 5 5 5-5" />
                </>
            ) : (
                <>
                    <path d="M12 19V5" />
                    <path d="m7 10 5-5 5 5" />
                </>
            )}
        </svg>
    );
}

export default InheritanceArrowIcon;
