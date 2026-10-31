import { describe, expect, it } from 'vitest';

import mediaTypes from '../../../../tests/fixtures/media_types.json';
import {
    canonicalMediaType, mediaKind, namePastedFile, UPLOAD_ACCEPT, UPLOAD_MIME_NAMES, UPLOAD_TYPES, uploadProblem, withCanonicalType,
} from '../cloudUpload';

const file = (name, type, size = 4) => new File([new Uint8Array(size)], name, { type });

describe('cloud upload media types', () => {
    it('match the server table through the shared fixture', () => {
        expect(UPLOAD_TYPES).toEqual(mediaTypes);
    });

    it.each([
        ['audio/x-m4a', 'Voice Memo.m4a', 'audio/mp4'], ['audio/mp3', 'a.mp3', 'audio/mpeg'], ['audio/x-wav', 'a.WAV', 'audio/wav'],
        ['', 'a.flac', 'audio/flac'], ['application/octet-stream', 'a.opus', 'audio/ogg'], ['image/jpeg', 'a.jpeg', 'image/jpeg'],
    ])('canonicalizes %s %s to %s', (type, name, canonical) => {
        expect(canonicalMediaType(type, name)).toBe(canonical);
    });

    it.each([['audio/mpeg', 'a.wav'], ['audio/aiff', 'a.aiff'], ['', 'notes.txt'], ['video/mp4', 'a.m4a']])(
        'rejects %s %s', (type, name) => { expect(canonicalMediaType(type, name)).toBeNull(); },
    );

    it('knows each kind', () => {
        expect(['image/png', 'video/webm', 'audio/mpeg', 'audio/x-m4a'].map(mediaKind)).toEqual(['image', 'video', 'audio', null]);
    });

    it('lets file and cloud pickers show every accepted file', () => {
        expect(UPLOAD_MIME_NAMES).toEqual(expect.arrayContaining(['audio/mpeg', 'audio/x-m4a', 'audio/x-wav', 'audio/x-flac']));
        expect(UPLOAD_ACCEPT.split(',')).toEqual(expect.arrayContaining(['.mp3', '.m4a', '.flac', '.opus', 'image/png']));
    });

    it('explains unsupported files in terms of all three kinds', () => {
        expect(uploadProblem(file('take.aiff', 'audio/aiff'))).toMatch(/isn’t a picture .*, video .* or audio \(MP3, M4A, WAV, FLAC, OGG\) file/);
        expect(uploadProblem(file('take.m4a', 'audio/x-m4a'))).toBeNull();
    });

    it('relabels a file with its canonical type and leaves canonical files alone', () => {
        const memo = withCanonicalType(file('Voice Memo.m4a', 'audio/x-m4a'));
        expect([memo.name, memo.type, memo.size]).toEqual(['Voice Memo.m4a', 'audio/mp4', 4]);
        const photo = file('a.png', 'image/png');
        expect(withCanonicalType(photo)).toBe(photo);
    });

    it('names pasted audio as audio', () => {
        const now = new Date(2026, 9, 31, 9, 5, 7);
        const pasted = namePastedFile(file('blob', 'audio/x-wav'), 0, now);
        expect([pasted.name, pasted.type]).toEqual(['Pasted audio 2026-10-31 09.05.07.wav', 'audio/wav']);
    });
});
