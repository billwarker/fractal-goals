# Fractal Goals - Refactoring Recommendations

**Date:** 2025-12-28  
**Status:** Pending Implementation

This document outlines the top design issues and areas for improvement identified in the Fractal Goals codebase. These recommendations are prioritized by impact and effort required.

---

## 🔴 Critical Issues

### 1. App.jsx is a Monolithic Monster (1,406 lines)

**Problem:**  
`client/src/App.jsx` contains too many responsibilities in a single file:
- All fractal visualization logic
- Goal management (CRUD operations)
- Practice session management
- Modal management (create, edit, delete, practice session)
- Sidebar logic (goal details, session details)
- Custom node rendering for the tree
- Connection line calculations for multi-parent sessions
- State management for 20+ pieces of state

**Impact:**
- Extremely difficult to maintain and debug
- Hard to test individual features in isolation
- High cognitive load for developers
- Prone to bugs when making changes
- Slow development velocity

**Recommended Solution:**

Create a modular component structure:

```
client/src/
├── components/
│   ├── fractal/
│   │   ├── FractalNode.jsx          # Custom node rendering
│   │   ├── FractalMetrics.jsx       # Metrics overlay component
│   │   ├── ConnectionLines.jsx      # Multi-parent connection lines
│   │   └── FractalTree.jsx          # Main tree wrapper
│   ├── modals/
│   │   ├── GoalModal.jsx            # Create/edit goals
│   │   ├── PracticeSessionModal.jsx # Create practice sessions
│   │   ├── DeleteConfirmModal.jsx   # Delete confirmation
│   │   └── GoalDetailsModal.jsx     # Goal details view
│   ├── sidebar/
│   │   ├── GoalDetails.jsx          # Goal details sidebar content
│   │   ├── SessionDetails.jsx       # Session details sidebar content
│   │   └── Sidebar.jsx              # Sidebar container
│   └── navigation/
│       ├── TopNav.jsx               # Top navigation bar
│       └── FractalSelector.jsx      # Fractal selection UI
├── hooks/
│   ├── useGoals.js                  # Goal CRUD operations & state
│   ├── usePracticeSessions.js       # Practice session operations
│   ├── useTimezone.js               # Timezone management
│   └── useModals.js                 # Modal state management
├── utils/
│   ├── goalHelpers.js               # getChildType, calculateAge, etc.
│   ├── treeHelpers.js               # findGoalById, injectSession, etc.
│   └── formatters.js                # Date/time formatting utilities
└── contexts/
    ├── GoalsContext.jsx             # Global goals state
    ├── SessionsContext.jsx          # Global sessions state
    └── UIContext.jsx                # UI state (modals, sidebar, etc.)
```

**Implementation Steps:**
1. Extract modal components first (lowest risk)
2. Extract sidebar components
3. Create custom hooks for data fetching
4. Move helper functions to utility files
5. Extract fractal visualization components
6. Implement context providers for global state

**Estimated Effort:** 2-3 weeks  
**Priority:** High

---

### 2. Backend API is Also Monolithic (1,395 lines)

**Problem:**  
`blueprints/api.py` contains ALL API endpoints in a single file:
- Goals CRUD (create, read, update, delete, complete)
- Practice sessions (create, update, get all, get by ID)
- Activities (create, update, delete, get all)
- Session templates (create, update, delete, get all)
- Timers (start, stop, get active)
- Metrics (create, update for activities)

**Impact:**
- Difficult to navigate and find specific endpoints
- Merge conflicts when multiple developers work on API
- Hard to test individual API modules
- Violates Single Responsibility Principle

**Recommended Solution:**

Split into separate blueprint modules:

```
blueprints/
├── __init__.py              # Register all blueprints
├── goals_api.py             # Goal CRUD endpoints
├── sessions_api.py          # Practice session endpoints
├── activities_api.py        # Activity & metric endpoints
├── templates_api.py         # Session template endpoints
└── timers_api.py            # Timer endpoints
```

**Example structure for `goals_api.py`:**
```python
from flask import Blueprint

goals_bp = Blueprint('goals', __name__, url_prefix='/api/goals')

@goals_bp.route('/', methods=['GET'])
def get_goals():
    # Implementation

@goals_bp.route('/', methods=['POST'])
def create_goal():
    # Implementation

# ... other goal endpoints
```

**Update `app.py` to register all blueprints:**
```python
from blueprints.goals_api import goals_bp
from blueprints.sessions_api import sessions_bp
from blueprints.activities_api import activities_bp
from blueprints.templates_api import templates_bp
from blueprints.timers_api import timers_bp

app.register_blueprint(goals_bp)
app.register_blueprint(sessions_bp)
app.register_blueprint(activities_bp)
app.register_blueprint(templates_bp)
app.register_blueprint(timers_bp)
```

