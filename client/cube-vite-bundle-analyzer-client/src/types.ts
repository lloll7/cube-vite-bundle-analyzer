export interface GroupWithNode {
    groups?: GroupWithNode[];
    filename?: string;
    label?: string;
    parsedSize?: number;
    gzipSize?: number;
    brotliSize?: number;
    [prop: string]: unknown;
}

export interface ModuleDetail {
    id: string;
    renderedLength: number;
    originalLength: number;
}

export interface PackageStat {
    name: string;
    renderedLength: number;
    modules: string[];
}

export interface Module {
    label: string;
    filename: string;
    isEntry: boolean;
    isAsset?: boolean;
    parsedSize: number;
    gzipSize: number;
    brotliSize: number;
    mapSize: number;
    imports: string[];
    dependents: string[];
    moduleDetails: ModuleDetail[];
    businessSize: number;
    vendorSize: number;
    packages: PackageStat[];
    source: GroupWithNode[];
    groups?: GroupWithNode[];
}

export interface SourceFile {
    path: string;
    parsedSize: number;
    gzipSize: number;
    brotliSize: number;
    chunk: Module;
    chunkCount: number;
}

export type Dimension = 'parsedSize' | 'gzipSize' | 'brotliSize';

export type Category = 'JS' | 'CSS' | '图片' | '字体' | '音视频' | '数据配置' | '网页' | '其他';

declare global {
    interface Window {
        __ANALYZER_DATA__?: Module[];
        __ANALYZER_MODE__?: Dimension;
    }
}
