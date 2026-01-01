# Session Toggle Animation - Implementation Guide

## Problem
The "Show Sessions" checkbox toggle isn't producing the desired animation:
- **Desired:** Fade out → Graph updates (while invisible) → Re-center → Fade in
- **Current:** Graph updates immediately, animation timing is off

## Root Cause
The FlowTree component is watching `showSessions` prop, but the graph structure actually changes based on `deferredShowSessions` (which updates 500ms later). The animation logic needs to be split into two separate concerns.

## Solution

### In FlowTree.jsx (lines 587-605)

**Replace the current single useEffect with TWO separate effects:**

```javascript
// Effect 1: Fade out immediately when user clicks toggle
const prevShowSessionsRef = React.useRef(showSessions);
useEffect(() => {
    if (prevShowSessionsRef.current !== showSessions && rfInstance) {
        prevShowSessionsRef.current = showSessions;
        setIsVisible(false); // Immediate fade-out
    }
}, [showSessions, rfInstance]);

// Effect 2: Re-center and fade in when graph layout actually changes
useEffect(() => {
    if (rfInstance && layoutedNodes.length > 0 && !isVisible) {
        const timer = setTimeout(() => {
            rfInstance.fitView({ padding: 0.2, duration: 0 });
            setTimeout(() => setIsVisible(true), 50);
        }, 100); // Small delay for layout to settle
        return () => clearTimeout(timer);
    }
}, [layoutedNodes, rfInstance, isVisible]);
```

## How It Works

1. **User clicks checkbox**
   - `showSessions` changes immediately
   - Effect 1 triggers → fades out (`setIsVisible(false)`)

2. **After 500ms** (FractalView delay)
   - `deferredShowSessions` updates
   - `useMemo` recalculates with new sessions
   - `layoutedNodes` changes

3. **Effect 2 detects layout change**
   - Checks if graph is invisible (`!isVisible`)
   - Re-centers instantly (duration: 0)
   - Fades in after 50ms

## Result
- Clean fade-to-black
- Graph updates while invisible
- Smooth fade-in revealing perfectly centered new layout

## Files Modified
- `/Users/will/Projects/fractal-goals/client/src/FlowTree.jsx` (lines 587-605)
- `/Users/will/Projects/fractal-goals/client/src/components/FractalView.jsx` (already has 500ms delay)
