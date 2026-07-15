import { useCallback, useState } from 'react';
import {
    DEFAULT_LANDING_TREE_VIEW_SETTINGS,
    normalizeLandingTreeViewSettings,
} from '../utils/landingTreeViewSettings';

export default function useLandingTreeViewSettings(selectedExample) {
    const [state, setState] = useState({ exampleId: null, settings: DEFAULT_LANDING_TREE_VIEW_SETTINGS });
    const viewSettings = state.exampleId === selectedExample?.id
        ? state.settings
        : (selectedExample?.treeViewSettings || DEFAULT_LANDING_TREE_VIEW_SETTINGS);
    const setViewSettings = useCallback((updater) => {
        setState((current) => {
            const exampleId = selectedExample?.id || null;
            const currentSettings = current.exampleId === exampleId
                ? current.settings
                : normalizeLandingTreeViewSettings(selectedExample?.treeViewSettings);
            return {
                exampleId,
                settings: typeof updater === 'function' ? updater(currentSettings) : updater,
            };
        });
    }, [selectedExample]);
    return [viewSettings, setViewSettings];
}
