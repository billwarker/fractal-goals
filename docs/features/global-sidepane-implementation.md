# Global SidePane Implementation Plan

**Created:** 2026-01-07  
**Status:** Planning  
**Priority:** High  
**Dependencies:** Notes System (see `notes-system-implementation.md`)

---

## Overview

Implement a **Global SidePane** component that exists on every page of the application, providing contextual information, notes, analytics, and quick actions based on the current page and selected item. This replaces the existing `Sidebar.jsx` component with a more powerful, unified system.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              App Header                                  │
├────────────────────────────────────────────┬────────────────────────────┤
│                                            │      Global SidePane       │
│                                            │  ┌──────────────────────┐  │
│                                            │  │    Context Header    │  │
│              Main Content Area             │  ├──────────────────────┤  │
│                                            │  │ [Notes][History][...]│  │  ← Mode Tabs
│         (Page-specific content)            │  ├──────────────────────┤  │
│                                            │  │                      │  │
│                                            │  │   Mode Content       │  │
│                                            │  │                      │  │
│                                            │  │                      │  │
│                                            │  └──────────────────────┘  │
└────────────────────────────────────────────┴────────────────────────────┘
```

---

## Core Requirements

### 1. Global Presence
- SidePane exists on **all pages** of the application
- Replaces existing `Sidebar.jsx` component
- Integrated into the main app layout (not per-page)

### 2. Context Awareness (Hybrid)
- **Default:** Shows page-level context (session info, program overview, etc.)
- **On Selection:** Switches to item-level context (selected activity, goal, etc.)
- **Back Navigation:** User can return to page-level context

### 3. Mode System
The SidePane supports multiple modes, displayed as tabs:

| Mode | Icon | Description | Available On |
|------|------|-------------|--------------|
| **Notes** | 📝 | View/add notes for context + descendants | All pages |
| **Details** | 📋 | Properties and metadata | All pages |
| **History** | 📜 | Changelog, activity log | All pages |
| **Related** | 🔗 | Linked entities (goals, sessions) | All pages |
| **Analytics** | 📊 | Stats, charts, previous instances | Sessions, Programs |
| **Actions** | ⚡ | Quick actions for context | All pages |

### 4. Persistence
- **Open/Closed State:** Remembered across page navigation (localStorage)
- **Active Mode:** Remembered across navigation
- **Position Preference:** User can choose left/right (defaults to right)
- **Width:** Fixed (e.g., 380px), collapsible

### 5. Mobile Behavior
- Renders as a **bottom sheet** that slides up
- Can be dismissed by sliding down or tapping backdrop
- Swipe gesture support

---

## Component Architecture

### Directory Structure

```
/client/src/components/sidepane/
├── GlobalSidePane.jsx          # Main container component
├── GlobalSidePane.css          # Styles
├── SidePaneContext.jsx         # React context for state management
├── SidePaneHeader.jsx          # Context header with title/back button
├── SidePaneModeTabs.jsx        # Tab navigation for modes
├── SidePaneTrigger.jsx         # Toggle button (for collapsed state)
│
├── modes/                      # Mode-specific content components
│   ├── NotesMode.jsx           # Notes mode content
│   ├── DetailsMode.jsx         # Details/properties mode
│   ├── HistoryMode.jsx         # Changelog/activity log
│   ├── RelatedMode.jsx         # Related entities
│   ├── AnalyticsMode.jsx       # Stats and previous instances
│   └── ActionsMode.jsx         # Quick actions
│
├── contexts/                   # Page-specific context providers
│   ├── SessionContext.jsx      # Context for SessionDetail page
│   ├── FractalContext.jsx      # Context for FractalGoals page
│   ├── ProgramContext.jsx      # Context for ProgramDetail page
│   └── DefaultContext.jsx      # Fallback for other pages
│
└── index.js                    # Barrel export
```

### State Management

```jsx
// SidePaneContext.jsx
const SidePaneContext = createContext();

