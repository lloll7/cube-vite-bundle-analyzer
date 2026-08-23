import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { bundleAnalyzer } from '../src/index.ts';

const chunkCode = 'export const a = 1;';
const sourceMap = JSON.stringify({
    version: 3,
    sources: ['src/main.ts'],
    sourcesContent: ['const a = 1;'],
    mappings: 'AAAA',
});

async function runPlugin(
    options: Parameters<typeof bundleAnalyzer>[0],
    bundle: Record<string, unknown>
) {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'analyzer-options-'));
    try {
        const plugin = bundleAnalyzer({
            analyzerMode: 'json',
            fileName: 'stats.json',
            ...options,
        });
        plugin.config({ build: {} });
        plugin.configResolved({ root: tmp, build: { outDir: 'dist' } });
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            await plugin.generateBundle({}, bundle);
            await plugin.closeBundle();
        } finally {
            log.mockRestore();
        }
        return JSON.parse(fs.readFileSync(path.join(tmp, 'dist', 'stats.json'), 'utf8'));
    } finally {
        await rm(tmp, { recursive: true, force: true });
    }
}

describe('bundleAnalyzer options wiring', () => {
    it('passes include/exclude filters to the analyzer', async () => {
        const stats = await runPlugin(
            { include: ['**/*.css'] },
            {
                'assets/a.js': {
                    type: 'chunk',
                    fileName: 'assets/a.js',
                    code: chunkCode,
                    modules: {},
                    imports: [],
                    dynamicImports: [],
                    isEntry: true,
                },
                'assets/a.css': {
                    type: 'asset',
                    fileName: 'assets/a.css',
                    source: 'body { color: red; }',
                },
            }
        );

        expect(stats.map((m) => m.filename)).toEqual(['assets/a.css']);
    });

    it('passes pathFormatter to source tree rendering', async () => {
        const stats = await runPlugin(
            { pathFormatter: (p: string) => `ui/${p}` },
            {
                'assets/index.js': {
                    type: 'chunk',
                    fileName: 'assets/index.js',
                    code: chunkCode,
                    sourcemapFileName: 'assets/index.js.map',
                    modules: {},
                    imports: [],
                    dynamicImports: [],
                    isEntry: true,
                },
                'assets/index.js.map': {
                    type: 'asset',
                    fileName: 'assets/index.js.map',
                    source: sourceMap,
                },
            }
        );

        expect(stats[0].source?.[0]?.filename).toBe('ui/src/main.ts');
    });

    it('does not force sourcemap when sourcemap is false', () => {
        const config: { build?: Record<string, unknown> } = { build: {} };
        bundleAnalyzer({ sourcemap: false }).config(config);
        expect(config.build?.sourcemap).toBeUndefined();
    });

    it('forces sourcemap by default', () => {
        const config: { build?: Record<string, unknown> } = { build: {} };
        bundleAnalyzer().config(config);
        expect(config.build?.sourcemap).toBe(true);
    });
});
