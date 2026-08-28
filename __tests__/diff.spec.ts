import { describe, expect, it } from 'vitest';
import { buildDiff, loadPreviousStats } from '../src/diff.ts';
import { writeJsonReport } from '../src/output/json.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Module } from '../src/interface.ts';

function chunk(filename: string, parsedSize: number, isEntry = false, isAsset = false): Module {
    return {
        label: filename,
        filename,
        isEntry,
        isAsset,
        parsedSize,
        gzipSize: Math.floor(parsedSize / 3),
        brotliSize: 0,
        mapSize: 0,
        imports: [],
        source: [],
        stats: [],
        groups: [],
    };
}

describe('buildDiff', () => {
    it('detects added, removed and changed files', () => {
        const current = [chunk('a.js', 100), chunk('b.js', 200, true)];
        const previous = [chunk('a.js', 80), chunk('c.js', 50)];

        const diff = buildDiff(current, previous);

        expect(diff.addedCount).toBe(1); // b.js 新增
        expect(diff.removedCount).toBe(1); // c.js 删除
        expect(diff.changedCount).toBe(1); // a.js 100->80 变化
        expect(diff.totalDelta).toBe(100 + 200 - (80 + 50));

        const a = diff.files.find((f) => f.filename === 'a.js');
        expect(a?.delta).toBe(20);
        expect(a?.deltaPct).toBe(25);

        const b = diff.files.find((f) => f.filename === 'b.js');
        expect(b?.prevParsedSize).toBe(-1);
        expect(b?.deltaPct).toBeNull();
    });

    it('computes gzip totals', () => {
        const current = [chunk('a.js', 100)];
        const previous = [chunk('a.js', 100)];
        const diff = buildDiff(current, previous);

        expect(diff.totalGzipSize).toBe(Math.floor(100 / 3));
        expect(diff.prevTotalGzipSize).toBe(Math.floor(100 / 3));
        expect(diff.changedCount).toBe(0);
    });

    it('handles empty previous build (first run)', () => {
        const diff = buildDiff([chunk('a.js', 100)], []);
        expect(diff.addedCount).toBe(1);
        expect(diff.removedCount).toBe(0);
        expect(diff.totalDelta).toBe(100);
    });

    it('sorts nothing and keeps all files in list', () => {
        const diff = buildDiff([chunk('a.js', 100)], []);
        expect(diff.files).toHaveLength(1);
    });

    it('persists baseline outside outDir and survives directory clearing', async () => {
        const tmp = await mkdtemp(path.join(os.tmpdir(), 'analyzer-diff-'));
        try {
            // 模拟 diff 基线存在 outDir 之外的 node_modules/.cache
            const cacheDir = path.join(tmp, 'node_modules/.cache/vite-bundle-analyzer-lin');
            const baselineFile = path.join(cacheDir, 'stats.json');

            // 第一次构建：写入基线
            await writeJsonReport([chunk('a.js', 100)], cacheDir, 'stats.json');

            // 模拟 Vite emptyOutDir 清空 outDir（基线在 outDir 外，不受影响）
            await rm(path.join(tmp, 'dist'), { recursive: true, force: true });

            // 第二次构建：基线仍可读
            const previous = await loadPreviousStats(baselineFile);
            expect(previous).toHaveLength(1);
            expect(previous[0].parsedSize).toBe(100);

            // 与当前构建对比出变化
            const diff = buildDiff([chunk('a.js', 120)], previous);
            expect(diff.totalDelta).toBe(20);
        } finally {
            await rm(tmp, { recursive: true, force: true });
        }
    });

    it('returns empty array when baseline file is missing', async () => {
        const tmp = await mkdtemp(path.join(os.tmpdir(), 'analyzer-diff-'));
        try {
            const previous = await loadPreviousStats(path.join(tmp, 'no-baseline.json'));
            expect(previous).toEqual([]);
        } finally {
            await rm(tmp, { recursive: true, force: true });
        }
    });
});