const SidePaneProvider = ({ children }) => {
  // Persisted state
  const [isOpen, setIsOpen] = useLocalStorage('sidepane-open', true);
  const [activeMode, setActiveMode] = useLocalStorage('sidepane-mode', 'notes');
  const [position, setPosition] = useLocalStorage('sidepane-position', 'right');
  
  // Context state (changes with page/selection)
  const [pageContext, setPageContext] = useState(null);      // Page-level context
  const [itemContext, setItemContext] = useState(null);      // Selected item context
  const [contextStack, setContextStack] = useState([]);      // For back navigation
  
  // Derived state
  const activeContext = itemContext || pageContext;
  const hasItemContext = itemContext !== null;
  
  // Actions
  const selectItem = (item) => {
    if (itemContext) {
      setContextStack([...contextStack, itemContext]);
    }
    setItemContext(item);
  };
  
  const goBack = () => {
    if (contextStack.length > 0) {
      const prev = contextStack[contextStack.length - 1];
      setContextStack(contextStack.slice(0, -1));
      setItemContext(prev);
    } else {
      setItemContext(null);
    }
  };
  
  const clearItemContext = () => {
    setItemContext(null);
    setContextStack([]);
  };
  
  return (
    <SidePaneContext.Provider value={{
      isOpen, setIsOpen,
      activeMode, setActiveMode,
      position, setPosition,
      pageContext, setPageContext,
      itemContext, selectItem,
      activeContext,
      hasItemContext,
      goBack, clearItemContext
    }}>
      {children}
    </SidePaneContext.Provider>
  );
};
```

---

## Context Object Shape

Each page sets a `pageContext` object that describes the current view:

```typescript
interface SidePaneContextObject {
  // Identity
  type: 'session' | 'goal' | 'activity_instance' | 'program' | 'program_day' | 'activity_definition' | 'page';
  id: string;
  name: string;
  
  // Routing
  rootId: string;
  
  // For Notes aggregation
  entityType: string;
  entityId: string;
  includeChildNotes: boolean;
  
  // Available modes for this context
  availableModes: ('notes' | 'details' | 'history' | 'related' | 'analytics' | 'actions')[];
  
  // Mode-specific data
  details?: Record<string, any>;      // For Details mode
  relatedEntities?: RelatedEntity[];  // For Related mode
  analyticsConfig?: AnalyticsConfig;  // For Analytics mode
  actions?: QuickAction[];            // For Actions mode
  
  // Page-specific extensions
  meta?: Record<string, any>;
}
```

---

## Page-Specific Contexts

### SessionDetail Page

```jsx
// In SessionDetail.jsx
const { setPageContext, selectItem } = useSidePane();

useEffect(() => {
  setPageContext({
    type: 'session',
    id: session.id,
    name: session.name,
    rootId: rootId,
    entityType: 'session',
    entityId: session.id,
    includeChildNotes: true,
    availableModes: ['notes', 'details', 'analytics', 'related', 'actions'],
    details: {
      startTime: session.session_start,
      endTime: session.session_end,
      duration: session.total_duration_seconds,
      template: session.template_name,
      activitiesCount: activities.length,
    },
    actions: [
      { id: 'complete', label: 'Complete Session', icon: '✓' },
      { id: 'add-activity', label: 'Add Activity', icon: '+' },
    ],
    meta: {
      lastSession: previousSessionData,  // For "Last Session" info
    }
  });
}, [session]);

