import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(CURRENT_DIR, '../../');
const ALLOWED_RAW_IMPORTERS = new Set([
    path.join(SRC_ROOT, 'components/ConnectedGoalDetailModal.jsx'),
]);

function collectSourceFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__') return [];
            return collectSourceFiles(fullPath);
        }
        if (!/\.(js|jsx)$/.test(entry.name)) return [];
        if (/\.(test|spec)\.(js|jsx)$/.test(entry.name)) return [];
        return [fullPath];
    });
}

function importsRawGoalDetailModal(source) {
    const specs = [
        ...source.matchAll(/from\s+['"]([^'"]+)['"]/g),
        ...source.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]);

    return specs.some((specifier) => path.basename(specifier) === 'GoalDetailModal');
}

describe('GoalDetailModal import boundary', () => {
    it('keeps app code on ConnectedGoalDetailModal instead of the raw modal', () => {
        const offenders = collectSourceFiles(SRC_ROOT)
            .filter((filePath) => !ALLOWED_RAW_IMPORTERS.has(filePath))
            .filter((filePath) => importsRawGoalDetailModal(fs.readFileSync(filePath, 'utf8')))
            .map((filePath) => path.relative(SRC_ROOT, filePath));

        expect(offenders).toEqual([]);
    });
});
