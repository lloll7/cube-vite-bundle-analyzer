import type { BrotliOptions, ZlibOptions } from 'zlib';
import type {
    Module,
    OutputAsset,
    OutputBundle,
    OutputChunk,
    PathFormatter,
    PluginContext,
} from './interface.ts';
import type { FilterPattern } from 'vite';
import { createBrotil, createGzip, stringToByte } from './shared.ts';
import { Trie } from './trie.ts';
import type { GroupWithNode } from './trie.ts'
import { createFilter } from '@rollup/pluginutils';
import { normalizeSourcePath, pickupSourcesFromSourcemap } from './source-map.ts';

/** 序列化后的非 JS asset（如 CSS、图片等） */
interface SerializedModWithAsset {
    code: string;
    filename: string;
    label: string;
    kind: 'asset';
}

/** 序列化后的 JS chunk（含 source map 与依赖信息） */
interface SerializedModWithChunk {
    code: string;
    filename: string;
    map: string;
    imports: string[];
    dynamicImports: string[];
    /** chunk 内包含的所有 Rollup module id */
    moduleIds: string[];
    isEntry: boolean;
    kind: 'chunk';
}

export interface AnalyzerModuleOptions {
    /** gzip 压缩参数，传给 zlib */
    gzip?: ZlibOptions;
    /** brotli 压缩参数，传给 zlib */
    brotli?: BrotliOptions;
    /** include 过滤，只分析匹配的文件 */
    include?: FilterPattern;
    /** exclude 过滤，排除匹配的文件 */
    exclude?: FilterPattern;
    /** 自定义路径格式化，用于 UI 展示 */
    pathFormatter?: (path: string, defaultWD: string) => string;
}

/** 统一的序列化中间表示，供 AnalyzerNode.setup 消费 */
type SerializedMod = SerializedModWithAsset | SerializedModWithChunk;

/** 匹配 .js / .mjs / .cjs 等 JS 产物 */
export const JS_EXTENSIONS = /\.(c|m)?js$/;

function findSourcemap(fileName: string, sourcemapFileName: string, chunks: OutputBundle) {
    if (sourcemapFileName in chunks) {
        return (chunks[sourcemapFileName] as OutputAsset).source as string;
    }
    throw new Error(`[analyzer error]: Missing sourcemap for ${fileName}.`);
}

/**
 * 把 Rollup 的 OutputChunk / OutputAsset 序列化为内部分析结构。
 *
 * 分支逻辑：
 * 1. 非 JS asset → 直接标记 kind: 'asset'
 * 2. JS 文件 → 尝试从 bundle 中找 source map，并提取 chunk 元数据
 */
function serializedMod(mod: OutputChunk | OutputAsset, chunks: OutputBundle): SerializedMod {
    // 非 JS asset（如 .css）无需 source map 分析
    if (mod.type === 'asset' && !JS_EXTENSIONS.test(mod.fileName)) {
        const sourceLabel =
            mod.originalFileName ??
            mod.originalFileNames?.[0] ??
            mod.names?.[0] ??
            mod.fileName;
        return <SerializedModWithAsset>{
            code: mod.source,
            filename: mod.fileName,
            label: sourceLabel,
            kind: 'asset', // 标记为非 JS asset
        };
    }

    // 查找 source map：优先用 Rollup 提供的 sourcemapFileName，否则尝试 filename.map
    let sourcemap = '';
    // 是 JS asset
    if (JS_EXTENSIONS.test(mod.fileName)) {
        if ('sourcemapFileName' in mod) {
            if (mod.sourcemapFileName && mod.sourcemapFileName in chunks) {
                // 读取 source map 内容
                sourcemap = findSourcemap(mod.fileName, mod.sourcemapFileName, chunks);
            }
        }
        if (!sourcemap) {
            const possiblePath = mod.fileName + '.map';
            if (possiblePath in chunks) {
                // 读取 source map 内容
                sourcemap = findSourcemap(mod.fileName, possiblePath, chunks);
            }
        }
    }

    const code = mod.type === 'asset' ? mod.source : mod.code;

    return <SerializedModWithChunk>{
        code,
        filename: mod.fileName,
        map: sourcemap,
        imports: mod.type === 'chunk' ? mod.imports : [],
        dynamicImports: mod.type === 'chunk' ? mod.dynamicImports : [],
        moduleIds: mod.type === 'chunk' ? Object.keys(mod.modules) : [],
        isEntry: mod.type === 'chunk' && mod.isEntry,
        kind: 'chunk',
    };
}
/** 根据配置创建 gzip / brotli 压缩器实例（复用，避免每次新建） */
function createCompressAlorithm(opt: AnalyzerModuleOptions) {
    const { gzip, brotli } = opt;
    return {
        gzip: createGzip(gzip),
        brotli: createBrotil(brotli),
    };
}
/** 并行计算同一段内容的 gzip 与 brotli 压缩体积 */
async function calcCompressedSize(
    b: Uint8Array,
    compress: ReturnType<typeof createCompressAlorithm>
) {
    const [{ byteLength: gzipSize }, { byteLength: brotliSize }] = await Promise.all([
        compress.gzip(b),
        compress.brotli(b),
    ]);
    return { gzipSize, brotliSize };
}

