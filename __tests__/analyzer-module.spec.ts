import { describe, expect, it } from 'vitest';
import { AnalyzerModule, extractPackageName, isNodeModulesModule } from '../src/analyzer-module.ts';

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

    it('computes business/vendor split and package aggregation', async () => {
        const bundle = makeBundle() as Record<string, any>;
        bundle['assets/index-DIzJl3AY.js'].modules = {
            'D:/proj/src/main.ts': { renderedLength: 100, originalLength: 120 },
            'D:/proj/node_modules/lodash/index.js': { renderedLength: 300, originalLength: 500 },
            'D:/proj/node_modules/@scope/pkg/index.js': { renderedLength: 50, originalLength: 80 },
        };

        const analyzer = new AnalyzerModule();
        analyzer.setupRollupChunks(bundle);
        for (const name in bundle) {
            await analyzer.addModule(bundle[name]);
        }

        const modules = analyzer.processModule();
        const chunk = modules.find((m) => m.filename.endsWith('.js'))!;

        // 业务代码 = main.ts 100，依赖 = lodash 300 + @scope/pkg 50
        expect(chunk.businessSize).toBe(100);
        expect(chunk.vendorSize).toBe(350);

        // 包聚合：lodash 300，@scope/pkg 50
        const lodash = chunk.packages.find((p) => p.name === 'lodash');
        const scoped = chunk.packages.find((p) => p.name === '@scope/pkg');
        expect(lodash?.renderedLength).toBe(300);
        expect(scoped?.renderedLength).toBe(50);
        // 按体积降序
        expect(chunk.packages[0].name).toBe('lodash');

        // 模块明细保留 Rollup 官方体积
        expect(chunk.moduleDetails).toHaveLength(3);
        expect(chunk.moduleDetails.find((d) => d.id.endsWith('lodash/index.js'))?.renderedLength).toBe(300);
    });

    it('builds reverse references (dependents) from chunk imports', async () => {
        const bundle = makeBundle() as Record<string, any>;
        // 给入口 chunk 加上对 vendor chunk 的 import
        bundle['assets/index-DIzJl3AY.js'].imports = ['assets/vendor-B.js'];
        bundle['assets/vendor-B.js'] = {
            type: 'chunk',
            fileName: 'assets/vendor-B.js',
            code: 'export const v = 1;\n',
            sourcemapFileName: '',
            modules: {
                'D:/proj/node_modules/lodash/index.js': { renderedLength: 300, originalLength: 500 },
            },
            imports: [],
            dynamicImports: [],
            isEntry: false,
        };

        const analyzer = new AnalyzerModule();
        analyzer.setupRollupChunks(bundle);
        for (const name in bundle) {
            await analyzer.addModule(bundle[name]);
        }

        const modules = analyzer.processModule();
        const entry = modules.find((m) => m.filename === 'assets/index-DIzJl3AY.js')!;
        const vendor = modules.find((m) => m.filename === 'assets/vendor-B.js')!;

        // 入口 import 了 vendor，所以 vendor 的 dependents 应包含入口
        expect(vendor.dependents).toContain('assets/index-DIzJl3AY.js');
        expect(entry.dependents).toEqual([]);
        expect(entry.imports).toContain('assets/vendor-B.js');
    });

    it('detects duplicate modules across chunks', async () => {
        const bundle = makeBundle() as Record<string, any>;
        bundle['assets/index-DIzJl3AY.js'].modules = {
            'D:/proj/src/main.ts': { renderedLength: 100, originalLength: 120 },
            'D:/proj/node_modules/shared.js': { renderedLength: 200, originalLength: 300 },
        };
        bundle['assets/other-H.js'] = {
            type: 'chunk',
            fileName: 'assets/other-H.js',
            code: 'export const o = 2;\n',
            sourcemapFileName: '',
            modules: {
                'D:/proj/node_modules/shared.js': { renderedLength: 200, originalLength: 300 },
            },
            imports: [],
            dynamicImports: [],
            isEntry: true,
        };

        const analyzer = new AnalyzerModule();
        analyzer.setupRollupChunks(bundle);
        for (const name in bundle) {
            await analyzer.addModule(bundle[name]);
        }

        const analysis = analyzer.buildDependencyAnalysis();
        expect(analysis.duplicates).toHaveLength(1);
        const dup = analysis.duplicates[0];
        expect(dup.id.endsWith('shared.js')).toBe(true);
        expect(dup.count).toBe(2);
        expect(dup.chunkFiles).toContain('assets/index-DIzJl3AY.js');
        expect(dup.chunkFiles).toContain('assets/other-H.js');
        expect(dup.renderedLength).toBe(200);
    });

    it('injects module graph for dependency tracing', async () => {
        const analyzer = new AnalyzerModule();
        analyzer.setModuleGraph({
            'D:/proj/src/main.ts': {
                id: 'D:/proj/src/main.ts',
                importers: [],
                importedIds: ['D:/proj/node_modules/lodash/index.js'],
                dynamicallyImportedIds: [],
                isEntry: true,
                isExternal: false,
            },
            'D:/proj/node_modules/lodash/index.js': {
                id: 'D:/proj/node_modules/lodash/index.js',
                importers: ['D:/proj/src/main.ts'],
                importedIds: [],
                dynamicallyImportedIds: [],
                isEntry: false,
                isExternal: false,
            },
        });

        const analysis = analyzer.buildDependencyAnalysis();
        // 反向追溯：lodash 被 main.ts 引用
        expect(analysis.moduleGraph['D:/proj/node_modules/lodash/index.js'].importers).toContain(
            'D:/proj/src/main.ts'
        );
    });
});

describe('extractPackageName / isNodeModulesModule', () => {
    it('extracts package names from node_modules paths', () => {
        expect(extractPackageName('D:/proj/node_modules/lodash/index.js')).toBe('lodash');
        expect(extractPackageName('D:/proj/node_modules/@scope/pkg/index.js')).toBe('@scope/pkg');
        expect(extractPackageName('D:/proj/src/main.ts')).toBeNull();
        expect(isNodeModulesModule('D:/proj/node_modules/lodash/index.js')).toBe(true);
        expect(isNodeModulesModule('D:/proj/src/main.ts')).toBe(false);
    });

    it('handles backslash paths (Windows)', () => {
        expect(extractPackageName('D:\\proj\\node_modules\\lodash\\index.js')).toBe('lodash');
        expect(extractPackageName('D:\\proj\\node_modules\\@scope\\pkg\\index.js')).toBe('@scope/pkg');
        expect(isNodeModulesModule('D:\\proj\\node_modules\\lodash\\index.js')).toBe(true);
    });
});
