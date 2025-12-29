import React, { useState, useEffect, createContext, useContext } from 'react';
import FractalView from './components/FractalView';
import axios from 'axios';
import './App.css';

// Modals
import GoalModal from './components/modals/GoalModal';
import PracticeSessionModal from './components/modals/PracticeSessionModal';
import DeleteConfirmModal from './components/modals/DeleteConfirmModal';
import Sidebar from './components/Sidebar';
import { getTypeDisplayName, getChildType, calculateGoalAge, findGoalById } from './utils/goalHelpers';

// Create Timezone Context
export const TimezoneContext = createContext();

// Hook to use timezone in child components
export const useTimezone = () => useContext(TimezoneContext);

const API_URL = 'http://localhost:8000/api/goals';

// Helpers are imported from utils/goalHelpers.js

// Helper to calculate metrics for a goal tree
// Helper to calculate metrics for a goal tree


function App() {
  const [roots, setRoots] = useState([]); // All top-level fractals
  const [selectedRootId, setSelectedRootId] = useState(null);
  // Initialize timezone from localStorage or system default
  const [timezone, setTimezone] = useState(() => {
    const saved = localStorage.getItem('userTimezone');
    return saved || Intl.DateTimeFormat().resolvedOptions().timeZone;
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedParent, setSelectedParent] = useState(null);

  // Goal details state moved to Sidebar component

  // Practice session modal state
  const [showPracticeSessionModal, setShowPracticeSessionModal] = useState(false);
  // Form state moved to GoalModal
  // selectedShortTermGoals & immediateGoals moved to PracticeSessionModal

  // Sidebar State
  // Sidebar State
  const [inspectorNodeId, setInspectorNodeId] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isBottomPaneCollapsed, setIsBottomPaneCollapsed] = useState(false);

  // Navigation View State ('programming', 'log', 'habits', 'metrics')
  const [viewMode, setViewMode] = useState('programming');

  const fetchGoals = async () => {
    try {
      const res = await axios.get(API_URL);
      const fetchedRoots = res.data;
      setRoots(fetchedRoots);

      // Select first root if none selected and roots exist
      if (!selectedRootId && fetchedRoots.length > 0) {
        setSelectedRootId(fetchedRoots[0].id);
      } else if (fetchedRoots.length === 0) {
        setSelectedRootId(null);
      }
      // If currently selected root is gone (deleted?), reset? (not handling delete yet)

      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch goals", err);
      setLoading(false);
    }
  };

  const [practiceSessions, setPracticeSessions] = useState([]);


  const fetchPracticeSessions = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/practice-sessions');
      setPracticeSessions(res.data);
    } catch (err) {
      console.error("Failed to fetch practice sessions", err);
    }
  };





  useEffect(() => {
    fetchGoals();
    fetchPracticeSessions();
  }, []);

  // Save timezone to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('userTimezone', timezone);
  }, [timezone]);

  const handleAddChildClick = (nodeDatum) => {
    openModal(nodeDatum);
  };

  const handleGoalNameClick = (nodeDatum) => {
    if (isSidebarCollapsed) setIsSidebarCollapsed(false);
    setInspectorNodeId(nodeDatum.id || nodeDatum.attributes?.id);
  };

  const handleUpdateNode = async (data) => {
    if (!inspectorNodeId) return;
    try {
      await axios.put(`${API_URL}/${inspectorNodeId}`, data);
      await fetchGoals();
      await fetchPracticeSessions();
    } catch (error) {
      alert('Failed to update: ' + error.message);
    }
  };

  const openModal = (parent) => {
    if (parent) {
      const parentType = parent.attributes?.type || parent.type;
      const childType = getChildType(parentType);
      if (!childType) {
        alert('This goal type cannot have children.');
        return;
      }
    }
    setSelectedParent(parent);
    setShowModal(true);
  };

  const handleCreateSession = async ({ selectedShortTermGoals, immediateGoals }) => {
    try {
      const payload = {
        name: "Auto-Generated",
        description: `Practice session with ${immediateGoals.length} immediate goal(s)`,
        parent_ids: selectedShortTermGoals,
        immediate_goals: immediateGoals
      };

      // Note: Endpoint matching original code, verify backend path
      await axios.post(`http://localhost:8000/api/practice-sessions`, payload);
      // Original code used {API_URL}/practice-session but API_URL was .../goals.
      // The old monolithic api often handled both.
      // I'll assume http://localhost:8000/api/practice-sessions is safer or match original:
      // await axios.post(`${API_URL}/practice-session`, payload);

      setShowPracticeSessionModal(false);
      await fetchGoals();
      await fetchPracticeSessions();
    } catch (err) {
      alert('Error creating practice session: ' + err.message);
    }
  };

  const handleCreateGoal = async (goalData) => {
    try {
      const res = await axios.post(API_URL, goalData);

      setShowModal(false);
      await fetchGoals();

      // If we created a new root, select it
      if (!goalData.parent_id) {
        setSelectedRootId(res.data.id);
      }
    } catch (err) {
      alert('Error creating goal: ' + err.message);
    }
  };

  const handleToggleCompletion = async (node) => {
    try {
      const goalId = node.id || node.attributes?.id;
      const currentStatus = node.attributes?.completed || false;

      await axios.patch(`${API_URL}/${goalId}/complete`, {
        completed: !currentStatus
      });

      // Refresh the fractal to show updated status
      await fetchGoals();
    } catch (err) {
      alert('Error updating goal completion: ' + err.message);
    }
  };

  // Helper to collect all short-term goals from the tree
  const collectShortTermGoals = (node, collected = []) => {
    if (!node) return collected;

    const type = node.attributes?.type || node.type;
    if (type === 'ShortTermGoal') {
      collected.push({
        id: node.attributes?.id || node.id,
        name: node.name
      });
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach(child => collectShortTermGoals(child, collected));
    }

    return collected;
  };

  // Helper to count practice sessions in the tree
  const countPracticeSessions = (node) => {
    if (!node) return 0;

    let count = 0;
    const type = node.attributes?.type || node.type;
    if (type === 'PracticeSession') {
      count = 1;
    }

    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        count += countPracticeSessions(child);
      });
    }

    return count;
  };

  // Helper function to wrap text
  const wrapText = (text, maxCharsPerLine = 20) => {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (testLine.length > maxCharsPerLine && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  };



  // Delete Modal State
  const [fractalToDelete, setFractalToDelete] = useState(null);

  const selectedFractalData = roots.find(r => r.id === selectedRootId);

  const handleDeleteFractal = (e, fractalId, fractalName) => {
    e.stopPropagation();
    setFractalToDelete({ id: fractalId, name: fractalName });
  };

  const confirmDeleteFractal = async () => {
    if (!fractalToDelete) return;

    try {
      await axios.delete(`${API_URL}/${fractalToDelete.id}`);

      if (selectedRootId === fractalToDelete.id) {
        const remaining = roots.filter(r => r.id !== fractalToDelete.id);
        setSelectedRootId(remaining.length > 0 ? remaining[0].id : null);
      }

      await fetchGoals();
      setFractalToDelete(null);
    } catch (err) {
      alert('Failed to delete fractal: ' + err.message);
    }
  };



  return (
    <TimezoneContext.Provider value={timezone}>
      <div className="app-container">



        {selectedRootId && (
          <div className="top-nav-links">
            <div className="nav-group">
              <span className="fractal-title">{selectedFractalData?.name}</span>
              <div className="nav-separator">|</div>
              {['programming', 'log', 'habits', 'metrics'].map(mode => (
                <button
                  key={mode}
                  className={`nav-text-link ${viewMode === mode ? 'active' : ''}`}
                  onClick={() => setViewMode(mode)}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
              <div className="nav-separator">|</div>
              <button className="nav-text-link home-link" onClick={() => setSelectedRootId(null)}>EXIT TO HOME</button>
            </div>
          </div>
        )}

        <div className="top-section">
          <div className={`main-content ${selectedRootId ? 'with-window' : ''}`}>
            {/* ... main content ... */}
            {/* (I'm not changing main content logic, just assuming it follows) */}
            {/* Wait, I can't use replace_file_content with "..." in it. */}
            {/* I must target the specific blocks. */}
            {/* I'll target the top of App return. */}

            {/* I will split this into two operations. 
       1. Insert Top Nav.
       2. Change Sidebar structure.
   */}

            {loading ? <p>Loading...</p> : (
              selectedFractalData ? (
                <>
                  {viewMode === 'programming' && (
                    <FractalView
                      treeData={selectedFractalData}
                      practiceSessions={practiceSessions}
                      onNodeClick={handleGoalNameClick}
                      selectedNodeId={inspectorNodeId}
                      key={selectedRootId}
                    />
                  )}

                  {viewMode === 'log' && (
                    <div className="view-container log-view">
                      <h2 style={{ color: 'white', borderBottom: '1px solid #444', paddingBottom: '10px' }}>Practice Log</h2>
                      <p style={{ color: '#aaa' }}>Practice Session Log interface for <strong>{selectedFractalData.name}</strong> will appear here.</p>
                    </div>
                  )}

                  {(viewMode === 'habits' || viewMode === 'metrics') && (
                    <div className="view-container placeholder-view">
                      <h2 style={{ color: 'white' }}>{viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}</h2>
                      <p style={{ color: '#aaa' }}>Feature Coming Soon</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="fractal-selection-container">
                  <h1 style={{ color: 'white', fontWeight: 300, marginBottom: '10px' }}>My Fractal Goals</h1>
                  <p style={{ color: '#888' }}>Select a tree to focus on</p>

                  <div className="fractal-selection-grid">
                    {roots.map(root => (
                      <div key={root.id} className="fractal-card" onClick={() => setSelectedRootId(root.id)}>
                        <h3>{root.name}</h3>
                        <button
                          className="delete-btn"
                          onClick={(e) => handleDeleteFractal(e, root.id, root.name)}
                          title="Delete Fractal"
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    <div className="fractal-card add-fractal-card" onClick={() => openModal(null)}>
                      <div className="add-icon">+</div>
                      <h3>New Fractal</h3>
                    </div>
                  </div>

                  {/* Options Section */}
                  <div style={{
                    marginTop: '40px',
                    padding: '20px',
                    background: '#1a1a1a',
                    borderRadius: '8px',
                    border: '1px solid #333'
                  }}>
                    <h2 style={{ color: 'white', fontWeight: 300, fontSize: '18px', marginBottom: '15px' }}>Options</h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <label style={{ color: '#aaa', fontSize: '14px', minWidth: '80px' }}>Timezone:</label>
                      <select
                        value={timezone}
                        onChange={(e) => setTimezone(e.target.value)}
                        style={{
                          padding: '8px 12px',
                          background: '#2a2a2a',
                          border: '1px solid #444',
                          borderRadius: '4px',
                          color: 'white',
                          fontSize: '14px',
                          cursor: 'pointer',
                          minWidth: '300px'
                        }}
                      >
                        {Intl.supportedValuesOf('timeZone').map(tz => (
                          <option key={tz} value={tz}>{tz}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>

          {selectedRootId && (
            <Sidebar
              selectedNode={(() => {
                if (!inspectorNodeId) return null;
                const session = practiceSessions.find(s => s.id === inspectorNodeId || s.attributes?.id === inspectorNodeId);
                if (session) return session;
                const root = roots.find(r => r.id === selectedRootId);
                return root ? findGoalById(root, inspectorNodeId) : null;
              })()}
              selectedRootId={selectedRootId}
              onClose={() => setInspectorNodeId(null)}
              onUpdate={handleUpdateNode}
              onDelete={(node) => setFractalToDelete(node)}
              onAddChild={(node) => openModal(node)}
              onAddSession={() => {
                if (roots.find(r => r.id === selectedRootId)) {
                  setShowPracticeSessionModal(true);
                }
              }}
              onToggleCompletion={handleToggleCompletion}
            />
          )}
        </div>


        {/* Create/Add Goal Modal */}
        <GoalModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreateGoal}
          parent={selectedParent}
        />



        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          item={fractalToDelete}
          isFractal={selectedRootId === fractalToDelete?.id}
          onConfirm={confirmDeleteFractal}
          onCancel={() => setFractalToDelete(null)}
        />

        {/* Goal Details Modal - moved to Sidebar */}
        {/* Practice Session Modal */}
        {/* Practice Session Modal */}
        <PracticeSessionModal
          isOpen={showPracticeSessionModal}
          onClose={() => setShowPracticeSessionModal(false)}
          onSubmit={handleCreateSession}
          shortTermGoals={(() => {
            const selectedRoot = roots.find(r => r.id === selectedRootId);
            return selectedRoot ? collectShortTermGoals(selectedRoot) : [];
          })()}
        />

        {/* Environment Indicator */}
        <div className={`env-indicator ${import.meta.env.VITE_ENV || 'development'}`}>
          {import.meta.env.VITE_ENV || 'development'}
        </div>
      </div >
    </TimezoneContext.Provider>
  );
}

export default App;
