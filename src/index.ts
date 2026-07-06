import type { Plugin } from 'vite';
import { Buffer } from 'node:buffer';

/** Vite/Rollup bundle item 的通用形状 */
interface BundleItem {
    type: 'chunk' | 'asset';
    code?: string;
    source?: string | Uint8Array;
    fileName?: string;
    name?: string;
}

interface CategorySummary {
    count: number;
    totalSize: number;
    files: string[];
}

interface BundleRecord {
    fileName: string;
    type: 'chunk' | 'asset';
    size: number;
}
/**
 * 获取文件扩展名
 * @param fileName - 文件名
 * @returns 文件扩展名
 */
function getFileExtension(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return ext;
}
/**
 * 根据文件扩展名返回需要展示出来的文件类别
 * @param fileName - 文件名
 * @returns 文件分类
 */
function categorizeFile(fileName: string): string {
    const ext = getFileExtension(fileName);
    const jsExts = new Set(['js', 'mjs', 'cjs']);
    const cssExts = new Set(['css']);
    const imgExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);

    if (jsExts.has(ext)) return 'JS';
    if (cssExts.has(ext)) return 'CSS';
    if (imgExts.has(ext)) return '图片';
    return '其他';
}
/**
 * 获取文件大小
 * @param item - 文件项
 * @returns 文件大小
 * @description 在 vite / rollup 的 bundle 结果中，chunk 类型的文件内容以 code 字符串的形式存储，
 *              获取 code 的 utf-8 编码时的字节长度（Buffer.byteLength），就可以准确反映最终生成文件的实际字节大小
 *              等价于该文件内容写入磁盘时的占用空间，这样就能得到文件真实的体积
 */
function getItemSize(item: BundleItem): number {
    if (item.type === 'chunk' && item.code) {
        return Buffer.byteLength(item.code, 'utf-8');
    }
    // asset
    const source = item.source;
    if (source instanceof Uint8Array) {
        return source.byteLength;
    }
    if (typeof source === 'string') {
        return Buffer.byteLength(source, 'utf-8');
    }
    return 0;
}
/**
 * 格式化文件大小的显示
 * @param bytes - 字节大小
 * @returns 格式化后的文件大小
 */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    }
    return bytes + ' B';
}
/**
 * 右对齐字符串
 * @param str - 字符串
 * @param len - 长度
 * @returns 右对齐后的字符串
 * @description 就是控制台表格输出的列对齐效果，中文字符按 2 个宽度计算
 */
function padRight(str: string, len: number): string {
    // 中文字符按 2 个宽度计算
    let visualLen = 0;
    for (const ch of str) {
        visualLen += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
    }
    return str + ' '.repeat(Math.max(0, len - visualLen));
}
/**
 * bundleAnalyzer 插件的主要作用：
 *   - 用于分析 Vite 或 Rollup 打包输出目录的所有文件体积和类型分布，并在打包完成后打印出详细的体积分析报告。
 *
 * 调用方式（使用示例）：
 *   // vite.config.ts
 *   import { bundleAnalyzer } from 'vite-bundle-analyzer-lin'
 *   export default {
 *     plugins: [
 *       bundleAnalyzer() // 作为 Vite/Rollup 的插件引入
 *     ]
 *   }
 */
export function bundleAnalyzer(options = {}): Plugin {
    const bundleRecords: BundleRecord[] = [];

    return {
        name: 'vite-bundle-analyzer',
        apply: 'build',
        enforce: 'post',
        /**
         * outputBundle 参数来源于 rollup 的 generateBundle 钩子，
         * 它包含了构建过程中所有输出文件和资源的信息。
         * 在 Vite 的打包流程中，outputBundle 会被传递到插件的 generateBundle 钩子，用于分析和处理最终输出内容。
         */
        generateBundle(_, outputBundle) {
            for (const [fileName, item] of Object.entries(outputBundle)) {
                const size = getItemSize(item);
                bundleRecords.push({
                    fileName,
                    type: item.type,
                    size,
                });
            }
        },
        /** Vite 和 Rollup 在打包流程完成后自动调用的钩子函数（callback），用于在所有文件输出后做最终处理或统计分析。 */
        closeBundle() {
            if (bundleRecords.length === 0) return;

            const categories: Record<string, CategorySummary> = {
                'JS':   { count: 0, totalSize: 0, files: [] },
                'CSS':  { count: 0, totalSize: 0, files: [] },
                '图片': { count: 0, totalSize: 0, files: [] },
                '其他': { count: 0, totalSize: 0, files: [] },
            };

            for (const record of bundleRecords) {
                const cat = categorizeFile(record.fileName);
                categories[cat].count++;
                categories[cat].totalSize += record.size;
                categories[cat].files.push(record.fileName);
            }

            const totalSize = bundleRecords.reduce((sum, r) => sum + r.size, 0);

            console.log('\n═══════════════════════════════════════════════');
            console.log('  Bundle 分析报告');
            console.log('═══════════════════════════════════════════════');
            console.log(
                padRight('  分类', 8) +
                padRight('文件数', 10) +
                padRight('大小', 14) +
                '占比'
            );
            console.log('─────────────────────────────────────────────');

            const order = ['JS', 'CSS', '图片', '其他'];
            for (const cat of order) {
                const info = categories[cat];
                if (info.count === 0) continue;
                const pct = ((info.totalSize / totalSize) * 100).toFixed(1);
                console.log(
                    padRight(`  ${cat}`, 8) +
                    padRight(String(info.count), 10) +
                    padRight(formatSize(info.totalSize), 14) +
                    pct + '%'
                );
            }

            console.log('─────────────────────────────────────────────');
            console.log(
                padRight('  合计', 8) +
                padRight(String(bundleRecords.length), 10) +
                padRight(formatSize(totalSize), 14) +
                '100.0%'
            );
            console.log('═══════════════════════════════════════════════\n');
        },
    };
}