**Implementation Steps:**
1. Create new blueprint files
2. Move endpoints to appropriate files
3. Update imports and blueprint registration
4. Test all endpoints to ensure they still work
5. Remove old `api.py` file

**Status:** 🚧 **Partially Implemented** (Dec 2025)
- ✅ `activities_api.py`: Implemented.
- ✅ `sessions_api.py`: Implemented.
- ✅ `goals_api.py`: Implemented.
- ❌ `templates_api.py`: Pending.
- ❌ `timers_api.py`: Pending (currently in `api.py`).

**Estimated Effort:** ~1 day remaining
**Priority:** High

---

### 3. Hardcoded API URLs

**Problem:**  
Multiple hardcoded URLs scattered throughout the codebase:

```javascript
// App.jsx line 12
const API_URL = 'http://localhost:8000/api/goals';

// App.jsx line 170
await axios.get('http://localhost:8000/api/practice-sessions');

// Various other files
await axios.post('http://localhost:8000/api/activities', ...);
```

**Impact:**
- Difficult to change API base URL
- Inconsistent port numbers (8000 vs 8001)
- Hard to switch between environments
- Prone to typos and errors

**Recommended Solution:**

The project already has `client/src/utils/api.js` with a `fractalApi` object, but it's not being used consistently. 

**Action Items:**
1. Ensure all API calls are defined in `api.js`
2. Replace all direct `axios` calls with `fractalApi` methods
3. Remove hardcoded URLs from components

**Example refactor:**

```javascript
// Before (in App.jsx):
await axios.get('http://localhost:8000/api/practice-sessions');

// After:
import { fractalApi } from '../utils/api';
await fractalApi.getSessions(rootId);
```

**Files to update:**
- `client/src/App.jsx` (primary offender)
- Any other components making direct API calls

**Implementation Steps:**
1. Audit all files for direct `axios` calls
2. Add missing methods to `fractalApi` if needed
3. Replace all direct calls with `fractalApi` methods
4. Test thoroughly

**Estimated Effort:** 2-3 days  
**Priority:** High (Quick win)

---

## 🟡 Major Issues

### 4. No Proper State Management

**Problem:**  
All application state is managed in `App.jsx` in a monolithic way. While progress has been made with `ActivitiesContext` (implemented Dec 2025) and `TimezoneContext`, many other states are still prop-drilled:
- `roots`, `selectedRootId`
- `sessions`, `practiceSessions` (partially overlapping with activities)
- `showModal`, `showDetailsModal`
- `sidebarMode`, `viewMode`
- `isEditing`, `editForm`

**Impact:**
- `App.jsx` remains bloated
- Still heavy prop drilling for UI state and Goals data
- Difficult to share UI state (like modals) between components
- Performance issues from unnecessary re-renders in the main tree

**Status:** 🚧 **Partially Implemented**
- ✅ `ActivitiesContext`: Implemented! Centralizes activity logic and syncs between pages.
- ✅ `TimezoneContext`: Implemented.
- ❌ `GoalsContext`: Pending.
- ❌ `SessionsContext`: Pending.
- ❌ `UIContext`: Pending.

**Recommended Solution:**

Continue implementing React Context API for remaining global state:

Implement React Context API for global state management:

```javascript
// contexts/GoalsContext.jsx
export const GoalsContext = createContext();

export function GoalsProvider({ children }) {
  const [roots, setRoots] = useState([]);
  const [selectedRootId, setSelectedRootId] = useState(null);
  
  const fetchGoals = async () => { /* ... */ };
  const createGoal = async (goalData) => { /* ... */ };
  const updateGoal = async (id, updates) => { /* ... */ };
  const deleteGoal = async (id) => { /* ... */ };
  
  return (
    <GoalsContext.Provider value={{
      roots,
      selectedRootId,
      setSelectedRootId,
      fetchGoals,
      createGoal,
      updateGoal,
      deleteGoal
    }}>
      {children}
    </GoalsContext.Provider>
  );
}

export const useGoals = () => useContext(GoalsContext);
```

**Contexts to create:**
- `GoalsContext` - Goals data and operations
- `SessionsContext` - Practice sessions data and operations
- `UIContext` - Modal states, sidebar state, view modes
- `TimezoneContext` - Already exists, good example

