# Documentation Directory

This directory contains all project documentation organized by category.

## Directory Structure

### `/architecture/`
**Purpose:** High-level architecture decisions, design patterns, and system design documents.

**Contents:**
- `ARCHITECTURE_NOTES.md` - Key architectural decisions and patterns
- `DATABASE_IMPROVEMENTS.md` - Database schema improvements and rationale
- `DATABASE_IMPROVEMENTS_CHECKLIST.md` - Implementation checklist for DB improvements
- `DATABASE_REVIEW_SUMMARY.md` - Database review findings
- `MULTI_USER_ARCHITECTURE.md` - Multi-user support design

**When to add files here:**
- Documenting major architectural decisions
- System design documents
- Database schema design and improvements
- Multi-tenant or scaling architecture plans

---

### `/migrations/`
**Purpose:** Database migration documentation, guides, and reports.

**Contents:**
- Migration guides (preflight, quick start, completion reports)
- Production vs development migration comparisons
- Migration checklists and readiness assessments

**When to add files here:**
- Before/after running database migrations
- Migration planning documents
- Migration completion reports
- Production migration guides

---

### `/features/`
**Purpose:** Feature-specific implementation documentation and summaries.

**Contents:**
- Individual feature implementation plans
- Feature completion summaries
- UI/UX implementation details
- Component-specific documentation

**When to add files here:**
- Planning a new feature
- Documenting feature implementation
- Recording feature completion status
- Component redesign documentation

---

### `/planning/`
**Purpose:** Project planning, roadmaps, and feature backlogs.

**Contents:**
- `features.txt` - Feature backlog and to-do list
- Implementation plans
- Project roadmaps

**When to add files here:**
- Creating feature backlogs
- Planning sprints or milestones
- Tracking project progress
- Brainstorming new features

---

### `/guides/`
**Purpose:** How-to guides, tutorials, and operational documentation.

**Contents:**
- Setup guides
- Development workflows
- Deployment procedures
- Troubleshooting guides

**When to add files here:**
- Creating setup instructions
- Documenting workflows
- Writing troubleshooting guides
- Operational procedures

---

## Documentation Protocol for AI Agents

### Before Creating New Documentation

1. **Check existing docs** - Search this directory to avoid duplication
2. **Choose the right category** - Use the guidelines above
3. **Use descriptive names** - Format: `FEATURE_NAME_TYPE.md` (e.g., `TIMER_IMPLEMENTATION_PLAN.md`)
4. **Keep root clean** - NEVER create documentation files in project root

### Naming Conventions

- **Architecture docs:** `SYSTEM_NAME_ARCHITECTURE.md` or `DESIGN_PATTERN_NAME.md`
- **Migration docs:** `MIGRATION_DESCRIPTION_TYPE.md` (e.g., `MIGRATION_COMPLETION_REPORT.md`)
- **Feature docs:** `feature-name-type.md` (lowercase with hyphens)
- **Planning docs:** `feature-name-plan.md` or `features.txt`
- **Guides:** `GUIDE_NAME.md` (e.g., `ENVIRONMENT_SETUP.md`)

### Documentation Lifecycle

1. **Planning Phase** → Create in `/planning/` or `/features/`
2. **Implementation Phase** → Update implementation docs in `/features/`
3. **Completion Phase** → Create summary in `/features/`, update `/planning/features.txt`
4. **Migration Phase** → Create migration docs in `/migrations/`
5. **Architecture Changes** → Document in `/architecture/`

### Required Updates

When creating or modifying documentation:

1. **Update this README** if adding new categories or major docs
2. **Update `/index.md`** if changing core features, APIs, or components
3. **Update `/planning/features.txt`** when completing features
4. **Cross-reference** related documents using relative links

### File Organization Rules

✅ **DO:**
- Place docs in appropriate subdirectories
- Use clear, descriptive filenames
- Include creation/update dates in documents
- Cross-reference related documentation
- Keep implementation details in feature docs
- Archive old/obsolete docs (add `_ARCHIVED` suffix)

❌ **DON'T:**
- Create documentation in project root (except `index.md` and `README.md`)
- Duplicate information across multiple docs
- Use vague filenames like `notes.md` or `temp.md`
- Leave orphaned documentation without context
- Mix different documentation types in same file

---

## Quick Reference

**I'm documenting a new feature** → `/features/feature-name-implementation.md`

**I'm planning a migration** → `/migrations/MIGRATION_NAME_PLAN.md`

**I completed a migration** → `/migrations/MIGRATION_NAME_COMPLETION_REPORT.md`

**I'm making architecture changes** → `/architecture/SYSTEM_NAME_DESIGN.md`

**I'm adding to the backlog** → `/planning/features.txt`

**I'm writing a setup guide** → `/guides/SETUP_NAME.md`

---

**Last Updated:** 2026-01-01  
**Maintained By:** Project AI Agents
