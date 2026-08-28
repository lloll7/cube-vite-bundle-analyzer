import type { BudgetOptions, BudgetViolation, Module } from './interface.ts';

/** 格式化字节 */
function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return bytes + ' B';
}

/**
 * 检查构建结果是否超过体积预算。
 * @returns 违规项列表（未超限则为空数组）
 */
export function checkBudget(modules: Module[], budget: BudgetOptions): BudgetViolation[] {
    const violations: BudgetViolation[] = [];
    const chunks = modules.filter((m) => !m.isAsset);

    // 总量：所有 JS chunk 的 parsed/gzip 总和
    if (budget.totalParsedSize != null || budget.totalGzipSize != null) {
        const totalParsed = chunks.reduce((s, m) => s + m.parsedSize, 0);
        const totalGzip = chunks.reduce((s, m) => s + m.gzipSize, 0);
        if (budget.totalParsedSize != null && totalParsed > budget.totalParsedSize) {
            violations.push({
                type: 'total',
                name: 'totalParsedSize',
                limit: budget.totalParsedSize,
                actual: totalParsed,
                excess: totalParsed - budget.totalParsedSize,
            });
        }
        if (budget.totalGzipSize != null && totalGzip > budget.totalGzipSize) {
            violations.push({
                type: 'total',
                name: 'totalGzipSize',
                limit: budget.totalGzipSize,
                actual: totalGzip,
                excess: totalGzip - budget.totalGzipSize,
            });
        }
    }

    // 入口 chunk
    if (budget.entryParsedSize != null || budget.entryGzipSize != null) {
        for (const chunk of chunks.filter((m) => m.isEntry)) {
            if (budget.entryParsedSize != null && chunk.parsedSize > budget.entryParsedSize) {
                violations.push({
                    type: 'entry',
                    name: chunk.filename,
                    limit: budget.entryParsedSize,
                    actual: chunk.parsedSize,
                    excess: chunk.parsedSize - budget.entryParsedSize,
                });
            }
            if (budget.entryGzipSize != null && chunk.gzipSize > budget.entryGzipSize) {
                violations.push({
                    type: 'entry',
                    name: chunk.filename,
                    limit: budget.entryGzipSize,
                    actual: chunk.gzipSize,
                    excess: chunk.gzipSize - budget.entryGzipSize,
                });
            }
        }
    }

    // 单个 chunk（含非入口）
    if (budget.chunkParsedSize != null) {
        for (const chunk of chunks) {
            if (chunk.parsedSize > budget.chunkParsedSize) {
                violations.push({
                    type: 'chunk',
                    name: chunk.filename,
                    limit: budget.chunkParsedSize,
                    actual: chunk.parsedSize,
                    excess: chunk.parsedSize - budget.chunkParsedSize,
                });
            }
        }
    }

    return violations;
}

/** 打印预算检查终端报告 */
export function printBudgetReport(violations: BudgetViolation[]) {
    console.log('══════════════════════════════════════════════════════════════════════════');
    console.log('  体积预算检查');
    console.log('══════════════════════════════════════════════════════════════════════════');

    if (violations.length === 0) {
        console.log('  ✅ 全部在预算内\n');
        return;
    }

    for (const v of violations) {
        console.log(
            `  ❌ [${v.type === 'total' ? '总量' : v.type === 'entry' ? '入口' : 'chunk'}] ${v.name}`
        );
        console.log(
            `     实际 ${formatSize(v.actual)}  >  预算 ${formatSize(v.limit)}  ` +
                `(超出 ${formatSize(v.excess)})`
        );
    }
    console.log(`  ⚠ 共 ${violations.length} 项超限，构建将被标记为失败（exit code 1）\n`);
}
