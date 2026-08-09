import path from 'node:path';
import type { Module } from '../interface';
import { mkdir, writeFile } from 'node:fs/promises';

export async function writeJsonReport(
    modules: Module[],
    outDir: string,
    fileName = 'stats.json'
): Promise<string> {
    // 1. 拼绝对路径
    const absPath = path.isAbsolute(fileName) ? fileName : path.resolve(outDir, fileName);

    // 2. 确保目录存在（用户可能传 'reports/stats.json' 这种嵌套路径）
    await mkdir(path.dirname(absPath), { recursive: true });

    // 3. 写入 json
    await writeFile(absPath, JSON.stringify(modules, null, 2), 'utf-8');

    // 4. 返回路径，方便 index.ts 打印日志
    return absPath;
}
