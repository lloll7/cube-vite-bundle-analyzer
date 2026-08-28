import type { FilterPattern, HookHandler, Plugin } from 'vite';

type RenderChunkFunction = NonNullable<HookHandler<Plugin['renderChunk']>>;

export type GenerateBundleFunction = NonNullable<HookHandler<Plugin['generateBundle']>>;

export type OutputBundle = Parameters<GenerateBundleFunction>[1];

export type OutputAsset = Extract<OutputBundle[0], { type: 'asset' }>;

export type OutputChunk = Extract<OutputBundle[0], { type: 'chunk' }>;

export type PluginContext = ThisParameterType<RenderChunkFunction>;

export interface Module {
    /** 显示名，初期 = filename */
    label: string;
    filename: string;
    isEntry: boolean;
    /** 是否为 asset 类型，asset 类型没有 isEntry */
    isAsset?: boolean;
    /** 源代码的体积大小，文件实际大小 */
    parsedSize: number;
    /** 压缩后的体积大小，gzip 压缩后的体积大小 */
    gzipSize: number;
    /** 压缩后的体积大小，brotli 压缩后的体积大小 */
    brotliSize: number;
    /** 对应 .map 文件大小，没有则为 0 */
    mapSize: number;
    /** chunk 的静态 import，asset 为 [] */
    imports: string[];
    /** 反向引用：依赖此 chunk 的其他 chunk 文件名，asset 为 [] */
    dependents: string[];
    /** chunk 内模块粒度体积（Rollup 官方口径），asset 为 [] */
    moduleDetails: ModuleDetail[];
    /** 业务代码（非 node_modules）renderedLength 之和，asset 为 0 */
    businessSize: number;
    /** node_modules 代码 renderedLength 之和，asset 为 0 */
    vendorSize: number;
    /** 依赖包聚合（仅 chunk 内 node_modules 包），asset 为 [] */
    packages: PackageStat[];
    /** Phase 1 固定 []，Phase 2 再填 */
    source: Module[];
    stats: Array<Module>;
    groups: Array<Module>;
}

/** chunk 内的单个模块（Rollup module）粒度信息 */
export interface ModuleDetail {
    /** Rollup module id，通常是源文件绝对路径 */
    id: string;
    /** 渲染后的字节数（该模块在产物中的实际贡献） */
    renderedLength: number;
    /** 原始源码字节数（Rolldown 可能缺失，回退为 renderedLength） */
    originalLength: number;
}

/** 依赖包聚合统计（node_modules 下的包） */
export interface PackageStat {
    /** 包名（scoped 包如 @scope/name） */
    name: string;
    /** 包内所有模块 renderedLength 之和 */
    renderedLength: number;
    /** 包内模块 id 列表 */
    modules: string[];
}

/** 重复模块：同一模块出现在多个 chunk 中 */
export interface DuplicateModule {
    id: string;
    /** 出现在几个 chunk */
    count: number;
    /** 该模块 renderedLength */
    renderedLength: number;
    /** 出现在哪些 chunk 的文件名 */
    chunkFiles: string[];
}

/** 模块级依赖图节点（来自 Rollup getModuleInfo） */
export interface ModuleGraphNode {
    id: string;
    /** 静态 import 了该模块的其他模块 id */
    importers: string[];
    /** 该模块静态 import 的模块 id */
    importedIds: string[];
    /** 该模块动态 import 的模块 id */
    dynamicallyImportedIds: string[];
    isEntry: boolean;
    isExternal: boolean;
}

/** 跨 chunk 的依赖分析结果（终端 / 静态 HTML 展示用） */
export interface DependencyAnalysis {
    /** 重复模块列表（按体积降序） */
    duplicates: DuplicateModule[];
    /** 模块级依赖图 id → 节点 */
    moduleGraph: Record<string, ModuleGraphNode>;
}

export interface AnalyzerOptions {
    analyzerMode?: 'json' | 'static' | 'server'; // 不传则只输出终端表格
    fileName?: string; // JSON/HTML 文件名
    analyzerPort?: number; // server 模式端口
    openAnalyzer?: boolean; // server 模式是否自动打开浏览器
    sourcemap?: boolean; // 是否强制开启 sourcemap，默认 true；传 false 时不修改使用方的 sourcemap 配置
    include?: FilterPattern; // 文件过滤
    exclude?: FilterPattern;
    pathFormatter?: PathFormatter; // 自定义展示路径格式化
    /**
     * 体积预算（CI 门槛）：构建后检查，超限打印告警并置退出码 1。
     * 单位均为字节。
     */
    budget?: BudgetOptions;
    /**
     * 是否与上一次 stats.json 对比输出 diff（构建 diff）。
     * 默认 false；开启后会把本次构建与磁盘上已存在的 stats.json 对比。
     */
    diff?: boolean;
}

/** 体积预算阈值（单位：字节） */
export interface BudgetOptions {
    /** 所有 JS chunk 的 parsedSize 总和上限 */
    totalParsedSize?: number;
    /** 所有 JS chunk 的 gzipSize 总和上限 */
    totalGzipSize?: number;
    /** 单个入口 chunk 的 parsedSize 上限 */
    entryParsedSize?: number;
    /** 单个入口 chunk 的 gzipSize 上限 */
    entryGzipSize?: number;
    /** 单个 JS chunk 的 parsedSize 上限（含非入口） */
    chunkParsedSize?: number;
}

/** 预算违规项 */
export interface BudgetViolation {
    /** 违规类型：总量 / 入口 / 单个 chunk */
    type: 'total' | 'entry' | 'chunk';
    /** 对象标识：总量为 'total'，入口/chunk 为文件名 */
    name: string;
    /** 阈值（字节） */
    limit: number;
    /** 实际值（字节） */
    actual: number;
    /** 超限量（字节，正数） */
    excess: number;
}

export type PathFormatter = (path: string, defaultWD: string) => string;
