// Mirrors services/activity_tags.py and the database's normalized_name column; both share
// tests/fixtures/tag_name_normalization_cases.json.

export const canonicalTagName = (value) => String(value ?? '').split(/\s+/).filter(Boolean).join(' ');

export const normalizeTagName = (value) => canonicalTagName(value).toLowerCase();

/** The catalog tag a typed name would collide with, if any (archived tags included). */
export const findTagByName = (tags, name) => {
    const normalized = normalizeTagName(name);
    if (!normalized) return null;
    return (tags || []).find((tag) => normalizeTagName(tag.name) === normalized) || null;
};
