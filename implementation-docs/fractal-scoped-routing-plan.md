# Fractal-Scoped Routing Architecture Plan

## Overview

Transform the application to use fractal-scoped routing where each root goal (fractal) has its own set of endpoints. This creates better data isolation and more intuitive URLs.

## Current Architecture

**URLs:**
- `/` - Home/Selection
- `/fractal-goals` - View selected fractal
- `/sessions` - View all sessions
- `/log` - Log practice session
- `/programming` - Template builder

**Problem:** All pages share global state via `selectedRootId`. No URL-based scoping.

## New Architecture

**URLs:**
- `/` - Home/Selection (unchanged)
- `/:rootId/fractal-goals` - View specific fractal
- `/:rootId/sessions` - Sessions for this fractal only
- `/:rootId/log` - Log session for this fractal
- `/:rootId/programming` - Templates for this fractal

**Benefits:**
1. ✅ URLs are bookmarkable and shareable
2. ✅ Data is automatically scoped to the fractal
3. ✅ Browser back/forward works correctly
4. ✅ No need for global `selectedRootId` state
5. ✅ Each fractal is truly isolated

## Implementation Steps

### Phase 1: Database Schema Updates

**Goal:** Ensure all data can be filtered by `root_id`

#### 1.1 Review Current Schema

Current tables:
- `goals` - Already has hierarchy via `parent_id`
- `practice_sessions` - Already has `root_id` ✅

**Analysis:**
- Goals: Can derive `root_id` by traversing up the tree
- Practice Sessions: Already have `root_id` field
- Templates (future): Will need `root_id` field

#### 1.2 Add Helper Functions (if needed)

Create database helper to get `root_id` for any goal:
```python
def get_root_id_for_goal(session, goal_id):
    """Traverse up the tree to find the root goal ID."""
    goal = get_goal_by_id(session, goal_id)
    if not goal:
        return None
    
    current = goal
    while current.parent_id:
        parent = get_goal_by_id(session, current.parent_id)
        if not parent:
            break
        current = parent
    
    return current.id
```

### Phase 2: Backend - Flask Routes

**Goal:** Create fractal-scoped API endpoints

#### 2.1 Update API Blueprint Structure

**File:** `blueprints/api.py`

Current structure:
```python
@api_bp.route('/api/goals', methods=['GET'])
@api_bp.route('/api/goals/<goal_id>', methods=['PUT', 'DELETE'])
@api_bp.route('/api/practice-sessions', methods=['GET'])
```

New structure:
```python
# Global endpoints (for home page)
@api_bp.route('/api/fractals', methods=['GET', 'POST'])
@api_bp.route('/api/fractals/<root_id>', methods=['DELETE'])

# Fractal-scoped endpoints
@api_bp.route('/api/<root_id>/goals', methods=['GET', 'POST'])
@api_bp.route('/api/<root_id>/goals/<goal_id>', methods=['PUT', 'DELETE', 'PATCH'])
@api_bp.route('/api/<root_id>/sessions', methods=['GET', 'POST'])
@api_bp.route('/api/<root_id>/sessions/<session_id>', methods=['PUT', 'DELETE', 'PATCH'])
```

#### 2.2 Implement Fractal Validation Middleware

```python
def validate_fractal_access(root_id):
    """Ensure the root_id exists and is valid."""
    session = get_session(engine)
    try:
        root = get_goal_by_id(session, root_id)
        if not root or root.parent_id is not None:
            return None
        return root
    finally:
        session.close()

# Use in routes:
@api_bp.route('/api/<root_id>/goals', methods=['GET'])
def get_fractal_goals(root_id):
    root = validate_fractal_access(root_id)
    if not root:
        return jsonify({"error": "Fractal not found"}), 404
    # ... rest of logic
```

#### 2.3 Update Page Routes

**File:** `blueprints/pages.py`

