# Practice Session Frontend Implementation Guide

## Backend Changes Completed ✅

1. **Modified `PracticeSession` class** (goals.py)
   - Added `parents` list field to support multiple parent short-term goals
   - Added `add_parent()` method to add additional parents
   - Overrode `to_dict()` to serialize `parent_ids` list

2. **Added API Endpoints** (server.py)
   - `POST /api/goals/practice-session` - Create practice session with multiple parents and immediate goals
   - `GET /api/practice-sessions` - Get all practice sessions for grid view

## Frontend Implementation Plan

### Phase 1: Practice Session Grid View

#### 1.1 Add State for Practice Sessions
```javascript
const [practiceSessions, setPracticeSessions] = useState([]);
const [selectedPracticeSession, setSelectedPracticeSession] = useState(null);
```

#### 1.2 Fetch Practice Sessions
```javascript
const fetchPracticeSessions = async () => {
  try {
    const res = await axios.get('http://localhost:8000/api/practice-sessions');
    setPracticeSessions(res.data);
  } catch (err) {
    console.error("Failed to fetch practice sessions", err);
  }
};

// Call in useEffect
useEffect(() => {
  fetchGoals();
  fetchPracticeSessions();
}, []);
```

#### 1.3 Update Layout Structure
Change from:
```
<div className="app-container">
  <div className="main-content">...</div>
  <div className="sidebar">...</div>
</div>
```

To:
```
<div className="app-container">
  <div className="top-section">
    <div className="main-content">...</div> {/* Fractal tree */}
    <div className="sidebar">...</div>
  </div>
  <div className="practice-sessions-grid">
    {/* Grid of practice session squares */}
  </div>
</div>
```

#### 1.4 Practice Session Grid Component
```javascript
<div className="practice-sessions-grid">
  <h3>Practice Sessions</h3>
  <div className="sessions-grid-container">
    {practiceSessions.map(session => (
      <div
        key={session.id}
        className={`session-square ${selectedPracticeSession?.id === session.id ? 'selected' : ''}`}
        onClick={() => setSelectedPracticeSession(session)}
      >
        <div className="session-name">{session.name}</div>
        <div className="session-meta">
          {session.attributes.parent_ids.length} goals
        </div>
      </div>
    ))}
  </div>
</div>
```

### Phase 2: Practice Session Modal Integration

#### 2.1 Integrate Modal JSX
Copy the modal JSX from `practice-session-modal.jsx` and add it after the Goal Details Modal in App.jsx (around line 630).

#### 2.2 Update Modal Submit Handler
The modal already has the correct API call structure. Just ensure it calls `fetchPracticeSessions()` after creation:

```javascript
await fetchGoals();
await fetchPracticeSessions(); // Add this line
```

### Phase 3: Connection Visualization

#### 3.1 Add Focused View State
```javascript
const [focusedView, setFocusedView] = useState(false); // true when viewing connections
```

#### 3.2 Modify Tree Rendering for Focused View
When a practice session is selected:
```javascript
{selectedPracticeSession && focusedView ? (
  <ConnectionView
    practiceSession={selectedPracticeSession}
    roots={roots}
  />
) : (
  <Tree ... /> // Normal tree view
)}
```

#### 3.3 Connection View Component
```javascript
const ConnectionView = ({ practiceSession, roots }) => {
  // Find the short-term goals by ID
  const parentGoals = [];
  const parentIds = practiceSession.attributes.parent_ids;
  
  // Collect short-term goals from tree
  const findGoalById = (node, targetId) => {
    if (node.attributes?.id === targetId || node.id === targetId) {
      return node;
    }
    for (const child of node.children || []) {
      const found = findGoalById(child, targetId);
      if (found) return found;
    }
    return null;
  };
  
  parentIds.forEach(id => {
    for (const root of roots) {
      const goal = findGoalById(root, id);
      if (goal) {
        parentGoals.push(goal);
        break;
      }
    }
  });
  
  return (
    <svg width="100%" height="100%">
      {/* Center practice session */}
      <rect
        x="50%"
        y="50%"
        width="150"
        height="150"
        fill="#4caf50"
        transform="translate(-75, -75)"
      />
      <text x="50%" y="50%" textAnchor="middle" fill="white">
        {practiceSession.name}
      </text>
      
      {/* Draw parent goals in a circle around it */}
      {parentGoals.map((goal, index) => {
        const angle = (index / parentGoals.length) * 2 * Math.PI;
        const radius = 250;
        const x = window.innerWidth / 2 + Math.cos(angle) * radius;
        const y = window.innerHeight / 2 + Math.sin(angle) * radius;
        
        return (
          <g key={goal.id}>
            {/* Connection line */}
            <line
              x1="50%"
              y1="50%"
              x2={x}
              y2={y}
              stroke="#3794ff"
              strokeWidth="3"
              strokeDasharray="5,5"
            />
            {/* Goal node */}
            <circle cx={x} cy={y} r="40" fill="#2196f3" />
            <text x={x} y={y} textAnchor="middle" fill="white">
              {goal.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
```

### Phase 4: CSS Styling

```css
/* App Container Layout */
.app-container {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
}

.top-section {
    display: flex;
    flex: 1;
    min-height: 0; /* Important for flex children */
}

.main-content {
    flex-grow: 1;
    height: 100%;
    /* existing styles... */
}

/* Practice Sessions Grid */
.practice-sessions-grid {
    height: 200px;
    background: var(--sidebar-bg);
    border-top: 2px solid var(--border-color);
    padding: 15px 20px;
    overflow-y: auto;
}

.practice-sessions-grid h3 {
    margin: 0 0 15px 0;
    color: #fff;
    font-size: 1.1rem;
}

.sessions-grid-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
}

.session-square {
    background: var(--card-bg);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.2s ease;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

.session-square:hover {
    border-color: var(--accent-color);
    background: var(--hover-bg);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.session-square.selected {
    border-color: #4caf50;
    background: rgba(76, 175, 80, 0.1);
    box-shadow: 0 0 20px rgba(76, 175, 80, 0.3);
}

.session-name {
    font-weight: 600;
    color: #fff;
    font-size: 0.95rem;
    margin-bottom: 8px;
    line-height: 1.3;
}

.session-meta {
    font-size: 0.85rem;
    color: #888;
}

.session-square.selected .session-meta {
    color: #4caf50;
}

/* Connection View */
.connection-view {
    width: 100%;
    height: 100%;
    position: relative;
}

.connection-view svg {
    width: 100%;
    height: 100%;
}
```

## Implementation Steps

1. ✅ Backend changes (completed)
2. ⬜ Add practice session state and fetch function
3. ⬜ Update app layout to include grid section
4. ⬜ Create practice session grid component
5. ⬜ Integrate practice session modal
6. ⬜ Add CSS for grid layout
7. ⬜ Implement connection view visualization
8. ⬜ Add toggle between tree view and connection view
9. ⬜ Test complete flow

## Testing Checklist

- [ ] Can create practice session with multiple short-term goals
- [ ] Practice sessions appear in grid at bottom
- [ ] Clicking practice session selects it (visual feedback)
- [ ] Can view connections between practice session and parent goals
- [ ] Immediate goals are created correctly
- [ ] Practice session naming works (index + date)
- [ ] Grid scrolls if many practice sessions
- [ ] Modal validation works (requires at least 1 parent, 1 immediate goal)
