function CreateNoteIcon({ size = 20, className = '', ...props }) {
    return (
        <svg
            className={className}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="square"
            strokeLinejoin="miter"
            aria-hidden="true"
            focusable="false"
            {...props}
        >
            <path
                d="M6 3h8l5 5v10.5A2.5 2.5 0 0 1 16.5 21h-10A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3Z"
                strokeWidth="1.55"
            />
            <path d="M14 3v5h5" strokeWidth="1.55" />
            <path d="M8 15.5 14.5 9l2 2L10 17.5l-2.5.5.5-2.5Z" strokeWidth="1.9" />
            <path d="M13.5 10 15.5 12" strokeWidth="1.9" />
        </svg>
    );
}

export default CreateNoteIcon;