```python
# Home page
@pages_bp.route('/')
def home():
    return render_template('index.html')

# Fractal-scoped pages
@pages_bp.route('/<root_id>/fractal-goals')
@pages_bp.route('/<root_id>/sessions')
@pages_bp.route('/<root_id>/log')
@pages_bp.route('/<root_id>/programming')
def fractal_page(root_id):
    # Validate root_id exists
    # Serve the same React app (it will handle routing)
    return render_template('index.html')
```

### Phase 3: Frontend - React Router Updates

**Goal:** Use URL parameters instead of global state

#### 3.1 Update AppRouter.jsx

**Current:**
```javascript
const [selectedRootId, setSelectedRootId] = useState(null);

<Route path="/fractal-goals" element={<FractalGoals selectedRootId={selectedRootId} />} />
```

**New:**
```javascript
// No more global selectedRootId state!

<Routes>
  <Route path="/" element={<Selection />} />
  <Route path="/:rootId/fractal-goals" element={<FractalGoals />} />
  <Route path="/:rootId/sessions" element={<Sessions />} />
  <Route path="/:rootId/log" element={<Log />} />
  <Route path="/:rootId/programming" element={<Programming />} />
</Routes>
```

#### 3.2 Update Page Components to Use URL Params

**Example: FractalGoals.jsx**

```javascript
import { useParams, useNavigate } from 'react-router-dom';

function FractalGoals() {
  const { rootId } = useParams(); // Get from URL!
  const navigate = useNavigate();
  
  const [fractalData, setFractalData] = useState(null);
  
  useEffect(() => {
    // Fetch data scoped to this fractal
    axios.get(`/api/${rootId}/goals`)
      .then(res => setFractalData(res.data))
      .catch(err => {
        console.error(err);
        navigate('/'); // Redirect to home if invalid
      });
  }, [rootId]);
  
  // ... rest of component
}
```

#### 3.3 Update Navigation Header

```javascript
const NavigationHeader = () => {
  const { rootId } = useParams();
  
  const navItems = [
    { path: `/${rootId}/fractal-goals`, label: 'FRACTAL VIEW' },
    { path: `/${rootId}/sessions`, label: 'SESSIONS' },
    { path: `/${rootId}/log`, label: 'LOG' },
    { path: `/${rootId}/programming`, label: 'PROGRAMMING' }
  ];
  
  return (
    <div className="top-nav-links">
      {navItems.map(item => (
        <Link key={item.path} to={item.path}>{item.label}</Link>
      ))}
      <Link to="/">EXIT TO HOME</Link>
    </div>
  );
};
```

#### 3.4 Update Selection Page

**File:** `client/src/pages/Selection.jsx`

```javascript
function Selection() {
  const navigate = useNavigate();
  
  const handleSelectRoot = (rootId) => {
    // Navigate to fractal-scoped URL
    navigate(`/${rootId}/fractal-goals`);
  };
  
  return (
    <div className="fractal-selection-grid">
      {roots.map(root => (
        <div 
          key={root.id} 
          className="fractal-card" 
          onClick={() => handleSelectRoot(root.id)}
        >
          <h3>{root.name}</h3>
        </div>
      ))}
    </div>
  );
}
```

### Phase 4: Update All API Calls

**Goal:** Change all API calls to use fractal-scoped endpoints

#### 4.1 Create API Helper

**File:** `client/src/utils/api.js`