// When user clicks an activity
const handleActivitySelect = (activityInstance) => {
  selectItem({
    type: 'activity_instance',
    id: activityInstance.id,
    name: activityInstance.activity_definition.name,
    rootId: rootId,
    entityType: 'activity_instance',
    entityId: activityInstance.id,
    includeChildNotes: false,
    availableModes: ['notes', 'details', 'analytics', 'history'],
    details: {
      sets: activityInstance.data?.sets,
      duration: activityInstance.duration_seconds,
      metrics: activityInstance.metrics,
    },
    analyticsConfig: {
      type: 'previous_instances',
      activityDefinitionId: activityInstance.activity_definition_id,
      limit: 10,
    }
  });
};
```

### FractalGoals Page

```jsx
// In FractalGoals.jsx
useEffect(() => {
  setPageContext({
    type: 'page',
    id: 'fractal-view',
    name: fractalName,
    rootId: rootId,
    entityType: 'goal',
    entityId: rootId,
    includeChildNotes: true,
    availableModes: ['notes', 'details', 'related', 'actions'],
    actions: [
      { id: 'add-goal', label: 'Add Goal', icon: '+' },
      { id: 'expand-all', label: 'Expand All', icon: '⊕' },
    ]
  });
}, [fractalName, rootId]);

// When user selects a goal node
const handleNodeSelect = (goal) => {
  selectItem({
    type: 'goal',
    id: goal.id,
    name: goal.name,
    rootId: rootId,
    entityType: 'goal',
    entityId: goal.id,
    includeChildNotes: false,
    availableModes: ['notes', 'details', 'related', 'history', 'actions'],
    details: {
      type: goal.type,
      description: goal.description,
      deadline: goal.deadline,
      completed: goal.completed,
      completedAt: goal.completed_at,
      targets: goal.targets,
      childCount: goal.children?.length || 0,
    },
    relatedEntities: [
      { type: 'sessions', label: 'Sessions', ids: goal.sessionIds },
      { type: 'programs', label: 'Programs', ids: goal.programIds },
    ],
    actions: [
      { id: 'complete', label: 'Mark Complete', icon: '✓' },
      { id: 'add-child', label: 'Add Child Goal', icon: '+' },
      { id: 'add-session', label: 'Start Session', icon: '▶' },
    ]
  });
};
```

### ProgramDetail Page

```jsx
// In ProgramDetail.jsx
useEffect(() => {
  setPageContext({
    type: 'program',
    id: program.id,
    name: program.name,
    rootId: rootId,
    entityType: 'program',
    entityId: program.id,
    includeChildNotes: true,
    availableModes: ['notes', 'details', 'analytics', 'related', 'actions'],
    details: {
      startDate: program.start_date,
      endDate: program.end_date,
      isActive: program.is_active,
      blocksCount: program.blocks?.length,
    },
    analyticsConfig: {
      type: 'weekly_progress',
      programId: program.id,
    },
    actions: [
      { id: 'add-block', label: 'Add Block', icon: '+' },
      { id: 'edit', label: 'Edit Program', icon: '✏️' },
    ]
  });
}, [program]);
```

---

## Mode Components

### NotesMode.jsx

```jsx
const NotesMode = () => {
  const { activeContext, rootId } = useSidePane();
  const [notes, setNotes] = useState([]);
  const [viewMode, setViewMode] = useState('context'); // 'context' | 'feed'
  const [feedFilters, setFeedFilters] = useState({});
  
  // Fetch notes based on context or feed mode
  useEffect(() => {
    if (viewMode === 'context' && activeContext) {
      fetchContextNotes();
    } else if (viewMode === 'feed') {
      fetchFeedNotes();
    }
  }, [activeContext, viewMode, feedFilters]);

  return (
    <div className="sidepane-mode notes-mode">
      {/* View Toggle */}
      <div className="notes-view-toggle">
        <button 
          className={viewMode === 'context' ? 'active' : ''}
          onClick={() => setViewMode('context')}
        >
          Context
        </button>
        <button
          className={viewMode === 'feed' ? 'active' : ''}
          onClick={() => setViewMode('feed')}
        >
          Feed
        </button>
      </div>
      
      {/* Add Note */}
      <NoteEditor 
        onSubmit={handleAddNote}
        placeholder={`Add note to ${activeContext?.name}...`}
      />
      
      {/* Notes List */}
      {viewMode === 'context' ? (
        <NotesList 
          notes={notes}
          groupByEntity={activeContext?.includeChildNotes}
          onNoteClick={handleNoteClick}
          onDelete={handleDelete}
        />
      ) : (
        <>
          <FeedFilters 
            filters={feedFilters}
            onChange={setFeedFilters}
          />
          <NotesFeed 
            notes={notes}
            onNoteClick={handleNoteClick}
          />
        </>
      )}
    </div>
  );
};
```

### AnalyticsMode.jsx

```jsx
const AnalyticsMode = () => {
  const { activeContext } = useSidePane();
  const config = activeContext?.analyticsConfig;
  
  if (!config) {
    return <div className="mode-empty">No analytics available</div>;
  }
  
  switch (config.type) {
    case 'previous_instances':
      return (
        <PreviousInstancesView 
          activityDefinitionId={config.activityDefinitionId}
          limit={config.limit}
        />
      );
    
    case 'weekly_progress':
      return (
        <WeeklyProgressView 
          programId={config.programId}
        />
      );
    
    case 'session_stats':
      return (
        <SessionStatsView 
          sessionId={config.sessionId}
        />
      );
    
    default:
      return <div className="mode-empty">Unknown analytics type</div>;
  }
};

