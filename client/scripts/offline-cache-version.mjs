// The persisted offline cache's version, derived from the server's recorded
// shapes (src/offline/serverContract.json). Computed at build time so the app
// never ships the contract itself; a serializer change regenerates the contract
// (see tests/integration/test_offline_contract.py) and retires old caches.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function offlineCacheVersion() {
    const contract = readFileSync(fileURLToPath(new URL('../src/offline/serverContract.json', import.meta.url)), 'utf8');
    return `v1:${createHash('sha256').update(JSON.stringify(JSON.parse(contract))).digest('hex').slice(0, 12)}`;
}
