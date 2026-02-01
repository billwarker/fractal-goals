import { useEffect } from 'react';

/**
 * Hook to update the document title.
 * Formats title as: "${title} - Fractal Goals"
 * If title is null/undefined, resets to "Fractal Goals"
 * 
 * @param {string} title - The page specific title
 */
export const usePageTitle = (title) => {
    useEffect(() => {
        const baseTitle = 'Fractal Goals';
        if (title) {
            document.title = `${title} - ${baseTitle}`;
        } else {
            document.title = baseTitle;
        }

        // Cleanup: revert to base title when unmounting
        return () => {
            document.title = baseTitle;
        };
    }, [title]);
};
