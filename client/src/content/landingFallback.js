// Used section by section when landing.md omits or garbles one (src/content/landingContent.js).
export const fallbackContent = {
    seo: {
        title: 'Fractal Goals - Break big goals into work you can do today',
        description: 'Turn any ambition into a tree of smaller goals, log the sessions that serve them, and watch the evidence roll up. Try the live demo, no sign-up needed.',
        ogTitle: 'Break big goals into work you can do today',
    },
    header: {
        brand: 'Fractal Goals',
        nav: [
            { label: 'Log in', href: 'https://my.fractalgoals.com' },
        ],
    },
    footer: {
        note: '(c) Fractal Goals. Private beta.',
        links: [
            { label: 'Privacy Policy', href: 'https://my.fractalgoals.com/privacy' },
            { label: 'Terms of Service', href: 'https://my.fractalgoals.com/terms' },
        ],
    },
    hero: {
        kicker: 'Private beta',
        title: 'Achieve Your Most Ambitious Goals',
        body: 'Want to achieve big goals? Start by making them smaller. Fractal Goals breaks any ambition into a tree of smaller goals, then ties every session you log to the goals it serves.',
        // Optional shorter explainer for phones; empty falls back to `body`.
        mobileBody: '',
    },
    demo: {
        label: 'Try the live demo',
        hint: 'Pick an example to explore the real app. No sign-up needed.',
        waitlistLabel: 'or join the waitlist',
    },
    betaForm: {
        emailLabel: 'Email',
        goalLabel: 'What goal are you working towards? (optional)',
        goalPlaceholder: 'e.g. Get strong enough for a one-arm pull-up, learn jazz guitar, run a sub-20 5K...',
        submitLabel: 'Join the waitlist',
        submittingLabel: 'Sending…',
        validationMessage: 'Add a valid email to join the waitlist.',
        successCreatedMessage: "You're on the list. We invite testers in small batches; when it's your turn you'll get an email from fractalgoals.com with a link that sets up your account.",
        successUpdatedMessage: "Thanks - we've updated your request. When a slot opens you'll get an email from fractalgoals.com with a link that sets up your account.",
        errorMessage: 'Could not send the request. Please try again.',
    },
};
