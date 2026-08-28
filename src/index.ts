import type { AnalyzerOptions, DependencyAnalysis, Module } from './interface.ts';
import path from 'node:path';
import { AnalyzerModule } from './analyzer-module.ts';
import { writeJsonReport } from './output/json.ts';
import { writeStaticHtmlReport } from './output/static-html.ts';
import { EFileType } from './type/enum/EFileType.ts';
import { buildDiff, loadPreviousStats, printDiffReport } from './diff.ts';
import { checkBudget, printBudgetReport } from './budget.ts';

/** Vite/Rollup bundle item 的通用形状 */
/**
 * 各类别统计汇总信息
 */
interface CategorySummary {
    count: number; // 文件数量
    totalSize: number; // 文件总字节数
    totalGzipSize: number; // 文件 gzip 压缩后总字节数
    totalBrotliSize: number; // 文件 brotli 压缩后总字节数
    files: string[]; // 所有文件名
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
    const fontExts = new Set(['woff', 'woff2', 'ttf', 'otf', 'eot']);
    const mediaExts = new Set(['mp4', 'webm', 'mp3', 'wav']);
    const jsonExts = new Set(['json', 'json5']);
    const htmlExts = new Set(['html', 'htm']);

    if (jsExts.has(ext)) return EFileType.JS;
    if (cssExts.has(ext)) return EFileType.CSS;
    if (imgExts.has(ext)) return EFileType.IMG;
    if (fontExts.has(ext)) return EFileType.FONT_TYPE;
    if (mediaExts.has(ext)) return EFileType.MEDIA;
    if (jsonExts.has(ext)) return EFileType.JSON;
    if (htmlExts.has(ext)) return EFileType.HTML;
    return EFileType.OTHER;
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
        // 判断是否为“宽字符”（East Asian Wide / Fullwidth），宽字符按 2 列计
        //
        // 正则 [一-鿿　-〿＀-￯] 由三段 Unicode 范围组成：
        //
        // 1. 一-鿿  → U+4E00 ~ U+9FFF
        //    CJK 统一汉字基本区，常见中文汉字（一、中、文…）
        //
        // 2.　-〿  → U+3000 ~ U+303F
        //    CJK 符号与标点，含：
        //    - U+3000 全角空格（　）
        //    - 、。〃「」等中文标点
        //
        // 3. ＀-￯  → U+FF00 ~ U+FFEF
        //    半角/全角形式区，含：
        //    - 全角 ASCII（ＡＢＣ、１２３、！？）
        //    - 全角片假名、韩文音节等
        //
        // 不在上述范围的字符（如 a、1、-）按半角 1 列计算
        visualLen += /[一-鿿　-〿＀-￯]/.test(ch) ? 2 : 1;
    }
    return str + ' '.repeat(Math.max(0, len - visualLen));
}
/**
 * 打印终端总结（Bundle 分析报告）
 */