// Sub-component for activity instance analytics
const PreviousInstancesView = ({ activityDefinitionId, limit }) => {
  const [instances, setInstances] = useState([]);
  
  useEffect(() => {
    // Fetch previous instances of this activity
    fetchPreviousInstances(activityDefinitionId, limit);
  }, [activityDefinitionId]);
  
  return (
    <div className="previous-instances">
      <h4>Previous Sessions</h4>
      {instances.map(instance => (
        <PreviousInstanceCard 
          key={instance.id}
          instance={instance}
        />
      ))}
    </div>
  );
};
```

### DetailsMode.jsx

```jsx
const DetailsMode = () => {
  const { activeContext } = useSidePane();
  const details = activeContext?.details;
  
  if (!details) {
    return <div className="mode-empty">No details available</div>;
  }
  
  // Render based on context type
  switch (activeContext.type) {
    case 'session':
      return <SessionDetails details={details} />;
    case 'goal':
      return <GoalDetails details={details} />;
    case 'activity_instance':
      return <ActivityInstanceDetails details={details} />;
    case 'program':
      return <ProgramDetails details={details} />;
    default:
      return <GenericDetails details={details} />;
  }
};
```

---

## Main Component: GlobalSidePane.jsx

```jsx
import { useSidePane } from './SidePaneContext';
import SidePaneHeader from './SidePaneHeader';
import SidePaneModeTabs from './SidePaneModeTabs';
import NotesMode from './modes/NotesMode';
import DetailsMode from './modes/DetailsMode';
import HistoryMode from './modes/HistoryMode';
import RelatedMode from './modes/RelatedMode';
import AnalyticsMode from './modes/AnalyticsMode';
import ActionsMode from './modes/ActionsMode';
import './GlobalSidePane.css';

const MODE_COMPONENTS = {
  notes: NotesMode,
  details: DetailsMode,
  history: HistoryMode,
  related: RelatedMode,
  analytics: AnalyticsMode,
  actions: ActionsMode,
};

const GlobalSidePane = () => {
  const { 
    isOpen, 
    position, 
    activeMode, 
    activeContext,
    hasItemContext,
    goBack 
  } = useSidePane();
  
  const availableModes = activeContext?.availableModes || ['notes'];
  const ActiveModeComponent = MODE_COMPONENTS[activeMode] || NotesMode;
  
  // Handle mobile detection
  const isMobile = useMediaQuery('(max-width: 768px)');
  
  if (isMobile) {
    return (
      <MobileSidePane 
        isOpen={isOpen}
        activeContext={activeContext}
        availableModes={availableModes}
        activeMode={activeMode}
        ActiveModeComponent={ActiveModeComponent}
      />
    );
  }
  
  return (
    <aside className={`global-sidepane ${position} ${isOpen ? 'open' : 'collapsed'}`}>
      {isOpen ? (
        <>
          {/* Header */}
          <SidePaneHeader 
            title={activeContext?.name || 'Context'}
            showBack={hasItemContext}
            onBack={goBack}
          />
          
          {/* Mode Tabs */}
          <SidePaneModeTabs 
            modes={availableModes}
            activeMode={activeMode}
          />
          
          {/* Mode Content */}
          <div className="sidepane-content">
            <ActiveModeComponent />
          </div>
        </>
      ) : (
        <SidePaneTrigger />
      )}
    </aside>
  );
};

