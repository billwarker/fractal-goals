import { describe, expect, it } from 'vitest';
import { parseVideoUrl } from '../videoEmbeds';

describe('parseVideoUrl — YouTube', () => {
    it('parses watch?v= URLs', () => {
        expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
            provider: 'youtube',
            kind: 'iframe',
            id: 'dQw4w9WgXcQ',
            embedUrl: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1',
            posterUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
            sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });
    });

    it('parses youtu.be short URLs', () => {
        expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    });

    it('parses shorts URLs', () => {
        expect(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    });

    it('parses embed URLs', () => {
        expect(parseVideoUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    });

    it('parses m.youtube.com URLs', () => {
        expect(parseVideoUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')?.id).toBe('dQw4w9WgXcQ');
    });

    it('preserves numeric timestamp via t param', () => {
        expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90')?.embedUrl)
            .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&start=90');
    });

    it('preserves 1h2m3s style timestamp', () => {
        expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=1m30s')?.embedUrl)
            .toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&start=90');
    });

    it('exposes a poster url and source url', () => {
        const result = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ');
        expect(result.posterUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
        expect(result.sourceUrl).toBe('https://youtu.be/dQw4w9WgXcQ');
        expect(result.kind).toBe('iframe');
    });

    it('rejects malformed video ids', () => {
        expect(parseVideoUrl('https://www.youtube.com/watch?v=short')).toBeNull();
    });
});

describe('parseVideoUrl — Instagram', () => {
    it('parses post (p) URLs', () => {
        expect(parseVideoUrl('https://www.instagram.com/p/ABC123xyz/')).toEqual({
            provider: 'instagram',
            kind: 'iframe',
            id: 'ABC123xyz',
            embedUrl: 'https://www.instagram.com/p/ABC123xyz/embed',
            permalink: 'https://www.instagram.com/p/ABC123xyz/',
            sourceUrl: 'https://www.instagram.com/p/ABC123xyz/',
        });
    });

    it('parses reel URLs', () => {
        expect(parseVideoUrl('https://www.instagram.com/reel/ABC123xyz/')?.embedUrl)
            .toBe('https://www.instagram.com/reel/ABC123xyz/embed');
    });

    it('normalizes reels to reel', () => {
        expect(parseVideoUrl('https://www.instagram.com/reels/ABC123xyz/')?.embedUrl)
            .toBe('https://www.instagram.com/reel/ABC123xyz/embed');
    });

    it('parses tv (IGTV) URLs', () => {
        expect(parseVideoUrl('https://www.instagram.com/tv/ABC123xyz/')?.embedUrl)
            .toBe('https://www.instagram.com/tv/ABC123xyz/embed');
    });

    it('rejects instagram profile URLs', () => {
        expect(parseVideoUrl('https://www.instagram.com/someuser/')).toBeNull();
    });
});

describe('parseVideoUrl — Google Drive', () => {
    it('parses /file/d/<id>/view URLs', () => {
        expect(parseVideoUrl('https://drive.google.com/file/d/1AbC_dEfG-hIjK/view?usp=sharing')).toEqual({
            provider: 'googleDrive',
            kind: 'iframe',
            id: '1AbC_dEfG-hIjK',
            embedUrl: 'https://drive.google.com/file/d/1AbC_dEfG-hIjK/preview',
            sourceUrl: 'https://drive.google.com/file/d/1AbC_dEfG-hIjK/view?usp=sharing',
        });
    });

    it('parses /file/d/<id>/preview URLs', () => {
        expect(parseVideoUrl('https://drive.google.com/file/d/1AbC_dEfG-hIjK/preview')?.id)
            .toBe('1AbC_dEfG-hIjK');
    });

    it('parses open?id= URLs', () => {
        expect(parseVideoUrl('https://drive.google.com/open?id=1AbC_dEfG-hIjK')?.embedUrl)
            .toBe('https://drive.google.com/file/d/1AbC_dEfG-hIjK/preview');
    });

    it('parses uc?id= URLs', () => {
        expect(parseVideoUrl('https://drive.google.com/uc?id=1AbC_dEfG-hIjK&export=download')?.id)
            .toBe('1AbC_dEfG-hIjK');
    });

    it('does NOT embed folder links (they have no playable preview)', () => {
        expect(parseVideoUrl('https://drive.google.com/drive/folders/1AbC_dEfG-hIjK')).toBeNull();
    });

    it('rejects a bare drive.google.com URL with no file id', () => {
        expect(parseVideoUrl('https://drive.google.com/')).toBeNull();
    });
});

describe('parseVideoUrl — native video files', () => {
    it('parses a self-hosted .mp4 as a native descriptor', () => {
        expect(parseVideoUrl('https://cdn.example.com/evidence/clip.mp4')).toEqual({
            provider: 'file',
            kind: 'native',
            src: 'https://cdn.example.com/evidence/clip.mp4',
            sourceUrl: 'https://cdn.example.com/evidence/clip.mp4',
        });
    });

    it('parses .webm / .mov / .m4v files', () => {
        expect(parseVideoUrl('https://cdn.example.com/a.webm')?.kind).toBe('native');
        expect(parseVideoUrl('https://cdn.example.com/a.mov')?.kind).toBe('native');
        expect(parseVideoUrl('https://cdn.example.com/a.m4v')?.kind).toBe('native');
    });

    it('ignores query strings when matching the extension', () => {
        expect(parseVideoUrl('https://cdn.example.com/clip.mp4?token=abc')?.kind).toBe('native');
    });

    it('does not treat http (non-https) files as native (mixed content)', () => {
        expect(parseVideoUrl('http://cdn.example.com/clip.mp4')).toBeNull();
    });

    it('does not treat a non-video file as native', () => {
        expect(parseVideoUrl('https://cdn.example.com/doc.pdf')).toBeNull();
    });
});

describe('parseVideoUrl — rejection', () => {
    it('rejects non-allowlisted hosts', () => {
        expect(parseVideoUrl('https://evil.com/embed/dQw4w9WgXcQ')).toBeNull();
    });

    it('rejects lookalike hosts', () => {
        expect(parseVideoUrl('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    });

    it('rejects non-video URLs', () => {
        expect(parseVideoUrl('https://example.com/docs')).toBeNull();
    });

    it('rejects non-http protocols', () => {
        expect(parseVideoUrl('javascript:alert(1)')).toBeNull();
    });

    it('rejects empty / non-string input', () => {
        expect(parseVideoUrl('')).toBeNull();
        expect(parseVideoUrl(null)).toBeNull();
        expect(parseVideoUrl(undefined)).toBeNull();
    });
});