/** 有界并发执行异步任务，避免大项目一次性创建上千个压缩任务导致内存/CPU 峰值过高 */
async function mapLimit<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (index < items.length) {
            const current = index++;
            results[current] = await fn(items[current]);
        }
    });
    await Promise.all(workers);
    return results;
}

function isSoucemap(filename: string) {
    return filename.slice(-3) === 'map';
}

/** 二进制资源（图片/音视频/字体等）不再计算 gzip/brotli，压缩结果没有实际参考价值 */
const TEXT_ASSET_EXTENSIONS = new Set([
    'js', 'mjs', 'cjs', 'css', 'html', 'htm', 'json', 'json5',
    'svg', 'txt', 'xml', 'ts', 'tsx', 'jsx', 'vue',
]);

function isTextAsset(filename: string): boolean {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    return TEXT_ASSET_EXTENSIONS.has(ext);
}

export class AnalyzerNode {
    /** Rollup 原始 id / 输出文件名 */
    originalId: string;
    filename: string;
    /** UI 展示状态，默认同 filename */
    label: string;
    parsedSize: number; // 源代码的原始体积大小
    mapSize: number; // source map 的体积大小
    gzipSize: number; // gzip 压缩后的体积大小
    brotliSize: number; // brotli 压缩后的体积大小
    /** 由 source map 还原出的源文件树（Trie 遍历后的 groups） */
    source: Array<GroupWithNode>;
    /** 该 chunk 直接 import 的模块 ID 集合 */
    imports: Set<string>;
    isAsset: boolean;
    isEntry: boolean;

    constructor(originalId: string) {
        this.originalId = originalId;
        this.filename = originalId;
        this.label = originalId;
        this.parsedSize = 0;
        this.gzipSize = 0;
        this.brotliSize = 0;
        this.mapSize = 0;
        this.source = [];
        this.imports = new Set();
        this.isAsset = true;
        this.isEntry = false;
    }

    private addImports(...imports: string[]) {
        imports.forEach((imp) => this.imports.add(imp));
    }

