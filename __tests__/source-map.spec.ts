import { describe, expect, it } from 'vitest';
import { normalizeSourcePath, pickupSourcesFromSourcemap } from '../src/source-map.ts';

describe('pickupSourcesFromSourcemap', () => {
    it('returns sources with their original content', () => {
        const map = JSON.stringify({
            version: 3,
            sources: ['../../src/main.ts', 'src/utils.ts'],
            sourcesContent: ['export const a = 1;', null],
            mappings: 'AAAA',
        });

        expect(pickupSourcesFromSourcemap(map)).toEqual([
            { id: '../../src/main.ts', code: 'export const a = 1;' },
            { id: 'src/utils.ts', code: null },
        ]);
    });

    it('returns an empty list for invalid JSON', () => {
        expect(pickupSourcesFromSourcemap('not-json')).toEqual([]);
    });
});

describe('normalizeSourcePath', () => {
    it('normalizes separators and relative prefixes', () => {
        expect(normalizeSourcePath('..\\..\\src\\main.ts')).toBe('src/main.ts');
        expect(normalizeSourcePath('../../src/main.ts')).toBe('src/main.ts');
        expect(normalizeSourcePath('./src/main.ts')).toBe('src/main.ts');
        expect(normalizeSourcePath('/abs/path/main.ts')).toBe('abs/path/main.ts');
        expect(normalizeSourcePath('file:///D:/proj/src/main.ts')).toBe('D:/proj/src/main.ts');
    });
});
