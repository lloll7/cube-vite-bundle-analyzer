import type { BrotliOptions, ZlibOptions } from 'zlib';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import type {
    DependencyAnalysis,
    DuplicateModule,
    Module,
    ModuleDetail,
    ModuleGraphNode,
    OutputAsset,
    OutputBundle,
    OutputChunk,
    PackageStat,
    PathFormatter,
    PluginContext,
} from './interface.ts';
import type { FilterPattern } from 'vite';
import { byteToString, createBrotil, createGzip, stringToByte } from './shared.ts';
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
    /** chunk 内模块粒度体积（Rollup 官方口径 renderedLength/originalLength） */
    moduleDetails: ModuleDetail[];
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
        // Rolldown/Vite 的 asset.source 可能是 string 或 Uint8Array，统一转 string 供 JSON.parse
        const raw = (chunks[sourcemapFileName] as OutputAsset).source;
        return typeof raw === 'string' ? raw : byteToString(raw);
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
        moduleDetails:
            mod.type === 'chunk'
                ? Object.entries(mod.modules).map(([id, m]) => ({
                      id,
                      renderedLength: m.renderedLength,
                      // Rollup 提供 originalLength，Rolldown 不提供；缺失时回退为 renderedLength
                      originalLength: (m as { originalLength?: number }).originalLength ?? m.renderedLength,
                  }))
                : [],
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

/** 判断模块 id 是否来自 node_modules（Rollup module id 一般是文件路径） */
export function isNodeModulesModule(id: string): boolean {
    return id.split(/[\\/]/).includes('node_modules');
}

/**
 * 从 Rollup module id 中提取 npm 包名：
 * - `.../node_modules/lodash/index.js` → `lodash`
 * - `.../node_modules/@scope/pkg/index.js` → `@scope/pkg`
 * - 非 node_modules 路径返回 null
 */
