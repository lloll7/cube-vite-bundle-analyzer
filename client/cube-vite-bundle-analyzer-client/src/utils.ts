import type { Category, Dimension, Module } from './types';

export const CATEGORIES: Category[] = [
    'JS',
    'CSS',
    '图片',
    '字体',
    '音视频',
    '数据配置',
    '网页',
    '其他',
];

export const CATEGORY_COLORS: Record<Category, string> = {
    JS: '#2563eb',
    CSS: '#10b981',
    图片: '#06b6d4',
    字体: '#8b5cf6',
    音视频: '#f43f5e',
    数据配置: '#14b8a6',
    网页: '#f59e0b',
    其他: '#94a3b8',
};

export function categorizeFile(fileName: string): Category {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const jsExts = new Set(['js', 'mjs', 'cjs']);
    const cssExts = new Set(['css']);
    const imgExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);
    const fontExts = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);
    const mediaExts = new Set(['mp4', 'webm', 'mp3', 'wav']);
    const jsonExts = new Set(['json', 'json5']);
    const htmlExts = new Set(['html', 'htm']);

    if (jsExts.has(ext)) return 'JS';
    if (cssExts.has(ext)) return 'CSS';
    if (imgExts.has(ext)) return '图片';
    if (fontExts.has(ext)) return '字体';
    if (mediaExts.has(ext)) return '音视频';
    if (jsonExts.has(ext)) return '数据配置';
    if (htmlExts.has(ext)) return '网页';
    return '其他';
}

export function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    }
    return bytes + ' B';
}

export function getSize(module: Module, dimension: Dimension): number {
    return module[dimension];
}

export function formatPercent(part: number, total: number): string {
    if (!total) return '0.0%';
    return ((part / total) * 100).toFixed(1) + '%';
}
