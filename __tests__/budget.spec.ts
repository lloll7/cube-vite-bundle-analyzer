import { describe, expect, it } from 'vitest';
import { checkBudget } from '../src/budget.ts';
import type { Module } from '../src/interface.ts';

function chunk(filename: string, parsedSize: number, gzipSize: number, isEntry = false): Module {
    return {
        label: filename,
        filename,
        isEntry,
        isAsset: false,
        parsedSize,
        gzipSize,
        brotliSize: 0,
        mapSize: 0,
        imports: [],
        source: [],
        stats: [],
        groups: [],
    };
}

describe('checkBudget', () => {
    const modules = [
        chunk('assets/entry.js', 100_000, 30_000, true),
        chunk('assets/vendor.js', 200_000, 60_000, false),
        chunk('assets/other.js', 50_000, 15_000, false),
    ];

    it('returns empty violations when within budget', () => {
        const violations = checkBudget(modules, {
            totalParsedSize: 500_000,
            totalGzipSize: 200_000,
            entryParsedSize: 150_000,
            entryGzipSize: 50_000,
            chunkParsedSize: 300_000,
        });
        expect(violations).toEqual([]);
    });

    it('detects total parsedSize overrun', () => {
        const violations = checkBudget(modules, { totalParsedSize: 300_000 });
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            type: 'total',
            name: 'totalParsedSize',
            limit: 300_000,
            actual: 350_000,
            excess: 50_000,
        });
    });

    it('detects total gzipSize overrun', () => {
        const violations = checkBudget(modules, { totalGzipSize: 100_000 });
        expect(violations).toHaveLength(1);
        expect(violations[0].name).toBe('totalGzipSize');
    });

    it('detects entry overrun', () => {
        const violations = checkBudget(modules, { entryParsedSize: 90_000 });
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            type: 'entry',
            name: 'assets/entry.js',
            limit: 90_000,
            actual: 100_000,
        });
    });

    it('detects per-chunk overrun for non-entry chunks too', () => {
        const violations = checkBudget(modules, { chunkParsedSize: 150_000 });
        expect(violations).toHaveLength(1);
        expect(violations[0]).toMatchObject({
            type: 'chunk',
            name: 'assets/vendor.js',
            actual: 200_000,
        });
    });

    it('returns multiple violations for multiple overruns', () => {
        const violations = checkBudget(modules, {
            totalParsedSize: 100_000,
            entryParsedSize: 10_000,
            chunkParsedSize: 40_000,
        });
        // total + entry + two chunks (vendor 200k, other 50k > 40k)
        expect(violations.length).toBeGreaterThanOrEqual(4);
    });

    it('ignores asset modules in total budget', () => {
        const withAsset = [
            ...modules,
            {
                ...chunk('assets/big.png', 10_000_000, 0),
                isAsset: true,
            },
        ];
        const violations = checkBudget(withAsset, { totalParsedSize: 300_000 });
        // 10MB 图片不计入 total（chunks 只含非 asset）
        expect(violations).toHaveLength(1);
        expect(violations[0].actual).toBe(350_000);
    });
});