**Usage in components:**
```javascript
// Instead of prop drilling:
function SomeDeepComponent({ goals, fetchGoals, createGoal }) {
  // ...
}

// Use context:
function SomeDeepComponent() {
  const { goals, fetchGoals, createGoal } = useGoals();
  // ...
}
```

**Implementation Steps:**
1. Create context files
2. Wrap app with providers
3. Gradually migrate components to use contexts
4. Remove prop drilling

**Estimated Effort:** 2 weeks  
**Priority:** Medium-High

---

### 5. Inline Styles Everywhere

**Problem:**  
Thousands of lines of inline styles make the code hard to read and maintain:

```jsx
<div style={{
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '0 20px'
}}>
  {/* ... */}
</div>
```

**Impact:**
- Cluttered JSX that's hard to read
- No style reusability
- Difficult to maintain consistent design
- No design system or tokens
- Large bundle size (styles duplicated)

**Recommended Solution:**

Option A: **CSS Modules** (Recommended for this project)
```jsx
// Component.module.css
.container {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 20px;
}

// Component.jsx
import styles from './Component.module.css';

<div className={styles.container}>
  {/* ... */}
</div>
```

Option B: **Styled Components**
```jsx
import styled from 'styled-components';

const Container = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 0 20px;
`;

<Container>
  {/* ... */}
</Container>
```

**Also create a design system:**
```css
/* styles/tokens.css */
:root {
  /* Colors */
  --color-primary: #2196f3;
  --color-success: #4caf50;
  --color-warning: #ff9800;
  --color-error: #f44336;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 40px;
  
  /* Typography */
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 16px;
  
  /* Borders */
  --border-radius: 8px;
  --border-color: #333;
}
```

**Implementation Steps:**
1. Create design token CSS file
2. Choose styling approach (CSS Modules recommended)
3. Gradually migrate components (start with new components)
4. Create reusable style utilities
5. Remove inline styles

**Estimated Effort:** 3-4 weeks (gradual migration)  
**Priority:** Medium

---

### 6. Backup Files in Source Control

**Problem:**  
Multiple backup files committed to the repository:
- `client/src/App.jsx.backup`
- `client/src/App.jsx.bak`
- `blueprints/api.py.bak`
- `blueprints/api.py.bak2`

**Impact:**
- Clutters the repository
- Confusing for developers
- Wastes storage space
- Git history already provides backup functionality

**Recommended Solution:**

Remove all backup files and rely on git history:

```bash
# Remove backup files
rm client/src/App.jsx.backup
rm client/src/App.jsx.bak
rm blueprints/api.py.bak
rm blueprints/api.py.bak2

# Add to .gitignore to prevent future backups
echo "*.backup" >> .gitignore
echo "*.bak" >> .gitignore
echo "*.bak2" >> .gitignore

