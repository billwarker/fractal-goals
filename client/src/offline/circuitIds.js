// Mirror of services/circuit_ids.py: UUIDv5 derivations that let a device
// address circuit structure it created offline before the server sees it.
// tests/fixtures/circuit_id_vectors.json keeps both sides identical.

function uuidToBytes(uuid) {
    const hex = String(uuid).replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`Not a UUID: ${uuid}`);
    const bytes = new Uint8Array(16);
    for (let index = 0; index < 16; index += 1) {
        bytes[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

function bytesToUuid(bytes) {
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function uuidv5(namespace, name) {
    const namespaceBytes = uuidToBytes(namespace);
    const nameBytes = new TextEncoder().encode(String(name));
    const data = new Uint8Array(namespaceBytes.length + nameBytes.length);
    data.set(namespaceBytes);
    data.set(nameBytes, namespaceBytes.length);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16);
    hash[6] = (hash[6] & 0x0f) | 0x50;
    hash[8] = (hash[8] & 0x3f) | 0x80;
    return bytesToUuid(hash);
}

export const runSlotId = (runId, sourceSlotId) => uuidv5(runId, `slot:${sourceSlotId}`);
export const runSlotInstanceId = (runId, sourceSlotId) => uuidv5(runId, `slot-instance:${sourceSlotId}`);
export const initialRoundId = (runId, roundNumber) => uuidv5(runId, `round:${roundNumber}`);
export const roundMemberId = (roundId, runSlotId) => uuidv5(roundId, `member:${runSlotId}`);
export const roundMemberSetId = (roundId, runSlotId) => uuidv5(roundId, `set:${runSlotId}`);
export const roundMemberInstanceId = (roundId, runSlotId) => uuidv5(roundId, `instance:${runSlotId}`);
