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
    async function run(bundle: Record<string, unknown>) {
        const analyzer = new AnalyzerModule();
        analyzer.setupRollupChunks(bundle);
        for (const name in bundle) {
            await analyzer.addModule(bundle[name]);
        }
        return analyzer.processModule();
    }

    it('uses real chunk bytes and original source content for attribution', async () => {
        const modules = await run(makeBundle());
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

    it('skips gzip/brotli for binary font and media assets', async () => {
        const modules = await run({
            'assets/font.woff2': {
                type: 'asset',
                fileName: 'assets/font.woff2',
                source: new Uint8Array([1, 2, 3, 4]),
            },
            'assets/video.mp4': {
                type: 'asset',
                fileName: 'assets/video.mp4',
                source: new Uint8Array([5, 6, 7, 8]),
            },
        });

        expect(modules).toHaveLength(2);
        for (const mod of modules) {
            expect(mod.parsedSize).toBeGreaterThan(0);
            expect(mod.gzipSize).toBe(0);
            expect(mod.brotliSize).toBe(0);
        }
    });

    it('does not crash when sourcemap sources fields are missing or invalid', async () => {
        const map = JSON.stringify({ version: 3, sources: 'oops', mappings: '' });
        const modules = await run({
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
                source: map,
            },
        });

        expect(modules).toHaveLength(1);
        expect(modules[0].parsedSize).toBe(Buffer.byteLength(chunkCode));
        expect(modules[0].source).toEqual([]);
    });

    it('processes every source file with bounded concurrency', async () => {
        const sources = Array.from({ length: 20 }, (_, index) => `src/file-${index}.ts`);
        const contents = sources.map((_, index) => `export const v${index} = ${index};`);
        const map = JSON.stringify({
            version: 3,
            sources,
            sourcesContent: contents,
            mappings: 'AAAA',
        });
        const modules = await run({
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
                source: map,
            },
        });

        let leafCount = 0;
        const countLeaves = (nodes: typeof modules[0]['source']) => {
            for (const node of nodes) {
                if (node.groups?.length) {
                    countLeaves(node.groups);
                } else {
                    leafCount += 1;
                }
            }
        };
        countLeaves(modules[0].source);

        expect(leafCount).toBe(20);
    });

    it('filters modules with include/exclude options', async () => {
        const bundle = makeBundle();
        const analyzer = new AnalyzerModule({ include: ['**/*.css'] });
        analyzer.setupRollupChunks(bundle);
        for (const name in bundle) {
            await analyzer.addModule(bundle[name]);
        }

        const modules = analyzer.processModule();

        expect(modules.map((m) => m.filename)).toEqual(['assets/index-GmK2cb7z.css']);
    });
});
