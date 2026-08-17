import { describe, expect, it } from 'vitest';
import { AnalyzerModule } from '../src/analyzer-module.ts';

const chunkCode = 'export const a = 1;console.log(a);\n';
const sourceContent = 'const a = 1;\nconsole.log(a);\n';
const sourceMap = JSON.stringify({
    version: 3,
    file: 'index.js',
    sources: ['../../src/main.ts'],
    sourcesContent: [sourceContent],
    names: [],
    mappings: 'AAAA',
});

function makeBundle() {
    return {
        'assets/index-DIzJl3AY.js': {
            type: 'chunk',
            fileName: 'assets/index-DIzJl3AY.js',
            code: chunkCode,
            sourcemapFileName: 'assets/index-DIzJl3AY.js.map',
            modules: {},
            imports: [],
            dynamicImports: [],
            isEntry: true,
        },
        'assets/index-DIzJl3AY.js.map': {
            type: 'asset',
            fileName: 'assets/index-DIzJl3AY.js.map',
            source: sourceMap,
        },
        'assets/index-GmK2cb7z.css': {
            type: 'asset',
            fileName: 'assets/index-GmK2cb7z.css',
            source: 'body { color: red; }',
        },
        'assets/logo.png': {
            type: 'asset',
            fileName: 'assets/logo.png',
            source: new Uint8Array([137, 80, 78, 71]),
        },
    };
}

describe('AnalyzerModule', () => {
    it('uses real chunk bytes and original source content for attribution', async () => {
        const bundle = makeBundle();
        const analyzer = new AnalyzerModule();
        analyzer.setupRollupChunks(bundle);
        for (const name in bundle) {
            await analyzer.addModule(bundle[name]);
        }

        const modules = analyzer.processModule();
        const chunk = modules.find((m) => m.filename.endsWith('.js'));
        const css = modules.find((m) => m.filename.endsWith('.css'));
        const png = modules.find((m) => m.filename.endsWith('.png'));

        expect(modules).toHaveLength(3);
        expect(chunk?.parsedSize).toBe(Buffer.byteLength(chunkCode));
        expect(chunk?.gzipSize).toBeGreaterThan(0);
        expect(chunk?.brotliSize).toBeGreaterThan(0);
        expect(chunk?.mapSize).toBe(Buffer.byteLength(sourceMap));
        expect(chunk?.source?.[0]?.filename).toBe('src/main.ts');
        expect(chunk?.source?.[0]?.parsedSize).toBe(Buffer.byteLength(sourceContent));

        expect(css?.gzipSize).toBeGreaterThan(0);

        expect(png?.parsedSize).toBe(4);
        expect(png?.gzipSize).toBe(0);
        expect(png?.brotliSize).toBe(0);
    });
});