// Mobile Bottom Sheet variant
const MobileSidePane = ({ isOpen, ...props }) => {
  const { setIsOpen } = useSidePane();
  
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="sidepane-backdrop"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      {/* Bottom Sheet */}
      <div className={`mobile-sidepane ${isOpen ? 'open' : ''}`}>
        <div className="mobile-sidepane-handle" />
        <SidePaneHeader {...props} />
        <SidePaneModeTabs {...props} />
        <div className="sidepane-content">
          <props.ActiveModeComponent />
        </div>
      </div>
    </>
  );
};

export default GlobalSidePane;
```

---

## App Layout Integration

```jsx
// AppRouter.jsx or App.jsx
import { SidePaneProvider } from './components/sidepane/SidePaneContext';
import GlobalSidePane from './components/sidepane/GlobalSidePane';

const App = () => {
  return (
    <SidePaneProvider>
      <div className="app-layout">
        <AppHeader />
        
        <div className="app-body">
          <main className="app-main">
            <Routes>
              {/* All routes */}
            </Routes>
          </main>
          
          <GlobalSidePane />
        </div>
      </div>
    </SidePaneProvider>
  );
};
```

```css
/* App layout CSS */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.app-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.app-main {
  flex: 1;
  overflow-y: auto;
}

.global-sidepane {
  width: 380px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease;
}

.global-sidepane.collapsed {
  width: 48px;
}

