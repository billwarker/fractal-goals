import { createHash } from 'node:crypto';

// Mirrors services/demo_snapshot_service.py: snapshot ids derive from the source's, so the
// fixture's published demo (scripts/browser_test_server.py) has ids the specs can compute.
const DEMO_SNAPSHOT_NAMESPACE = '6f1c2a52-3c1e-4a8e-9c41-2d6a0f5e7b19';

function uuid5(namespace, name) {
    const bytes = createHash('sha1')
        .update(Buffer.from(namespace.replace(/-/g, ''), 'hex'))
        .update(name)
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const demoRootId = (sourceRootId) => uuid5(DEMO_SNAPSHOT_NAMESPACE, `root:${sourceRootId}`);
export const demoId = (sourceRootId, sourceId) => uuid5(DEMO_SNAPSHOT_NAMESPACE, `${demoRootId(sourceRootId)}:${sourceId}`);

export const DEMO_SHOWCASE = demoRootId('sweep-showcase-root');
export const DEMO_SPANISH = demoRootId('demo-spanish-root');