function printTerminalSummary(modules: Module[]) {
    if (modules.length === 0) return;

    const categories: Record<string, CategorySummary> = {
        JS: { count: 0, totalSize: 0, totalGzipSize: 0, totalBrotliSize: 0, files: [] },
        CSS: { count: 0, totalSize: 0, totalGzipSize: 0, totalBrotliSize: 0, files: [] },
        图片: { count: 0, totalSize: 0, totalGzipSize: 0, totalBrotliSize: 0, files: [] },
        字体: { count: 0, totalSize: 0, totalGzipSize: 0, totalBrotliSize: 0, files: [] },
        音视频: { count: 0, totalSize: 0, totalGzipSize: 0, totalBrotliSize: 0, files: [] },
        数据配置: { count: 0, totalSize: 0, totalGzipSize: 0, totalBrotliSize: 0, files: [] },
        网页: { count: 0, totalSize: 0, totalGzipSize: 0, totalBrotliSize: 0, files: [] },
        其他: { count: 0, totalSize: 0, totalGzipSize: 0, totalBrotliSize: 0, files: [] },
    };

    for (const mod of modules) {
        const cat = categorizeFile(mod.filename);
        categories[cat].count++;
        categories[cat].totalSize += mod.parsedSize;
        categories[cat].totalGzipSize += mod.gzipSize;
        categories[cat].totalBrotliSize += mod.brotliSize;
    }

    const totalSize = modules.reduce((sum, mod) => sum + mod.parsedSize, 0);
    const totalGzipSize = modules.reduce((sum, mod) => sum + mod.gzipSize, 0);
    const totalBrotliSize = modules.reduce((sum, mod) => sum + mod.brotliSize, 0);
    console.log('\n══════════════════════════════════════════════════════════════════════════');
    console.log('  Bundle 分析报告');
    console.log('══════════════════════════════════════════════════════════════════════════');
    console.log(
        padRight('  分类', 8) +
            padRight('文件数', 10) +
            padRight('大小', 14) +
            padRight('占比', 14) +
            padRight('gzipSize', 14) +
            'brotliSize'
    );
    console.log('─────────────────────────────────────────────────────────────────');
    for (const value of Object.values(EFileType)) {
        const info = categories[value];
        if (!info || info.count === 0) continue;
        const pct = ((info.totalSize / totalSize) * 100).toFixed(1);
        console.log(
            padRight(`  ${value}`, 8) +
                padRight(String(info.count), 10) +
                padRight(formatSize(info.totalSize), 14) +
                padRight(pct + '%', 14) +
                padRight(formatSize(info.totalGzipSize), 14) +
                formatSize(info.totalBrotliSize)
        );
    }
    console.log('─────────────────────────────────────────────────────────────────');
    console.log(
        padRight('  合计', 8) +
            padRight(String(modules.length), 10) +
            padRight(formatSize(totalSize), 14) +
            padRight('100.0%', 14) +
            padRight(formatSize(totalGzipSize), 14) +
            formatSize(totalBrotliSize)
    );
    console.log('═════════════════════════════════════════════════════════════════════\n');
}

/**
 * 打印首屏入口资源体积：entry chunk + 与入口同名的同步 CSS。
 * Vite 产物中 JS/CSS 文件名去掉 hash 后前缀相同，如 index-xxx.js ↔ index-yyy.css。
 */
function printEntrySummary(modules: Module[]) {
    // 找出入口文件
    const entryChunks = modules.filter((mod) => mod.isEntry && !mod.isAsset);
    if (entryChunks.length === 0) return;

    // 去掉扩展名和 Vite 的 8 位 hash
    /**
     * @description
     * 例：
     * assets/index-DIzJl3AY.js
     * assets/index-GmK2cb7z.css
     * 都会变为 assets/index
     */
    const toBaseName = (filename: string) =>
        filename
            .replace(/\.(?:c|m)?js$/i, '')
            .replace(/\.css$/i, '')
            .replace(/-[A-Za-z0-9_-]{8,}$/, '');

    const entryBaseNames = new Set(entryChunks.map((mod) => toBaseName(mod.filename)));
    /**
     * 找出与入口同步加载的 CSS
     * 条件依次是：它是 asset、是 .css 文件、并且去掉 hash 后和某个 entry JS 前缀相同。
     * 异步加载（动态 import）的 CSS 一般前缀不同或不在 entry 集合里，所以不会被算进来
     */
    const syncCss = modules.filter(
        (mod) =>
            mod.isAsset &&
            /\.css$/i.test(mod.filename) &&
            entryBaseNames.has(toBaseName(mod.filename))
    );

    const firstScreenModules = [...entryChunks, ...syncCss];
    const parsedSize = firstScreenModules.reduce((sum, mod) => sum + mod.parsedSize, 0);
    const gzipSize = firstScreenModules.reduce((sum, mod) => sum + mod.gzipSize, 0);
    const brotliSize = firstScreenModules.reduce((sum, mod) => sum + mod.brotliSize, 0);

    console.log(`  首屏入口  ${entryChunks.length} JS + ${syncCss.length} CSS`);
    console.log(
        `    parsedSize: ${formatSize(parsedSize)}  |  gzipSize: ${formatSize(gzipSize)}  |  brotliSize: ${formatSize(brotliSize)}\n`
    );
}

