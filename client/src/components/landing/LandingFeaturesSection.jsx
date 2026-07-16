import React, { Suspense, lazy, useMemo, useState } from 'react';
import { GoalLevelsProvider } from '../../contexts/GoalLevelsContext';
import landingContent from '../../content/landingContent';
import useMediaQuery from '../../hooks/useMediaQuery';
import LandingAppFrame from './LandingAppFrame';
import LandingSkeleton from './LandingSkeleton';
import LandingTakeoverShell from './LandingTakeoverShell';
import {
    resolveFeaturedActivity,
    resolveFeaturedAnalyticsViews,
    resolveFeaturedProgram,
    resolveFeaturedSession,
} from './landingFeatureModel';
import styles from './LandingFeaturesSection.module.css';

const PRIMARY_FEATURE_ORDER = ['session', 'activity', 'programs', 'analytics'];
const ACTIVITY_VIEW_ORDER = ['catalogue', 'builder', 'metrics', 'timeline'];
// Natural width each feature surface is designed for. Compact viewports render
// the surface at this width inside a scaled app frame instead of reflowing
// (and breaking) the desktop-dense layouts at phone width.
const FEATURE_DESIGN_WIDTHS = {
    session: 900,
    activity: 1040,
    programs: 1120,
    analytics: 1120,
};
const featureLoaders = {
    session: () => import('./LandingFeatureSession'),
    activity: () => import('./LandingFeatureActivity'),
    programs: () => import('./LandingFeaturePrograms'),
    analytics: () => import('./LandingFeatureAnalytics'),
};
const LandingFeatureSession = lazy(featureLoaders.session);
const LandingFeatureActivity = lazy(featureLoaders.activity);
const LandingFeaturePrograms = lazy(featureLoaders.programs);
const LandingFeatureAnalytics = lazy(featureLoaders.analytics);

const warmFeature = (key) => {
    featureLoaders[key]?.().catch(() => {});
};

const COMPACT_LANDING_MEDIA_QUERY = '(max-width: 980px)';

