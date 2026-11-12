import { useOptionalTheme } from '../contexts/ThemeContext';
import { LIGHT_THEME_TEXT_CONTRAST, adaptColorForTheme } from '../utils/themeColors';

// Text set on a tint of its own colour (badges) loses about a tenth of its contrast to the tint.
const TINTED_TEXT_CONTRAST = 5.5;
const ROLE_CONTRAST = { mark: undefined, text: LIGHT_THEME_TEXT_CONTRAST, tintedText: TINTED_TEXT_CONTRAST };

/**
 * A user-chosen colour (goal level, template, program, block) made legible in the current
 * theme: 'mark' meets 3:1 for icons, dots and borders; 'text' meets 4.5:1 for words set in it;
 * 'tintedText' leaves room for a tint of the colour behind the words.
 */
export default function useReadableColor(color, role = 'mark') {
    const theme = useOptionalTheme()?.resolvedTheme ?? 'dark';
    return adaptColorForTheme(color, theme, ROLE_CONTRAST[role]);
}
