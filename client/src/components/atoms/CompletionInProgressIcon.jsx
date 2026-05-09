function CompletionInProgressIcon({ size = 18, className = '', ...props }) {
    return (
        <span
            className={className}
            style={{
                width: size,
                height: size,
            }}
            aria-hidden="true"
            {...props}
        />
    );
}

export default CompletionInProgressIcon;