// The landing Features section mirrors the goals-view section: message and
// feature selectors on the left, live viewport on the right. On compact
// widths it becomes a single column: pill tabs, heading, a scaled app-frame
// preview with a full-screen takeover, and a detail-card carousel.
export default function LandingFeaturesSection({
    example,
    seedLevels = [],
    isMobile = false,
    isLoading = false,
    className = '',
    embedded = false,
}) {
    const isCompact = useMediaQuery(COMPACT_LANDING_MEDIA_QUERY);
    const [activeFeature, setActiveFeature] = useState(PRIMARY_FEATURE_ORDER[0]);
    const [activeActivityView, setActiveActivityView] = useState(ACTIVITY_VIEW_ORDER[0]);
    const [isStageExpanded, setIsStageExpanded] = useState(false);
    const [expandedZoom, setExpandedZoom] = useState('fit');
    const content = landingContent.features;
    const activeItem = content.items[activeFeature];
    const designWidth = FEATURE_DESIGN_WIDTHS[activeFeature] || 1024;

    const featuredSession = useMemo(() => resolveFeaturedSession(example), [example]);
    const featuredActivity = useMemo(() => resolveFeaturedActivity(example), [example]);
    const featuredProgram = useMemo(() => resolveFeaturedProgram(example), [example]);
    const featuredAnalyticsViews = useMemo(() => resolveFeaturedAnalyticsViews(example), [example]);

    // Inside the app frame / takeover the surfaces keep their desktop shape.
    const stageIsMobile = isCompact ? false : isMobile;

    const stageSkeleton = (
        <div className={styles.stageSkeleton} aria-label="Loading feature preview">
            <LandingSkeleton height="38px" width="60%" />
            <LandingSkeleton height="220px" />
            <LandingSkeleton height="120px" />
        </div>
    );

    const renderStage = () => {
        if (isLoading || !example) {
            return (
                <div className={styles.stageSkeleton} data-testid="features-stage-skeleton">
                    <LandingSkeleton height="38px" width="60%" />
                    <LandingSkeleton height="220px" />
                    <LandingSkeleton height="120px" />
                </div>
            );
        }
        switch (activeFeature) {
            case 'session':
                return <LandingFeatureSession example={example} session={featuredSession} />;
            case 'activity':
                return (
                    <LandingFeatureActivity
                        example={example}
                        activity={featuredActivity}
                        activeView={activeActivityView}
                        onViewChange={setActiveActivityView}
                    />
                );
            case 'programs':
                return (
                    <LandingFeaturePrograms
                        example={example}
                        program={featuredProgram.program}
                        windowStart={featuredProgram.windowStart}
                        windowEnd={featuredProgram.windowEnd}
                        isMobile={stageIsMobile}
                    />
                );
            case 'analytics':
                return <LandingFeatureAnalytics example={example} views={featuredAnalyticsViews} />;
            default:
                return <LandingFeatureSession example={example} session={featuredSession} />;
        }
    };

    const renderProvidedStage = () => (
        <GoalLevelsProvider seedLevels={seedLevels}>
            <Suspense fallback={stageSkeleton}>
                {renderStage()}
            </Suspense>
        </GoalLevelsProvider>
    );

    const activeDetailCards = activeItem.cards?.length ? activeItem.cards : content.extras;
    const getActivityViewForCard = (index) => ACTIVITY_VIEW_ORDER[index] || ACTIVITY_VIEW_ORDER[0];

    const renderFeatureToggle = () => (
        <div className={styles.featureToggle} role="tablist" aria-label="Product features">
            {isLoading && !example
                ? PRIMARY_FEATURE_ORDER.map((key) => (
                    <LandingSkeleton key={key} height={isCompact ? '44px' : '88px'} width="100%" radius="6px" />
                ))
                : PRIMARY_FEATURE_ORDER.map((key) => (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeFeature === key}
                        aria-label={content.items[key].label}
                        className={activeFeature === key ? styles.featureToggleActive : ''}
                        onClick={() => setActiveFeature(key)}
                        onMouseEnter={() => warmFeature(key)}
                        onPointerDown={() => warmFeature(key)}
                        onFocus={() => warmFeature(key)}
                        key={key}
                    >
                        <span className={styles.featureCardLabel}>{content.items[key].label}</span>
                    </button>
                ))}
        </div>
    );

    const renderDetailCards = () => (
        <div className={styles.featureDetailGrid}>
            {activeDetailCards.map((card, index) => {
                const activityView = getActivityViewForCard(index);
                const isActivityCard = activeFeature === 'activity' && index < ACTIVITY_VIEW_ORDER.length;
                const isActiveActivityCard = isActivityCard && activeActivityView === activityView;
                if (isActivityCard) {
                    return (
                        <button
                            type="button"
                            className={`${styles.featureDetailCard} ${styles.featureDetailButton} ${isActiveActivityCard ? styles.featureDetailCardActive : ''}`}
                            aria-pressed={isActiveActivityCard}
                            onClick={() => setActiveActivityView(activityView)}
                            key={`${activeFeature}-${card.title}`}
                        >
                            <h3>{card.title}</h3>
                            <p>{card.body}</p>
                        </button>
                    );
                }
                return (
                    <article className={styles.featureDetailCard} key={`${activeFeature}-${card.title}`}>
                        <h3>{card.title}</h3>
                        <p>{card.body}</p>
                    </article>
                );
            })}
        </div>
    );

    const RootElement = embedded ? 'div' : 'section';

    return (
        <RootElement
            className={`${styles.featuresSection}${embedded ? ` ${styles.embeddedFeaturesSection}` : ''}${className ? ` ${className}` : ''}`}
            id={embedded ? undefined : 'features'}
            aria-labelledby="features-title"
        >
            {isCompact ? (
                <div className={styles.compactLayout}>
                    <div className={styles.sectionHeader}>
                        <p className={styles.eyebrow}>{content.eyebrow}</p>
                        <h2 id="features-title">{content.title}</h2>
                        <p>{content.body}</p>
                    </div>
                    {renderFeatureToggle()}
                    <div className={styles.featureDetailsLead} aria-live="polite">
                        <span>{activeItem.heading}</span>
                        <p>{activeItem.body}</p>
                    </div>
                    <LandingAppFrame
                        designWidth={designWidth}
                        onExpand={() => {
                            setExpandedZoom('fit');
                            setIsStageExpanded(true);
                        }}
                    >
                        {renderProvidedStage()}
                    </LandingAppFrame>
                    {renderDetailCards()}
                    {isStageExpanded && (
                        <LandingTakeoverShell
                            title={`${activeItem.label} — ${example?.root || 'preview'}`}
                            ariaLabel={`${activeItem.label} full-screen preview`}
                            onClose={() => setIsStageExpanded(false)}
                            headerExtras={(
                                <div className={styles.expandedZoomRow} role="group" aria-label="Preview zoom">
                                    <button
                                        type="button"
                                        className={`${styles.expandedZoomButton} ${expandedZoom === 'fit' ? styles.expandedZoomButtonActive : ''}`}
                                        aria-pressed={expandedZoom === 'fit'}
                                        onClick={() => setExpandedZoom('fit')}
                                    >
                                        Fit
                                    </button>
                                    <button
                                        type="button"
                                        className={`${styles.expandedZoomButton} ${expandedZoom === 'full' ? styles.expandedZoomButtonActive : ''}`}
                                        aria-pressed={expandedZoom === 'full'}
                                        onClick={() => setExpandedZoom('full')}
                                    >
                                        100%
                                    </button>
                                </div>
                            )}
                        >
                            {expandedZoom === 'full' ? (
                                <div className={styles.expandedScroller}>
                                    <div className={styles.expandedContent} style={{ width: designWidth, minWidth: designWidth }}>
                                        {renderProvidedStage()}
                                    </div>
                                </div>
                            ) : (
                                <div className={styles.expandedFitWrap}>
                                    <LandingAppFrame chromeless designWidth={designWidth}>
                                        {renderProvidedStage()}
                                    </LandingAppFrame>
                                </div>
                            )}
                        </LandingTakeoverShell>
                    )}
                </div>
            ) : (
                <div className={styles.featureViewLayout}>
                    <aside className={styles.featureSidebar}>
                        <div className={styles.sectionHeader}>
                            <p className={styles.eyebrow}>{content.eyebrow}</p>
                            <h2 id="features-title">{content.title}</h2>
                            <p>{content.body}</p>
                        </div>

                        <div className={styles.featureSidebarBody}>
                            {renderFeatureToggle()}

                            <div className={styles.featureDetails} aria-live="polite">
                                <div className={styles.featureDetailsLead}>
                                    <span>{activeItem.heading}</span>
                                    <p>{activeItem.body}</p>
                                </div>
                                {renderDetailCards()}
                            </div>
                        </div>
                    </aside>

                    <div className={styles.featureMain}>
                        <div className={styles.featureStage}>
                            <div className={styles.stageBody}>
                                {renderProvidedStage()}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </RootElement>
    );
}
