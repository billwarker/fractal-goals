import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import GoalIcon from '../components/atoms/GoalIcon';
import ThemeToggleButton from '../components/common/ThemeToggleButton';
import LandingExampleIcon from '../components/landing/LandingExampleIcon';
import landingContent from '../content/landingContent';
import DemoSignupModal from '../demo/DemoSignupModal';
import { DEMO_BASE_PATH } from '../demo/demoMode';
import useMediaQuery from '../hooks/useMediaQuery';
import { queryKeys } from '../hooks/queryKeys';
import { globalApi, publicApi } from '../utils/api';
import { fetchLandingExamples, LANDING_EXAMPLES_STALE_TIME } from '../utils/landingPrefetch';
import { demoIconProps, demoRootName, sortDemoExamples } from '../demo/demoExamples';
import { getAppHref } from '../utils/marketingHost';
import styles from './Landing.module.css';

// The tree preview (and React Flow with it) loads only where it is shown: on desktop.
const LandingTreePreview = lazy(() => import('../components/landing/LandingTreePreview'));

const COMPACT_QUERY = '(max-width: 620px)';
const WIDE_QUERY = '(min-width: 1024px)';
// Laptop-height screens: smaller picker icons keep the hero to one screen.
const SHORT_QUERY = '(max-height: 820px)';

export const demoHref = (rootId) => `${DEMO_BASE_PATH}/${encodeURIComponent(rootId)}/goals?tour=1`;
// A goal clicked in the tree preview opens the demo on that goal (hooks/useGoalDeepLink.js).
export const demoGoalHref = (rootId, goalId) => `${DEMO_BASE_PATH}/${encodeURIComponent(rootId)}/goals?goal=${encodeURIComponent(goalId)}`;

// Keeps the crawler-visible meta in index.html in step while the page is open in-app.
function useLandingMeta() {
    useEffect(() => {
        const previousTitle = document.title;
        document.title = landingContent.seo.title;
        const description = document.head.querySelector('meta[name="description"]');
        const previousDescription = description?.getAttribute('content');
        description?.setAttribute('content', landingContent.seo.description);
        return () => {
            document.title = previousTitle;
            if (description && previousDescription != null) description.setAttribute('content', previousDescription);
        };
    }, []);
}

/**
 * The public landing: one hero whose call to action is the live demo. Each published
 * example opens the real app on that fractal (src/demo/), read-only, with a guided tour.
 */