# Commit the changes
git add .
git commit -m "Remove backup files and update .gitignore"
```

**Implementation Steps:**
1. Remove all `.backup`, `.bak`, `.bak2` files
2. Update `.gitignore`
3. Commit changes

**Estimated Effort:** 5 minutes  
**Priority:** Low (but easy quick win)

---

### 7. No Error Boundaries

**Problem:**  
If any component throws an error, the entire application crashes with a white screen. There's no graceful error handling at the component level.

**Impact:**
- Poor user experience when errors occur
- Difficult to debug production issues
- No error reporting/logging
- Entire app becomes unusable on any error

**Recommended Solution:**

Implement React Error Boundaries:

```jsx
// components/ErrorBoundary.jsx
import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to error reporting service
    console.error('Error caught by boundary:', error, errorInfo);
    // TODO: Send to error tracking service (Sentry, etc.)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-page">
          <h1>Something went wrong</h1>
          <p>We're sorry for the inconvenience. Please try refreshing the page.</p>
          <button onClick={() => window.location.reload()}>
            Refresh Page
          </button>
          {process.env.NODE_ENV === 'development' && (
            <pre>{this.state.error?.toString()}</pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

**Usage:**
```jsx
// main.jsx or App.jsx
<ErrorBoundary>
  <App />
</ErrorBoundary>

// For specific sections:
<ErrorBoundary>
  <Analytics />
</ErrorBoundary>
```

**Implementation Steps:**
1. Create ErrorBoundary component
2. Wrap main app in error boundary
3. Add error boundaries around major features
4. Create error reporting UI
5. (Optional) Integrate with error tracking service

**Estimated Effort:** 1-2 days  
**Priority:** Medium

---

## 🟢 Medium Priority Issues

### 8. Mixed Data Access Patterns

**Problem:**  
Inconsistent access to node properties throughout the codebase:

```javascript
// Sometimes:
node.id
node.type

// Other times:
node.attributes?.id
node.attributes?.type

// Or both:
node.id || node.attributes?.id
node.type || node.attributes?.type
```

**Impact:**
- Confusing for developers
- Prone to bugs (forgetting to check both)
- Difficult to refactor
- Inconsistent data structures

**Recommended Solution:**

Option A: **Normalize data on fetch**
```javascript
const normalizeGoal = (goal) => ({
  id: goal.id || goal.attributes?.id,
  type: goal.type || goal.attributes?.type,
  name: goal.name,
  description: goal.attributes?.description || goal.description,
  // ... other fields
  attributes: goal.attributes,
  children: goal.children?.map(normalizeGoal) || []
});
```

Option B: **Create helper functions**
```javascript
// utils/nodeHelpers.js
export const getNodeId = (node) => node.id || node.attributes?.id;
export const getNodeType = (node) => node.type || node.attributes?.type;
export const getNodeName = (node) => node.name;
export const getNodeDescription = (node) => 
  node.attributes?.description || node.description;
```

**Recommended:** Use Option A (normalize on fetch) for cleaner code.

**Implementation Steps:**
1. Create normalization function
2. Apply normalization in `fetchGoals`
3. Update all code to use consistent structure
4. Remove fallback checks

**Estimated Effort:** 3-4 days  
**Priority:** Medium

---

### 9. No TypeScript

**Problem:**  
The entire codebase is in JavaScript with no type safety, leading to:
- Runtime errors that could be caught at compile time
- Difficult to understand function signatures
- No IDE autocomplete for complex objects
- Refactoring is risky and error-prone

**Impact:**
- More bugs in production
- Slower development (need to check types manually)
- Harder onboarding for new developers
- Difficult to maintain as codebase grows

**Recommended Solution:**

Gradually migrate to TypeScript:

**Phase 1: Setup**
```bash
npm install --save-dev typescript @types/react @types/react-dom
```

Create `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Phase 2: Create type definitions**
```typescript
// types/goal.ts
export interface Goal {
  id: string;
  type: GoalType;
  name: string;
  description: string;
  deadline?: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
  parent_id?: string;
  root_id?: string;
  children?: Goal[];
}

export type GoalType = 
  | 'UltimateGoal'
  | 'LongTermGoal'
  | 'MidTermGoal'
  | 'ShortTermGoal'
  | 'PracticeSession';

// types/session.ts
export interface PracticeSession {
  id: string;
  name: string;
  type: 'PracticeSession';
  attributes: {
    description: string;
    parent_ids: string[];
    session_data?: SessionData;
  };
}
```

**Phase 3: Migrate files gradually**
1. Start with utility files (`.js` → `.ts`)
2. Migrate API layer (`api.js` → `api.ts`)
3. Migrate components (`.jsx` → `.tsx`)
4. Start with leaf components, work up to App

**Implementation Steps:**
1. Install TypeScript and types
2. Create tsconfig.json
3. Create type definition files
4. Rename files to .ts/.tsx
5. Add types gradually
6. Fix type errors
7. Enable strict mode

**Estimated Effort:** 6-8 weeks (gradual migration)  
**Priority:** Medium-Low (long-term investment)

---

### 10. Database Migration Strategy

**Problem:**  
Database migrations are handled manually with Python scripts:
- `python-scripts/add_updated_at_column.py`
- No version tracking
- No rollback capability
- Easy to forget to run migrations
- No migration history

**Impact:**
- Risk of database schema inconsistencies
- Difficult to deploy to new environments
- No way to rollback bad migrations
- Manual process prone to errors

**Recommended Solution:**

Use **Alembic** for database migrations:

**Setup:**
```bash
pip install alembic
alembic init migrations
```

**Configure `alembic.ini`:**
```ini
sqlalchemy.url = sqlite:///%(DB_PATH)s
```

**Create migration:**
```bash
alembic revision -m "add updated_at column"
```

**Example migration:**
```python
# migrations/versions/002_add_updated_at.py
def upgrade():
    op.add_column('goals', 
        sa.Column('updated_at', sa.TIMESTAMP(), nullable=True)
    )
    op.execute(
        "UPDATE goals SET updated_at = created_at"
    )

def downgrade():
    op.drop_column('goals', 'updated_at')
```

**Run migrations:**
```bash
alembic upgrade head  # Apply all migrations
alembic downgrade -1  # Rollback one migration
```

**Project structure:**
```
migrations/
├── versions/
│   ├── 001_initial_schema.py
│   ├── 002_add_updated_at.py
│   ├── 003_add_metrics_table.py
│   └── 004_add_session_templates.py
├── env.py
└── script.py.mako
```

**Implementation Steps:**
1. Install Alembic
2. Initialize Alembic in project
3. Create initial migration from current schema
4. Convert existing migration scripts to Alembic
5. Update deployment scripts to run migrations
6. Document migration process

**Estimated Effort:** 1 week  
**Priority:** Low-Medium

---

## 📊 Priority Matrix

| Priority | Issue | Impact | Effort | Quick Win? |
|----------|-------|--------|--------|------------|
| 1 | Centralize API calls (#3) | Medium | Low | ✅ Yes |
| 2 | Remove backup files (#6) | Low | Very Low | ✅ Yes |
| 3 | Add error boundaries (#7) | Medium | Low | ✅ Yes |
| 4 | Normalize data access (#8) | Medium | Low | ✅ Yes |
| 5 | Split App.jsx (#1) | High | High | ❌ No |
| 6 | Split api.py (#2) | High | Medium | ❌ No |
| 7 | Add state management (#4) | High | Medium | ❌ No |
| 8 | Move to CSS Modules (#5) | Medium | High | ❌ No |
| 9 | Add TypeScript (#9) | High | Very High | ❌ No |
| 10 | Migration tool (#10) | Low | Medium | ❌ No |

---

## 🎯 Recommended Implementation Plan

### Phase 1: Quick Wins (1 week)
**Goal:** Low-hanging fruit that provides immediate value

1. **Day 1-2:** Centralize API calls (#3)
   - Update all components to use `fractalApi`
   - Remove hardcoded URLs
   - Test all API calls

2. **Day 2:** Remove backup files (#6)
   - Delete all `.bak` files
   - Update `.gitignore`

3. **Day 3-4:** Add error boundaries (#7)
   - Create ErrorBoundary component
   - Wrap main sections
   - Test error scenarios

4. **Day 4-5:** Normalize data access (#8)
   - Create normalization function
   - Apply to data fetching
   - Update components

**Deliverable:** Cleaner, more maintainable codebase with better error handling

---

### Phase 2: Backend Refactoring (2 weeks)
**Goal:** Improve backend maintainability

1. **Week 1:** Split api.py (#2)
   - Create separate blueprint files
   - Move endpoints to appropriate files
   - Update imports
   - Test all endpoints

2. **Week 2:** Database migrations (#10)
   - Set up Alembic
   - Create initial migration
   - Convert existing scripts
   - Document process

**Deliverable:** Modular, maintainable backend with proper migration strategy

---

### Phase 3: Frontend Architecture (4-6 weeks)
**Goal:** Improve frontend maintainability and scalability

1. **Week 1-2:** Extract components from App.jsx (#1)
   - Start with modals
   - Extract sidebar components
   - Create fractal components

2. **Week 3:** Implement state management (#4)
   - Create context providers
   - Migrate components to use contexts
   - Remove prop drilling

3. **Week 4:** Create custom hooks
   - Extract data fetching logic
   - Create reusable hooks
   - Simplify components

4. **Week 5-6:** CSS refactoring (#5)
   - Create design tokens
   - Set up CSS Modules
   - Migrate components gradually

**Deliverable:** Modular, maintainable frontend with proper separation of concerns

---

### Phase 4: Long-term Improvements (Ongoing)
**Goal:** Future-proof the codebase

1. **TypeScript migration (#9)**
   - Set up TypeScript
   - Create type definitions
   - Migrate files gradually
   - Enable strict mode

2. **Continuous improvement**
   - Add tests
   - Improve documentation
   - Performance optimization
   - Accessibility improvements

**Deliverable:** Type-safe, well-tested, production-ready application

---

## 📝 Notes

- **Don't try to do everything at once** - Incremental improvements are better than a massive rewrite
- **Test thoroughly** after each change - Ensure nothing breaks
- **Document as you go** - Update README and add inline comments
- **Get feedback** - Review changes with team members
- **Measure impact** - Track improvements in code quality and developer experience

---

## 🔗 Additional Resources

- [React Component Patterns](https://reactpatterns.com/)
- [React Context API](https://react.dev/reference/react/useContext)
- [CSS Modules](https://github.com/css-modules/css-modules)
- [TypeScript React](https://react-typescript-cheatsheet.netlify.app/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [Flask Blueprints](https://flask.palletsprojects.com/en/2.3.x/blueprints/)

---

**Last Updated:** 2025-12-28  
**Next Review:** After Phase 1 completion
