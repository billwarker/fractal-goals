import os
import re

target_dir = "/Users/will/Projects/fractal-goals/client/src"

# Patterns to match
# 1. Imports: import { ..., useTheme, ... } from '../../contexts/ThemeContext'
# We need to add import { useGoalLevels } from '../../contexts/GoalLevelsContext' if useTheme was used for goal colors
# 2. Hook destructuring: const { theme, toggleTheme, getGoalColor, getGoalColorDark, getGoalIcon, getScopedCharacteristics } = useTheme();

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    original_content = content
    modifications_made = False

    # Check if we need to do anything
    if 'useTheme' not in content and 'getGoalColor' not in content and 'getScopedCharacteristics' not in content and 'getGoalIcon' not in content:
        return False

    # 1. We need to add useGoalLevels import wherever useTheme is imported
    # Find the ThemeContext import line
    theme_import_match = re.search(r"import\s+\{[^}]*\}\s+from\s+['\"](.*?)ThemeContext(\.jsx)?['\"]", content)
    if theme_import_match:
        rel_path = theme_import_match.group(1)
        # Construct the new import
        new_import = f"import {{ useGoalLevels }} from '{rel_path}GoalLevelsContext';"
        
        # Insert it right after the ThemeContext import
        content = content.replace(theme_import_match.group(0), theme_import_match.group(0) + "\n" + new_import)
        modifications_made = True
        
    # Check if useTheme(...) is called and destructure variables like getGoalColor
    # We want to change const { getGoalColor, theme } = useTheme();
    # into:
    # const { theme } = useTheme();
    # const { getGoalColor } = useGoalLevels();
    
    use_theme_calls = re.findall(r"const\s+\{([^}]+)\}\s*=\s*useTheme\(\)", content)
    for call in use_theme_calls:
        vars_in_theme = [v.strip() for v in call.split(',')]
        
        theme_vars = []
        goal_vars = []
        
        for v in vars_in_theme:
            if not v: continue
            if v in ['theme', 'toggleTheme']:
                theme_vars.append(v)
            else:
                goal_vars.append(v)
                
        if goal_vars:
            # We need a useGoalLevels hook!
            new_theme_call = ""
            if theme_vars:
                new_theme_call += f"const {{ {', '.join(theme_vars)} }} = useTheme();\n    "
            new_theme_call += f"const {{ {', '.join(goal_vars)} }} = useGoalLevels();"
            
            # Replace the old call string
            old_call_str = f"const {{{call}}} = useTheme()"
            content = re.sub(r"const\s+\{" + re.escape(call) + r"\}\s*=\s*useTheme\(\)", new_theme_call, content)
            modifications_made = True

    # Check for direct getScopedCharacteristics -> rewrite to getLevelById
    if 'getScopedCharacteristics' in content:
        content = content.replace('getScopedCharacteristics', 'getLevelById')
        # Note: the old getScopedCharacteristics(goalType) returned an object.
        # The new getLevelById(levelId) returns the GoalLevel object.
        # This might require manual fixup if they pass names instead of IDs, but we mapped names nicely in the backend. 
        # Actually our new GoalLevelsContext provides getLevelByName. Let's use that for safest drop-in replacement
        content = content.replace('getLevelById', 'getLevelByName')

    if modifications_made:
        with open(filepath, 'w') as f:
            f.write(content)
        print(f"Updated {filepath}")
        return True
    return False

count = 0
for root, _, files in os.walk(target_dir):
    for f in files:
        if f.endswith('.jsx') or f.endswith('.js'):
            if process_file(os.path.join(root, f)):
                count += 1

print(f"Refactored {count} files.")
