"""
Migrates legacy `user.preferences.goal_colors` and `goal_characteristics` JSON blobs
into dedicated `GoalLevel` rows owned by the user.

1. Identifies users with custom goal configuration.
2. Reads the canonical goal levels.
3. For each canonical level that a user specifically customized, clones it into a new 
   user-owned GoalLevel with the overrides applied.
4. Maps existing user Goals of that type to the newly created custom GoalLevel.
5. Strips the legacy JSON blobs from the user's preferences to finalize migration.
"""
from app import app
from models import get_engine, get_session, User, GoalLevel, Goal
from sqlalchemy.orm.attributes import flag_modified
import json

def clone_and_override_level(db_session, user_id, base_level, colors_override, char_override):
    """Creates a new GoalLevel cloned from a base level, with applied overrides."""
    color = base_level.color
    if colors_override and 'primary' in colors_override:
        color = colors_override['primary']
        
    icon = base_level.icon
    allow_manual_completion = base_level.allow_manual_completion
    track_activities = base_level.track_activities
    
    if char_override:
        if 'icon' in char_override:
            icon = char_override['icon']
        if 'completion_methods' in char_override:
            methods = char_override['completion_methods']
            allow_manual_completion = methods.get('manual', allow_manual_completion)
        if 'track_activities' in char_override:
            track_activities = char_override['track_activities']
            
    # Create the new custom level
    new_level = GoalLevel(
        name=base_level.name,
        rank=base_level.rank,
        color=color,
        icon=icon,
        owner_id=user_id,
        allow_manual_completion=allow_manual_completion,
        track_activities=track_activities,
        requires_smart=base_level.requires_smart
    )
    db_session.add(new_level)
    db_session.flush() # get ID
    return new_level


def run_migration():
    with app.app_context():
        engine = get_engine()
        db_session = get_session(engine)
        
        try:
            # 1. Fetch system default Goal Levels (owner_id = None)
            defaults = db_session.query(GoalLevel).filter_by(owner_id=None).all()
            default_map = {lvl.name.replace(" ", ""): lvl for lvl in defaults} # "UltimateGoal" -> GoalLevel
            
            # 2. Find users with custom preferences
            users = db_session.query(User).all()
            migrated_count = 0
            
            for user in users:
                prefs = user.preferences or {}
                colors = prefs.get('goal_colors', {})
                chars = prefs.get('goal_characteristics', {})
                
                # We need to look inside 'default' key if it exists, or just the top level
                if 'default' in colors:
                    colors = colors['default']
                if 'default' in chars:
                    chars = chars['default']
                    
                if not colors and not chars:
                    continue # No customizations for this user
                    
                print(f"Migrating preferences for user: {user.username}")
                
                # 3. For every level they customized, create a personal GoalLevel
                custom_levels_created = {} # canonical_type -> new_level_id
                
                all_customized_keys = set(list(colors.keys()) + list(chars.keys()))
                
                for key in all_customized_keys:
                    base_level = default_map.get(key)
                    if not base_level:
                        print(f"  Warning: Unknown level key '{key}' in preferences, skipping.")
                        continue
                        
                    color_override = colors.get(key)
                    char_override = chars.get(key)
                    
                    new_level = clone_and_override_level(
                        db_session, user.id, base_level, color_override, char_override
                    )
                    custom_levels_created[base_level.id] = new_level.id
                    print(f"  Created custom '{base_level.name}' level (ID: {new_level.id})")
                
                # 4. Map existing goals to the new custom levels
                if custom_levels_created:
                    goals_to_update = db_session.query(Goal).filter_by(owner_id=user.id).all()
                    for goal in goals_to_update:
                        if goal.level_id in custom_levels_created:
                            goal.level_id = custom_levels_created[goal.level_id]
                    print(f"  Mapped {len(goals_to_update)} goals to custom levels.")
                
                # 5. Clean up user preferences
                if 'goal_colors' in prefs:
                    del prefs['goal_colors']
                if 'goal_characteristics' in prefs:
                    del prefs['goal_characteristics']
                    
                user.preferences = prefs
                flag_modified(user, 'preferences')
                migrated_count += 1
                
            db_session.commit()
            print(f"Migration complete. Migrated {migrated_count} users.")
            
        except Exception as e:
            db_session.rollback()
            import traceback
            traceback.print_exc()
            print("Migration failed.")
        finally:
            db_session.close()

if __name__ == '__main__':
    run_migration()
