import React, { useMemo, useState } from 'react';
import { GoalLevelsProvider } from '../../contexts/GoalLevelsContext';
import landingContent from '../../content/landingContent';
import LandingSkeleton from './LandingSkeleton';
import LandingFeatureSession from './LandingFeatureSession';
import LandingFeatureActivity from './LandingFeatureActivity';
import LandingFeaturePrograms from './LandingFeaturePrograms';
import LandingFeatureAnalytics from './LandingFeatureAnalytics';
import LandingFeatureMore from './LandingFeatureMore';
import {
    resolveFeaturedActivities,
    resolveFeaturedAnalyticsViews,
    resolveFeaturedProgram,
    resolveFeaturedSession,
} from './landingFeatureModel';
import styles from './LandingFeaturesSection.module.css';

const FEATURE_ORDER = ['session', 'activity', 'programs', 'analytics', 'more'];

// The landing Features section mirrors the goals-view section: message and
// feature selectors on the left, live viewport on the right.
export default function LandingFeaturesSection({
    example,
    seedLevels = [],
    isMobile = false,
    isLoading = false,
    onGoalSelect,
    className = '',
}) {
    const [activeFeature, setActiveFeature] = useState(FEATURE_ORDER[0]);
    const content = landingContent.features;
    const activeItem = content.items[activeFeature];

    const featuredSession = useMemo(() => resolveFeaturedSession(example), [example]);
    const featuredActivities = useMemo(() => resolveFeaturedActivities(example), [example]);
    const featuredProgram = useMemo(() => resolveFeaturedProgram(example), [example]);
    const featuredAnalyticsViews = useMemo(() => resolveFeaturedAnalyticsViews(example), [example]);

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
                        activities={featuredActivities}
                        onGoalSelect={onGoalSelect}
                    />
                );
            case 'programs':
                return (
                    <LandingFeaturePrograms
                        example={example}
                        program={featuredProgram.program}
                        windowStart={featuredProgram.windowStart}
                        windowEnd={featuredProgram.windowEnd}
                        isMobile={isMobile}
                    />
                );
            case 'analytics':
                return <LandingFeatureAnalytics example={example} views={featuredAnalyticsViews} />;
            case 'more':
            default:
                return <LandingFeatureMore extras={content.extras} />;
        }
    };

    return (
        <section
            className={`${styles.featuresSection}${className ? ` ${className}` : ''}`}
            id="features"
            aria-labelledby="features-title"
        >
            <div className={styles.featureViewLayout}>
                <aside className={styles.featureSidebar}>
                    <div className={styles.sectionHeader}>
                        <p className={styles.eyebrow}>{content.eyebrow}</p>
                        <h2 id="features-title">{content.title}</h2>
                        <p>{content.body}</p>
                    </div>

                    <div className={styles.featureToggle} role="tablist" aria-label="Product features">
                        {isLoading && !example
                            ? FEATURE_ORDER.map((key) => (
                                <LandingSkeleton key={key} height="118px" width="100%" radius="6px" />
                            ))
                            : FEATURE_ORDER.map((key) => (
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={activeFeature === key}
                                    aria-label={content.items[key].label}
                                    className={activeFeature === key ? styles.featureToggleActive : ''}
                                    onClick={() => setActiveFeature(key)}
                                    key={key}
                                >
                                    <span className={styles.featureCardLabel}>{content.items[key].label}</span>
                                    <span className={styles.featureCardHeading}>{content.items[key].heading}</span>
                                    <span className={styles.featureCardBody}>{content.items[key].body}</span>
                                </button>
                            ))}
                    </div>
                </aside>

                <div className={styles.featureMain}>
                    <div className={styles.featureStage}>
                        <div className={styles.stageBody}>
                            <GoalLevelsProvider seedLevels={seedLevels}>
                                {renderStage()}
                            </GoalLevelsProvider>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
