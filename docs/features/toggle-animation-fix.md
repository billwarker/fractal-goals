Summary: The toggle checkbox is working but the animation sequence isn't correct.

ISSUE: The graph structure changes immediately when `showSessions` changes, but we want it to change only after fade-out completes.

CURRENT FLOW:
1. User clicks checkbox → `showSessions` changes
2. FractalView delays 500ms then updates `deferredShowSessions`  
3. FlowTree watches `showSessions` and tries to animate, but the graph hasn't updated yet

WHAT SHOULD HAPPEN:
1. User clicks → `showSessions` changes → FlowTree fades out
2. After 500ms → `deferredShowSessions` changes → useMemo recalculates → `layoutedNodes` changes
3. When `layoutedNodes` changes → FlowTree re-centers and fades in

FIX NEEDED:
FlowTree has two separate concerns:
- Fade out when `showSessions` changes (immediate)
- Re-center and fade in when `layoutedNodes` changes (after graph updates)

These should be two separate useEffects, not one combined effect.
