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
    include?: FilterPattern; // 文件过滤
    exclude?: FilterPattern;
    pathFormatter?: PathFormatter; // 自定义展示路径格式化
}

export type PathFormatter = (path: string, defaultWD: string) => string;