.global-sidepane.left {
  order: -1;
  border-left: none;
  border-right: 1px solid var(--border-color);
}
```

---

## Implementation Phases

### Phase 1: Foundation (Est. 4-5 hours)
- [ ] Create `/components/sidepane/` directory structure
- [ ] Implement `SidePaneContext.jsx` with state management
- [ ] Implement `GlobalSidePane.jsx` shell
- [ ] Implement `SidePaneHeader.jsx`
- [ ] Implement `SidePaneModeTabs.jsx`
- [ ] Implement `SidePaneTrigger.jsx`
- [ ] Add localStorage persistence hooks
- [ ] Integrate into app layout

### Phase 2: Notes Mode (Est. 3-4 hours)
- [ ] Complete Notes backend (from notes-system-implementation.md)
- [ ] Implement `NotesMode.jsx` with context/feed toggle
- [ ] Add note creation, editing, deletion
- [ ] Add entity navigation from notes
- [ ] Add feed filters

### Phase 3: Details Mode (Est. 3 hours)
- [ ] Implement `DetailsMode.jsx`
- [ ] Create sub-components for each entity type:
  - [ ] `SessionDetails.jsx`
  - [ ] `GoalDetails.jsx`
  - [ ] `ActivityInstanceDetails.jsx`
  - [ ] `ProgramDetails.jsx`

### Phase 4: Analytics Mode (Est. 4-5 hours)
- [ ] Implement `AnalyticsMode.jsx`
- [ ] Create `PreviousInstancesView.jsx` for activity history
- [ ] Create `WeeklyProgressView.jsx` for programs
- [ ] Create API endpoints for analytics data
- [ ] Add mini charts/visualizations

### Phase 5: Session Page Integration (Est. 3-4 hours)
- [ ] Update `SessionDetail.jsx` to use SidePane
- [ ] Add activity selection → SidePane context
- [ ] Remove old sidebar code
- [ ] Test activity analytics flow
- [ ] Ensure notes work for session + activities

### Phase 6: Fractal Page Integration (Est. 3 hours)
- [ ] Update `FractalGoals.jsx` to use SidePane
- [ ] Replace existing `Sidebar.jsx` usage
- [ ] Add goal selection → SidePane context
- [ ] Migrate goal detail views to SidePane

### Phase 7: Program Page Integration (Est. 3 hours)
- [ ] Update `ProgramDetail.jsx` to use SidePane
- [ ] Add block/day selection → SidePane context
- [ ] Implement weekly progress analytics
- [ ] Add program-level notes

### Phase 8: Remaining Modes (Est. 4 hours)
- [ ] Implement `HistoryMode.jsx` (changelog)
- [ ] Implement `RelatedMode.jsx` (linked entities)
- [ ] Implement `ActionsMode.jsx` (quick actions)

### Phase 9: Mobile & Polish (Est. 4 hours)
- [ ] Implement mobile bottom sheet
- [ ] Add swipe gestures
- [ ] Responsive testing
- [ ] Animation polish
- [ ] Keyboard shortcuts

### Phase 10: Cleanup & Documentation (Est. 2 hours)
- [ ] Remove old `Sidebar.jsx` and related code
- [ ] Update `index.md` documentation
- [ ] Performance optimization

---

## Total Estimated Time

| Phase | Hours |
|-------|-------|
| Foundation | 4-5 |
| Notes Mode | 3-4 |
| Details Mode | 3 |
| Analytics Mode | 4-5 |
| Session Integration | 3-4 |
| Fractal Integration | 3 |
| Program Integration | 3 |
| Remaining Modes | 4 |
| Mobile & Polish | 4 |
| Cleanup | 2 |
| **Total** | **33-37 hours** |

---

## Migration Strategy

### Deprecation of Existing Sidebar

1. **Phase 1:** Build new SidePane alongside old Sidebar
2. **Phase 2:** Migrate FractalGoals page to new SidePane
3. **Phase 3:** Verify all goal detail functionality works
4. **Phase 4:** Remove old `Sidebar.jsx`, `GoalDetailModal.jsx` panel mode
5. **Phase 5:** Update imports across codebase

### Data Migration

No database changes needed beyond the Notes table. The SidePane uses existing API endpoints for:
- Sessions (`/api/<root_id>/sessions`)
- Goals (`/api/<root_id>/goals`)
- Activities (`/api/<root_id>/activities`)
- Programs (`/api/<root_id>/programs`)

---

## Design Tokens

```css
:root {
  /* SidePane specific */
  --sidepane-width: 380px;
  --sidepane-collapsed-width: 48px;
  --sidepane-bg: var(--bg-secondary);
  --sidepane-border: var(--border-color);
  --sidepane-header-height: 56px;
  --sidepane-tabs-height: 44px;
  
  /* Mode tabs */
  --tab-active-bg: var(--accent-color);
  --tab-active-text: white;
  --tab-inactive-text: var(--text-secondary);
  
  /* Mobile */
  --mobile-sheet-max-height: 85vh;
  --mobile-sheet-handle-height: 24px;
}
```

---

## Open Questions

1. **Header Integration:** Should the app header be part of the SidePane, or remain separate? (You mentioned nav bar at top of component)

2. **Notes Feed Scope:** Should the feed view show notes from:
   - Current fractal only?
   - All fractals?
   - User-selectable scope?

3. **History Mode Data:** What events should appear in the changelog?
   - Entity created/updated/deleted?
   - Completion events?
   - Custom log entries?

4. **Quick Actions:** Should actions trigger modals, or execute directly?

5. **Keyboard Shortcuts:** 
   - `Cmd+\` to toggle SidePane?
   - Number keys to switch modes (1=Notes, 2=Details, etc.)?

---

## Success Metrics

- [ ] All existing Sidebar functionality preserved
- [ ] Notes accessible on every page
- [ ] Activity history visible when selecting activity in session
- [ ] Program weekly stats visible
- [ ] Mobile bottom sheet works smoothly
- [ ] State persists across navigation
- [ ] Performance: <100ms to switch contexts
