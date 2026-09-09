import fs from 'node:fs';
import path from 'node:path';

const repoSrcDir = path.resolve(process.cwd(), 'src');

function listSourceFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') return [];
            return listSourceFiles(fullPath);
        }
        if (!/\.[jt]sx?$/.test(entry.name)) return [];
        return [fullPath];
    });
}

describe('API ownership boundary', () => {
    it('keeps app network calls on the shared API core', () => {
        const violations = [];
        for (const filePath of listSourceFiles(repoSrcDir)) {
            const relativePath = path.relative(repoSrcDir, filePath);
            if (relativePath === path.join('utils', 'api', 'core.js')) continue;
            if (relativePath === path.join('utils', 'api', '__tests__', 'core.test.js')) continue;
            const source = fs.readFileSync(filePath, 'utf8');
            if (/from ['"]axios['"]/.test(source) || /import\s+axios\s+from ['"]axios['"]/.test(source)) {
                violations.push(`${relativePath}: raw axios import`);
            }
            if (/\bfetch\s*\(/.test(source)) {
                violations.push(`${relativePath}: fetch call`);
            }
        }
        expect(violations).toEqual([]);
    });
});
