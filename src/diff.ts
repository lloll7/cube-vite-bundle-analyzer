import type { Module } from './interface.ts';

/** 单个文件的 diff 行 */
export interface FileDiffRow {
    filename: string;
    isEntry: boolean;
    isAsset: boolean;
    /** 本次构建体积 */
    parsedSize: number;
    /** 上次构建体积，-1 表示新增文件 */
    prevParsedSize: number;
    /** 体积变化（当前 - 上次） */
    delta: number;
    /** 变化百分比（相对上次，新增文件为 null） */
    deltaPct: number | null;
}

/** 构建 diff 结果 */
export interface BuildDiff {
    /** 文件级变化明细 */
    files: FileDiffRow[];
    /** 新增文件数 */
    addedCount: number;
    /** 删除文件数（上次有、本次无） */
    removedCount: number;
    /** 变化文件数（体积有增减） */
    changedCount: number;
    /** 本次总 parsedSize */
    totalParsedSize: number;
    /** 上次总 parsedSize */
    prevTotalParsedSize: number;
    /** 总量变化 */
    totalDelta: number;
    /** 本次总 gzipSize */
    totalGzipSize: number;
    /** 上次总 gzipSize */
    prevTotalGzipSize: number;
}

/**
 * 对比两次构建的 Module[]。
 * @param current 本次构建结果
 * @param previous 上次构建结果（可能为空数组）
 */
export function buildDiff(current: Module[], previous: Module[]): BuildDiff {
    const prevMap = new Map(previous.map((m) => [m.filename, m]));

    const files: FileDiffRow[] = [];
    let totalParsedSize = 0;
    let totalGzipSize = 0;
    let prevTotalParsedSize = 0;
    let prevTotalGzipSize = 0;
    let addedCount = 0;
    let changedCount = 0;

    for (const mod of current) {
        totalParsedSize += mod.parsedSize;
        totalGzipSize += mod.gzipSize;
        const prev = prevMap.get(mod.filename);
        if (!prev) {
            addedCount++;
            files.push({
                filename: mod.filename,
                isEntry: mod.isEntry,
                isAsset: !!mod.isAsset,
                parsedSize: mod.parsedSize,
                prevParsedSize: -1,
                delta: mod.parsedSize,
                deltaPct: null,
            });
            continue;
        }
        prevTotalParsedSize += prev.parsedSize;
        prevTotalGzipSize += prev.gzipSize;
        const delta = mod.parsedSize - prev.parsedSize;
        if (delta !== 0) changedCount++;
        files.push({
            filename: mod.filename,
            isEntry: mod.isEntry,
            isAsset: !!mod.isAsset,
            parsedSize: mod.parsedSize,
            prevParsedSize: prev.parsedSize,
            delta,
            deltaPct: prev.parsedSize > 0 ? (delta / prev.parsedSize) * 100 : null,
        });
    }

    // 删除的文件：上次有、本次无
    const currentNames = new Set(current.map((m) => m.filename));
    let removedCount = 0;
    for (const prev of previous) {
        if (!currentNames.has(prev.filename)) {
            removedCount++;
            prevTotalParsedSize += prev.parsedSize;
            prevTotalGzipSize += prev.gzipSize;
        }
    }

    return {
        files,
        addedCount,
        removedCount,
        changedCount,
        totalParsedSize,
        prevTotalParsedSize,
        totalDelta: totalParsedSize - prevTotalParsedSize,
        totalGzipSize,
        prevTotalGzipSize,
    };
}

/** 格式化字节 */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

/** 打印构建 diff 终端报告 */
export function printDiffReport(diff: BuildDiff) {
    console.log('══════════════════════════════════════════════════════════════════════════');
    console.log('  构建 diff（本次 vs 上次）');
    console.log('══════════════════════════════════════════════════════════════════════════');

    const deltaStr = (delta: number, pct: number | null) => {
        const sign = delta > 0 ? '+' : '';
        const pctStr = pct === null ? ' (新增)' : ` (${sign}${pct.toFixed(1)}%)`;
        return `${sign}${formatSize(delta)}${pctStr}`;
    };

    // 总量
    console.log(
        `  总量 parsedSize: ${formatSize(diff.totalParsedSize)}  ` +
            `(上次 ${formatSize(diff.prevTotalParsedSize)}, ${deltaStr(diff.totalDelta, diff.prevTotalParsedSize > 0 ? (diff.totalDelta / diff.prevTotalParsedSize) * 100 : null)})`
    );
    const gzipDelta = diff.totalGzipSize - diff.prevTotalGzipSize;
    console.log(
        `  总量 gzipSize:   ${formatSize(diff.totalGzipSize)}  ` +
            `(上次 ${formatSize(diff.prevTotalGzipSize)}, ${deltaStr(gzipDelta, diff.prevTotalGzipSize > 0 ? (gzipDelta / diff.prevTotalGzipSize) * 100 : null)})`
    );
    console.log(
        `  文件：${diff.files.length} 个（新增 ${diff.addedCount} / 删除 ${diff.removedCount} / 变化 ${diff.changedCount}）`
    );
    console.log('─────────────────────────────────────────────────────────────────');

    // 变化最大的 Top 10（按 |delta| 降序）
    const top = [...diff.files]
        .filter((f) => f.delta !== 0 || f.prevParsedSize === -1)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 10);

    if (top.length) {
        console.log('  变化 Top 10:');
        for (const file of top) {
            const badge = file.prevParsedSize === -1 ? '  [新增]' : file.delta > 0 ? '  [+增大]' : '  [减小]';
            console.log(
                `    ${formatSize(file.parsedSize)}  ${deltaStr(file.delta, file.deltaPct)}${badge}  ${file.filename}`
            );
        }
    } else {
        console.log('  无体积变化 ✅');
    }
    console.log('═════════════════════════════════════════════════════════════════════\n');
}

/**
 * 从磁盘读取上一次构建的 stats.json（不存在则返回空数组）。
 * 与 index.ts 的 writeJsonReport 路径解析保持一致。
 */
export async function loadPreviousStats(filePath: string): Promise<Module[]> {
    try {
        const { readFile } = await import('node:fs/promises');
        const raw = await readFile(filePath, 'utf-8');
        const data = JSON.parse(raw);
        return Array.isArray(data) ? (data as Module[]) : [];
    } catch {
        // 文件不存在或解析失败：没有上一次数据
        return [];
    }
}