    async setup(
        mod: SerializedMod,
        compress: ReturnType<typeof createCompressAlorithm>,
        _worksapceRoot: string,
        _matcher: ReturnType<typeof createFilter>,
        _pathFormatter: PathFormatter
    ) {
        if (mod.kind === 'asset') {
            const code = stringToByte(mod.code);
            this.parsedSize = code.byteLength;
            this.label = mod.label;
            if (isTextAsset(mod.filename)) {
                const { brotliSize, gzipSize } = await calcCompressedSize(code, compress);
                this.brotliSize = brotliSize;
                this.gzipSize = gzipSize;
            }
        } else {
            const sources = new Trie<{
                parsedSize: number,
                brotliSize: number,
                gzipSize: number
            }>({ meta: { gzipSize: 0, brotliSize: 0, parsedSize: 0 } });

            const { map, code, imports, dynamicImports } = mod;

            this.addImports(...imports, ...dynamicImports);
            this.isAsset = false;
            this.isEntry = mod.isEntry;

            // chunk 体积必须用产物本身的实际字节数，而不是 source 子树的累加值
            const chunkBytes = stringToByte(code);
            this.parsedSize = chunkBytes.byteLength;
            const { gzipSize, brotliSize } = await calcCompressedSize(chunkBytes, compress);
            this.gzipSize = gzipSize;
            this.brotliSize = brotliSize;
            this.mapSize = stringToByte(map).byteLength;

            /**
             * source 树仅用于体积归因展示，使用 source map 自带的 sourcesContent
             * 计算每个源文件的原始体积，不再覆盖 chunk 自身的体积。
             */
            if (map) {
                const sourceFiles = pickupSourcesFromSourcemap(map);
                // 为每个源文件计算体积并插入 Trie，压缩任务限制并发数
                await mapLimit(sourceFiles, 8, async ({ id, code: sourceCode }) => {
                    if (sourceCode == null) return;
                    const b = stringToByte(sourceCode);
                    const parsedSize = b.byteLength;
                    const { brotliSize, gzipSize } = await calcCompressedSize(b, compress);
                    sources.insert(normalizeSourcePath(id), {
                        meta: { parsedSize, gzipSize, brotliSize }
                    });
                });
            }

            // 合并单子目录路径，简化树结构
            sources.mergePrefixSingleDirectory();

            // DFS 遍历 Trie：enter 把子节点挂到 parent.groups，leave 向上聚合体积
            sources.walk(sources.root, {
                enter: (child, parent) => {
                    if (parent) {
                        parent.groups.push(child);
                    }
                },
                leave: (child, _parent) => {
                    if (child.groups && child.groups.length) {
                        Object.assign(
                            child,
                            child.groups.reduce((acc: any, cur: any) => {
                                acc.gzipSize += cur.gzipSize;
                                acc.brotliSize += cur.brotliSize;
                                acc.parsedSize += cur.parsedSize;
                                return acc;
                            }, { gzipSize: 0, brotliSize: 0, parsedSize: 0 })
                        );
                    }
                },
            });

            this.source = sources.root.groups;
        }
    }
}

export class AnalyzerModule {
    /** gzip/brotli 压缩体积计算的压缩器工具（实例化后复用，避免重复创建） */
    compressAlorithm: ReturnType<typeof createCompressAlorithm>;
    /** 已分析的所有模块节点（每一个 AnalyzerNode 对应一个输出文件/chunk/asset） */
    modules: AnalyzerNode[];
    /** 项目的工作空间根目录，用于路径格式化与归一化 */
    workspaceRoot: string;
    /** 注入的 Rollup 插件上下文（可用于调用 resolve 等插件 API） */
    pluginContext: PluginContext | null;
    /** 完整的 OutputBundle（Rollup/Vite 构建结果） */
    private chunks: OutputBundle;
    /** 文件过滤器（根据 include/exclude 决定分析哪些文件） */
    private matcher: ReturnType<typeof createFilter>;
    /** 路径格式化方法，用于格式化 UI 显示的路径（可自定义） */
    private pathFormatter: (path: string, defaultWD: string) => string;

    constructor(opt: AnalyzerModuleOptions = {}) {
        this.compressAlorithm = createCompressAlorithm(opt);
        this.modules = [];
        this.pluginContext = null;
        this.workspaceRoot = process.cwd();
        this.chunks = {};
        this.matcher = createFilter(opt.include, opt.exclude);
        this.pathFormatter = opt.pathFormatter || ((path: string) => path);
    }

    /**
     * 收集 Rollup generateBundle 产出的 chunks。
     * watch 模式下会先清空，避免旧数据残留。
     * Object.assign 支持多 format 构建时合并多批 bundle。
     */
    setupRollupChunks(chunks: OutputBundle, watchMode = false) {
        if (watchMode) {
            this.chunks = {};
            this.modules = [];
        }
        Object.assign(this.chunks, chunks);
    }
    /**
     * 分析单个输出文件，追加到 modules 列表
     * 跳过 .map 文件和不匹配 include / exclude 的文件
     */
    async addModule(mod: OutputChunk | OutputAsset) {
        if (isSoucemap(mod.fileName) || !this.matcher(mod.fileName)) return;
        const serialized = serializedMod(mod, this.chunks);
        const node = new AnalyzerNode(serialized.filename);
        await node.setup(
            serialized,
            this.compressAlorithm,
            this.workspaceRoot,
            this.matcher,
            this.pathFormatter
        );
        this.modules.push(node);
    }
    /**
     * 导出最终 Module[] 供 UI / JSON / 自定义 analyzerMode 使用。
     * 去掉 internal 字段 originalId，把 imports Set 转为数组
     */
    processModule() {
        return this.modules.map((m) => {
            const { originalId: _, imports, ...rest } = m;
            return { ...rest, imports: [...imports] };
        }) as Module[];
    }
}