/**
 * 打印依赖分析：
 * 1. 每个 JS chunk 的业务代码 / node_modules 拆分（Rollup renderedLength 口径）
 * 2. 依赖包聚合（哪个 npm 包占了多少、分布在哪些 chunk）
 * 3. 重复模块告警（同一模块被打进多个 chunk）
 * 4. 模块级依赖图已采集（用于"为什么被带进来"溯源）
 */
function printDependencySummary(modules: Module[], analysis: DependencyAnalysis) {
    const chunks = modules.filter((mod) => !mod.isAsset && mod.parsedSize > 0);

    // 1. 业务 vs 依赖拆分（跨所有 JS chunk 汇总）
    const totalBusiness = chunks.reduce((sum, m) => sum + (m.businessSize ?? 0), 0);
    const totalVendor = chunks.reduce((sum, m) => sum + (m.vendorSize ?? 0), 0);
    const totalRendered = totalBusiness + totalVendor;

    console.log('══════════════════════════════════════════════════════════════════════════');
    console.log('  依赖分析');
    console.log('══════════════════════════════════════════════════════════════════════════');

    if (totalRendered > 0) {
        const bizPct = ((totalBusiness / totalRendered) * 100).toFixed(1);
        const vendorPct = ((totalVendor / totalRendered) * 100).toFixed(1);
        console.log(
            `  业务代码   ${formatSize(totalBusiness)}  (${bizPct}%)` +
            `    |  node_modules  ${formatSize(totalVendor)}  (${vendorPct}%)`
        );
        console.log('─────────────────────────────────────────────────────────────────');

        // 2. 每个 chunk 的拆分
        console.log(
            padRight('  chunk', 34) +
                padRight('业务', 12) +
                padRight('依赖', 12) +
                '依赖占比'
        );
        for (const chunk of [...chunks].sort((a, b) => b.parsedSize - a.parsedSize)) {
            const chunkTotal = (chunk.businessSize ?? 0) + (chunk.vendorSize ?? 0);
            const pct = chunkTotal > 0 ? ((chunk.vendorSize / chunkTotal) * 100).toFixed(0) : '0';
            console.log(
                padRight(`  ${chunk.filename}`, 34) +
                    padRight(formatSize(chunk.businessSize ?? 0), 12) +
                    padRight(formatSize(chunk.vendorSize ?? 0), 12) +
                    `${pct}%`
            );
        }
        console.log('─────────────────────────────────────────────────────────────────');

        // 3. 依赖包 Top 10（跨 chunk 聚合：同一包可能出现在多个 chunk）
        const pkgMap = new Map<string, { renderedLength: number; chunkFiles: Set<string> }>();
        for (const chunk of chunks) {
            for (const pkg of chunk.packages ?? []) {
                let entry = pkgMap.get(pkg.name);
                if (!entry) {
                    entry = { renderedLength: 0, chunkFiles: new Set() };
                    pkgMap.set(pkg.name, entry);
                }
                entry.renderedLength += pkg.renderedLength;
                entry.chunkFiles.add(chunk.filename);
            }
        }
        const topPackages = [...pkgMap.entries()]
            .map(([name, info]) => ({
                name,
                renderedLength: info.renderedLength,
                chunkCount: info.chunkFiles.size,
            }))
            .sort((a, b) => b.renderedLength - a.renderedLength)
            .slice(0, 10);

        if (topPackages.length) {
            console.log('  依赖包 Top 10（renderedLength 口径）:');
            for (const pkg of topPackages) {
                const pct = totalRendered > 0 ? ((pkg.renderedLength / totalRendered) * 100).toFixed(1) : '0.0';
                console.log(
                    `    ${padRight(pkg.name, 40)}${padRight(formatSize(pkg.renderedLength), 12)}` +
                        `${pct}%  ×${pkg.chunkCount} chunk`
                );
            }
            console.log('─────────────────────────────────────────────────────────────────');
        }
    }

    // 4. 重复模块
    if (analysis.duplicates.length) {
        console.log(`  ⚠ 重复模块 ${analysis.duplicates.length} 个（同一模块被多个 chunk 包含）:`);
        for (const dup of analysis.duplicates.slice(0, 10)) {
            console.log(
                `    ${dup.id}  (${formatSize(dup.renderedLength)} × ${dup.count})  → ${dup.chunkFiles.join(', ')}`
            );
        }
        if (analysis.duplicates.length > 10) {
            console.log(`    ... 其余 ${analysis.duplicates.length - 10} 个省略`);
        }
        console.log('─────────────────────────────────────────────────────────────────');
    } else if (totalRendered > 0) {
        console.log('  无重复模块 ✅');
    }

    const graphSize = Object.keys(analysis.moduleGraph).length;
    console.log(`  模块级依赖图：${graphSize} 个模块（含 importers 反向引用，可追溯引入链）\n`);
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
/**
 * 与具体 Vite 版本解耦的最小插件类型。
 * 本地直接 import TS 源码时，不会再把根目录 Vite/Rolldown 的类型带进使用方项目。
 */
export interface AnalyzerPlugin {
    name: string;
    apply: 'build';
    enforce: 'post';
    config(config: any): void;
    configResolved(config: any): void;
    buildStart(this: any): void;
    buildEnd(this: any): void;
    generateBundle(options: any, outputBundle: any): Promise<void>;
    closeBundle(): Promise<void>;
}

export function bundleAnalyzer(options: AnalyzerOptions = {}): AnalyzerPlugin {
    const analyzer = new AnalyzerModule({
        include: options.include,
        exclude: options.exclude,
        pathFormatter: options.pathFormatter,
    });
    let outDir = 'dist';
    // diff 历史基线路径：放在 outDir 之外的持久位置（node_modules/.cache），
    // 避免 Vite 的 emptyOutDir 在每次构建时清掉上一次的 stats.json
    let diffBaselineFile = '';

    return {
        name: 'vite-bundle-analyzer',
        apply: 'build',
        enforce: 'post',

        config(config) {
            if (!config.build) config.build = {};
            /**
             * 没有 sourcemap 只能够知道 index.js 打包后有 120 kb，有了 sourcemap 可以知道这其中 loadsh 占了 42kb，util.ts 占了 20kb...
             * 它可以从打包产物追溯到源文件，这样才能进行模块化分析，否则都是空谈。
             *
             * 打包过程本质上是一个信息销毁的过程，而 sourcemap 在销毁开始前记录了一份快照，记录下来，打包完成后就可以根据这些快照来溯源
             * 在打包完成时这些快照就被编码为了 .map 文件
             */
            if (options.sourcemap !== false) {
                config.build.sourcemap = config.build.sourcemap ?? true;
            }
        },

        /** 读取最终构建输出目录 */
        configResolved(config) {
            outDir = path.resolve(config.root, config.build.outDir ?? 'dist');
            // diff 基线存放在项目根 node_modules/.cache 下，随项目持久，不受 outDir 清空影响
            diffBaselineFile = path.resolve(
                config.root,
                'node_modules/.cache/vite-bundle-analyzer-lin/stats.json'
            );
        },

        /** 开始采集模块级依赖图（buildEnd 时完整遍历） */
        buildStart() {
            analyzer.setModuleGraph({});
        },

        /**
         * 构建阶段结束，此时模块图完整。
         * 遍历所有 module id，记录每个模块的 importers / importedIds / isEntry，
         * 供"某个依赖包为什么被带进来"的反向追溯使用。
         */
        buildEnd() {
            const graph: Record<string, any> = {};
            const ids: string[] =
                typeof this.getModuleIds === 'function'
                    ? Array.from(this.getModuleIds() as Iterable<string>)
                    : [];
            for (const id of ids) {
                const info = this.getModuleInfo(id);
                if (!info) continue;
                graph[id] = {
                    id,
                    importers: [...info.importers],
                    importedIds: [...info.importedIds],
                    dynamicallyImportedIds: [...info.dynamicallyImportedIds],
                    isEntry: info.isEntry,
                    isExternal: info.isExternal,
                };
            }
            analyzer.setModuleGraph(graph);
        },
        /**
         * outputBundle 参数来源于 rollup 的 generateBundle 钩子，
         * 它包含了构建过程中所有输出文件和资源的信息。
         * 在 Vite 的打包流程中，outputBundle 会被传递到插件的 generateBundle 钩子，用于分析和处理最终输出内容。
         */
        async generateBundle(_, outputBundle) {
            analyzer.setupRollupChunks(outputBundle);

            for (const bundleName in outputBundle) {
                await analyzer.addModule(outputBundle[bundleName]);
            }
        },
        /** Vite 和 Rollup 在打包流程完成后自动调用的钩子函数（callback），用于在所有文件输出后做最终处理或统计分析。 */
        async closeBundle() {
            // 落盘后以磁盘真实文件为准，避免 Vite 在 generateBundle 之后追加代码导致体积偏差
            await analyzer.refreshChunkSizesFromDisk(outDir);

            const modules = analyzer.processModule();
            if (modules.length === 0) return;
            const analysis = analyzer.buildDependencyAnalysis();

            // 允许 CI/测试通过环境变量覆盖输出模式，避免 server 模式挂起进程
            const analyzerMode = process.env.ANALYZER_MODE ?? options.analyzerMode;

            // 终端摘要
            printTerminalSummary(modules);
            printEntrySummary(modules);
            printDependencySummary(modules, analysis);

            // 构建 diff：与上一次构建的基线对比。
            // 基线存在 outDir 之外的 node_modules/.cache，避免被 Vite emptyOutDir 清掉。
            if (options.diff) {
                const previous = await loadPreviousStats(diffBaselineFile);
                if (previous.length > 0) {
                    printDiffReport(buildDiff(modules, previous));
                } else {
                    console.log('  ⚠ diff 开启但未找到上一次基线，跳过对比（首次构建）\n');
                }
            }

            // JSON 输出
            if (analyzerMode === 'json') {
                const absPath = await writeJsonReport(
                    modules,
                    outDir,
                    options.fileName ?? 'stats.json'
                );
                console.log(`  stats written → ${absPath}\n`);
            }

            // 静态 HTML 输出
            if (analyzerMode === 'static') {
                const absPath = await writeStaticHtmlReport(
                    modules,
                    outDir,
                    options.fileName ?? 'stats.html',
                    analysis
                );
                console.log(`  stats written → ${absPath}\n`);
            }

            // 更新 diff 基线（本次结果作为下一次对比基准）。
            // 注意：必须在 diff 对比完成之后再写，否则对比到的是本次自身。
            if (options.diff) {
                await writeJsonReport(modules, path.dirname(diffBaselineFile), path.basename(diffBaselineFile));
            }

            // 体积预算（CI 门槛）：超限置退出码 1，CI 可据此拦截
            if (options.budget) {
                const violations = checkBudget(modules, options.budget);
                printBudgetReport(violations);
                if (violations.length > 0) {
                    process.exitCode = 1;
                }
            }

            if (analyzerMode === 'server') {
                const { startServer } = await import('./output/server.ts');
                await startServer(modules, {
                    port: options.analyzerPort ?? 8888,
                    openAnalyzer: options.openAnalyzer,
                });
            }
        },
    };
}