function Landing() {
    useLandingMeta();
    const isCompact = useMediaQuery(COMPACT_QUERY);
    const isWide = useMediaQuery(WIDE_QUERY);
    const isShort = useMediaQuery(SHORT_QUERY);
    const [previewRootId, setPreviewRootId] = useState(null);
    // The tree beside the picker stays on the last example pointed at.
    const [treeRootId, setTreeRootId] = useState(null);
    const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
    const warmedRef = useRef(false);

    // Same key and function as the boot-time prefetch in main.jsx, so it dedupes.
    const examplesQuery = useQuery({
        queryKey: queryKeys.landingExamples(),
        queryFn: fetchLandingExamples,
        staleTime: LANDING_EXAMPLES_STALE_TIME,
    });
    const examples = useMemo(() => sortDemoExamples(examplesQuery.data).map((example) => ({
        id: example.root_id,
        label: example.label,
        root: demoRootName(example),
        icon: demoIconProps(example.icon),
        appearance: example.appearance,
        preview: example.preview,
    })), [examplesQuery.data]);

    // Wake the API while the visitor reads, so the demo opens on a warm server.
    useEffect(() => {
        globalApi.probeHealth().catch(() => {});
    }, []);
    const warmDemo = () => {
        if (warmedRef.current) return;
        warmedRef.current = true;
        publicApi.createDemoSession().catch(() => {});
    };

    const previewed = examples.find((example) => example.id === previewRootId);
    const treeExample = isWide
        ? [examples.find((example) => example.id === treeRootId), examples[0]].find((example) => example?.preview?.tree)
        : null;
    // Held from the first paint (index.html's boot shell draws the same two columns), so the
    // page doesn't open in one column and then split. Only a publish without trees drops it.
    const showsPreviewColumn = isWide && (examplesQuery.isPending || Boolean(treeExample));
    const heroTitle = previewed?.root || landingContent.hero.title;
    const heroBody = (isCompact && landingContent.hero.mobileBody) || landingContent.hero.body;
    const loginLabel = landingContent.header.nav[0]?.label || 'Log in';
    const hasDemo = examples.length > 0 || examplesQuery.isPending;

    return (
        <main className={`${styles.page} ${showsPreviewColumn ? styles.pageWithPreview : ''}`} data-landing-ready-surface>
            <header className={styles.header}>
                <a className={styles.brand} href="/" aria-label={landingContent.header.brand}>
                    <GoalIcon shape="twelvePointStar" color="var(--color-brand-primary)" secondaryColor="var(--color-bg-input)" isSmart size={34} />
                    <span>{landingContent.header.brand}</span>
                </a>
                <div className={styles.headerTools}>
                    <a className={styles.login} href={getAppHref()}>{loginLabel}</a>
                    <ThemeToggleButton />
                </div>
            </header>

            <section className={`${styles.hero} ${showsPreviewColumn ? styles.heroWithPreview : ''}`} aria-labelledby="landing-title">
                <div className={styles.intro}>
                    <p className={styles.kicker}>{landingContent.hero.kicker}</p>
                    <h1 id="landing-title" className={styles.title}>{heroTitle}</h1>
                    <div className={styles.bodyPanel}>
                        <p>{heroBody}</p>
                    </div>

                    <div className={styles.demo}>
                        {hasDemo && <h2 className={styles.demoLabel} id="demo-label">{landingContent.demo.label}</h2>}
                        {examplesQuery.isPending ? (
                            <div className={styles.demoPlaceholder} role="status" aria-label="Loading the demo examples" />
                        ) : examples.length > 0 && (
                            <ul className={styles.examples} aria-labelledby="demo-label">
                                {examples.map((example) => {
                                    const preview = () => {
                                        setPreviewRootId(example.id);
                                        setTreeRootId(example.id);
                                        warmDemo();
                                    };
                                    return (
                                        <li key={example.id}>
                                            <a
                                                className={styles.example}
                                                href={demoHref(example.id)}
                                                aria-label={`${example.label}: ${example.root}. Open the live demo`}
                                                onMouseEnter={preview}
                                                onFocus={preview}
                                                onMouseLeave={() => setPreviewRootId(null)}
                                                onBlur={() => setPreviewRootId(null)}
                                                onTouchStart={warmDemo}
                                            >
                                                <span className={styles.exampleIcon} aria-hidden="true">
                                                    <LandingExampleIcon example={example} size={isCompact || isShort ? 64 : 84} />
                                                </span>
                                                <span className={styles.exampleLabel}>{example.label}</span>
                                            </a>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        {examples.length > 0 && <p className={styles.demoHint}>{landingContent.demo.hint}</p>}
                        <button
                            type="button"
                            className={hasDemo ? styles.waitlistLink : styles.waitlistButton}
                            onClick={() => setIsWaitlistOpen(true)}
                        >
                            {hasDemo ? landingContent.demo.waitlistLabel : landingContent.betaForm.submitLabel}
                        </button>
                    </div>
                </div>
                {showsPreviewColumn && (
                    <div className={styles.preview}>
                        {treeExample && (
                            <Suspense fallback={null}>
                                <LandingTreePreview
                                    example={treeExample}
                                    goalHref={(goalId) => demoGoalHref(treeExample.id, goalId)}
                                    onOpen={warmDemo}
                                />
                            </Suspense>
                        )}
                    </div>
                )}
            </section>

            <footer className={styles.footer}>
                <p>{landingContent.footer.note}</p>
                <nav aria-label="Legal">
                    {landingContent.footer.links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
                </nav>
            </footer>

            {isWaitlistOpen && <DemoSignupModal isOpen onClose={() => setIsWaitlistOpen(false)} />}
        </main>
    );
}

export default Landing;
