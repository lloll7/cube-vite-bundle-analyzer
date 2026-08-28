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
    /** Phase 1 固定 []，Phase 2 再填 */
    source: Module[];
    stats: Array<Module>;
    groups: Array<Module>;
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