```javascript
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api';

export const api = {
  // Global endpoints
  getAllFractals: () => axios.get(`${API_BASE}/fractals`),
  createFractal: (data) => axios.post(`${API_BASE}/fractals`, data),
  deleteFractal: (rootId) => axios.delete(`${API_BASE}/fractals/${rootId}`),
  
  // Fractal-scoped endpoints
  getGoals: (rootId) => axios.get(`${API_BASE}/${rootId}/goals`),
  createGoal: (rootId, data) => axios.post(`${API_BASE}/${rootId}/goals`, data),
  updateGoal: (rootId, goalId, data) => axios.put(`${API_BASE}/${rootId}/goals/${goalId}`, data),
  deleteGoal: (rootId, goalId) => axios.delete(`${API_BASE}/${rootId}/goals/${goalId}`),
  toggleGoalCompletion: (rootId, goalId, completed) => 
    axios.patch(`${API_BASE}/${rootId}/goals/${goalId}/complete`, { completed }),
  
  getSessions: (rootId) => axios.get(`${API_BASE}/${rootId}/sessions`),
  createSession: (rootId, data) => axios.post(`${API_BASE}/${rootId}/sessions`, data),
  updateSession: (rootId, sessionId, data) => 
    axios.put(`${API_BASE}/${rootId}/sessions/${sessionId}`, data),
  deleteSession: (rootId, sessionId) => 
    axios.delete(`${API_BASE}/${rootId}/sessions/${sessionId}`),
};
```

#### 4.2 Update Components to Use API Helper

```javascript
// Before:
const res = await axios.get('http://localhost:8000/api/goals');

// After:
const res = await api.getGoals(rootId);
```

### Phase 5: Testing & Migration

#### 5.1 Testing Checklist

- [ ] Create a new fractal from home page
- [ ] Verify URL changes to `/:rootId/fractal-goals`
- [ ] Navigate between pages within a fractal
- [ ] Verify URLs update correctly
- [ ] Create goals and sessions
- [ ] Verify data is scoped to the fractal
- [ ] Open multiple fractals in different tabs
- [ ] Verify they don't interfere with each other
- [ ] Test browser back/forward buttons
- [ ] Test direct URL access (bookmark)
- [ ] Test invalid `rootId` in URL

#### 5.2 Migration Path

1. ✅ Implement new API endpoints alongside old ones
2. ✅ Update frontend to use new endpoints
3. ✅ Test thoroughly
4. ✅ Remove old global state management
5. ✅ Deprecate old endpoints

## File Changes Summary

### Backend Files to Modify:
1. `blueprints/api.py` - Add fractal-scoped routes
2. `blueprints/pages.py` - Add dynamic page routes
3. `models.py` - Add helper functions (if needed)

### Frontend Files to Modify:
1. `client/src/AppRouter.jsx` - Update routes with `:rootId` param
2. `client/src/pages/Selection.jsx` - Navigate to scoped URLs
3. `client/src/pages/FractalGoals.jsx` - Use `useParams()` hook
4. `client/src/pages/Sessions.jsx` - Use `useParams()` hook
5. `client/src/pages/Log.jsx` - Use `useParams()` hook
6. `client/src/pages/Programming.jsx` - Use `useParams()` hook
7. `client/src/utils/api.js` - Create API helper (new file)

### New Files to Create:
1. `client/src/utils/api.js` - Centralized API calls

## Benefits of This Architecture

1. **URL-Based State**: No need for global `selectedRootId` state
2. **Bookmarkable**: Users can bookmark specific fractals
3. **Shareable**: URLs can be shared with others
4. **Browser Navigation**: Back/forward buttons work correctly
5. **Data Isolation**: Each fractal's data is truly isolated
6. **Scalability**: Easy to add new fractal-scoped features
7. **Multi-Tab Support**: Open different fractals in different tabs
8. **RESTful**: More RESTful API design

## Potential Challenges

1. **Migration**: Need to update all existing API calls
2. **Error Handling**: Need to handle invalid `rootId` gracefully
3. **Loading States**: Need to fetch fractal data on each page
4. **Caching**: May want to cache fractal data to avoid refetching

## Next Steps

1. Review and approve this plan
2. Start with Phase 1 (Database Schema)
3. Implement Phase 2 (Backend Routes)
4. Implement Phase 3 (Frontend Routing)
5. Update all API calls (Phase 4)
6. Test thoroughly (Phase 5)

---

**Estimated Effort**: 4-6 hours
**Complexity**: High (architectural change)
**Risk**: Medium (requires careful testing)
**Reward**: High (much better UX and architecture)