export function extractPackageName(id: string): string | null {
    const parts = id.split(/[\\/]/);
    const idx = parts.indexOf('node_modules');
    if (idx === -1) return null;
    const rest = parts.slice(idx + 1);
    if (!rest.length) return null;
    // scoped 包：@scope/pkg 需要取两段
    if (rest[0].startsWith('@') && rest[1]) {
        return `${rest[0]}/${rest[1]}`;
    }
    return rest[0];
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
    /** 反向引用：依赖此 chunk 的其他 chunk 文件名 */
    dependents: Set<string>;
    /** chunk 内模块粒度体积（Rollup 官方口径） */
    moduleDetails: ModuleDetail[];
    /** 业务代码（非 node_modules）renderedLength 之和 */
    businessSize: number;
    /** node_modules 代码 renderedLength 之和 */
    vendorSize: number;
    /** 依赖包聚合（仅 chunk 内的 node_modules 包） */
    packages: PackageStat[];

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
        this.dependents = new Set();
        this.moduleDetails = [];
        this.businessSize = 0;
        this.vendorSize = 0;
        this.packages = [];
    }

    private addImports(...imports: string[]) {
        imports.forEach((imp) => this.imports.add(imp));
    }

    async setup(
        mod: SerializedMod,
        compress: ReturnType<typeof createCompressAlorithm>,
        _workspaceRoot: string,
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

            const { map, code, imports, dynamicImports, moduleDetails } = mod;

            this.addImports(...imports, ...dynamicImports);
            this.isAsset = false;
            this.isEntry = mod.isEntry;
            this.moduleDetails = moduleDetails;

            // chunk 体积必须用产物本身的实际字节数，而不是 source 子树的累加值
            const chunkBytes = stringToByte(code);
            this.parsedSize = chunkBytes.byteLength;
            const { gzipSize, brotliSize } = await calcCompressedSize(chunkBytes, compress);
            this.gzipSize = gzipSize;
            this.brotliSize = brotliSize;
            this.mapSize = stringToByte(map).byteLength;

            // 业务代码 vs node_modules 拆分 + 依赖包聚合（Rollup renderedLength 口径）
            let businessSize = 0;
            let vendorSize = 0;
            const packageMap = new Map<string, PackageStat>();
            for (const detail of moduleDetails) {
                if (isNodeModulesModule(detail.id)) {
                    vendorSize += detail.renderedLength;
                    const pkg = extractPackageName(detail.id);
                    if (pkg) {
                        let stat = packageMap.get(pkg);
                        if (!stat) {
                            stat = { name: pkg, renderedLength: 0, modules: [] };
                            packageMap.set(pkg, stat);
                        }
                        stat.renderedLength += detail.renderedLength;
                        stat.modules.push(detail.id);
                    }
                } else {
                    businessSize += detail.renderedLength;
                }
            }
            this.businessSize = businessSize;
            this.vendorSize = vendorSize;
            this.packages = [...packageMap.values()].sort(
                (a, b) => b.renderedLength - a.renderedLength
            );

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
                    const displayPath = _pathFormatter(id, _workspaceRoot);
                    sources.insert(normalizeSourcePath(displayPath), {
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
    /** 模块级依赖图（id → 依赖信息），由插件在 buildStart/buildEnd 钩子注入 */
    private moduleGraph: Record<string, ModuleGraphNode> = {};

    constructor(opt: AnalyzerModuleOptions = {}) {
        this.compressAlorithm = createCompressAlorithm(opt);
        this.modules = [];
        this.pluginContext = null;
        this.workspaceRoot = process.cwd();
        this.chunks = {};
        this.matcher = createFilter(opt.include, opt.exclude);
        this.pathFormatter = opt.pathFormatter || ((path: string) => path);
    }

    /** 由插件注入模块级依赖图（buildEnd 时遍历 this.getModuleIds() 采集） */
    setModuleGraph(graph: Record<string, ModuleGraphNode>) {
        this.moduleGraph = graph;
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
     * 产物落盘后按磁盘真实文件刷新 JS chunk 体积。
     * Vite 可能在 generateBundle 之后才向入口 chunk 追加 modulepreload 等代码，
     * 导致内存中的 code 与磁盘文件不一致，这里以磁盘为准。
     */
    async refreshChunkSizesFromDisk(outDir: string) {
        await mapLimit(this.modules, 8, async (node) => {
            if (node.isAsset) return;
            const filePath = path.join(outDir, node.filename);
            try {
                const fileStat = await stat(filePath);
                if (fileStat.size !== node.parsedSize) {
                    const bytes = new Uint8Array(await readFile(filePath));
                    node.parsedSize = bytes.byteLength;
                    const { gzipSize, brotliSize } = await calcCompressedSize(
                        bytes,
                        this.compressAlorithm
                    );
                    node.gzipSize = gzipSize;
                    node.brotliSize = brotliSize;
                }
                const mapPath = `${filePath}.map`;
                try {
                    node.mapSize = (await stat(mapPath)).size;
                } catch {
                    // 没有 map 文件时保留 generateBundle 阶段的值
                }
            } catch {
                // 文件未落盘或已删除时保留 generateBundle 阶段的值
            }
        });
    }
    /**
     * 导出最终 Module[] 供 UI / JSON / 自定义 analyzerMode 使用。
     * 去掉 internal 字段 originalId，把 imports Set 转为数组，
     * 并基于所有 chunk 的 imports 计算反向引用（dependents）。
     */
    processModule() {
        // 反向引用：遍历所有 chunk 的 imports/dynamicImports，构建 filename -> dependents 映射
        const dependentsMap = new Map<string, Set<string>>();
        for (const mod of this.modules) {
            if (mod.isAsset) continue;
            for (const imp of mod.imports) {
                if (!dependentsMap.has(imp)) dependentsMap.set(imp, new Set());
                dependentsMap.get(imp)!.add(mod.filename);
            }
        }

        return this.modules.map((m) => {
            const { originalId: _, imports, ...rest } = m;
            return {
                ...rest,
                imports: [...imports],
                dependents: m.isAsset ? [] : [...(dependentsMap.get(m.filename) ?? [])],
            };
        }) as Module[];
    }

    /**
     * 跨 chunk 的依赖分析：重复模块检测 + 模块级依赖图。
     * 供终端 / 静态 HTML 输出使用，不进 Module[]（避免破坏 UI 数据结构）。
     */
    buildDependencyAnalysis(): DependencyAnalysis {
        // 重复模块：同一 module id 出现在多个 chunk
        const moduleChunkMap = new Map<string, { count: number; renderedLength: number; chunkFiles: string[] }>();
        for (const mod of this.modules) {
            if (mod.isAsset) continue;
            for (const detail of mod.moduleDetails) {
                let entry = moduleChunkMap.get(detail.id);
                if (!entry) {
                    entry = { count: 0, renderedLength: detail.renderedLength, chunkFiles: [] };
                    moduleChunkMap.set(detail.id, entry);
                }
                entry.count++;
                entry.chunkFiles.push(mod.filename);
            }
        }

        const duplicates: DuplicateModule[] = [...moduleChunkMap.entries()]
            .filter(([, info]) => info.count > 1)
            .map(([id, info]) => ({
                id,
                count: info.count,
                renderedLength: info.renderedLength,
                chunkFiles: info.chunkFiles,
            }))
            .sort((a, b) => b.renderedLength - a.renderedLength);

        return { duplicates, moduleGraph: this.moduleGraph };
    }
}
