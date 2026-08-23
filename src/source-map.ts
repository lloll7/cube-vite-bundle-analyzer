/**
 * 规范化 source map 中的源文件路径，统一分隔符并去掉多余的相对路径前缀，
 * 避免 `../src/a.ts`、`..\src\a.ts` 被当成两个不同的源文件。
 */
export function normalizeSourcePath(id: string): string {
    return id
        .replace(/\\/g, '/')
        .replace(/^file:\/\//, '')
        .replace(/^\/+/, '')
        .replace(/^(?:\.\.\/)+/, '')
        .replace(/^\.\//, '');
}

/**
 * 从 Rollup/Vite 生成的 source map 中读取源文件列表及其原始内容。
 *
 * `sourcesContent` 是 source map 自带的原始源码快照，用它计算源文件体积
 * 比遍历生成代码逐字符反查映射更准确，也更快。
 *
 * @param rawSourcemap 原始 source map 字符串
 * @returns 源文件与原始内容的列表，内容缺失时为 null
 */
export function pickupSourcesFromSourcemap(rawSourcemap: string) {
    let parsed: { sources?: string[]; sourcesContent?: Array<string | null> };
    try {
        parsed = JSON.parse(rawSourcemap);
    } catch {
        return [];
    }
    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    const contents = Array.isArray(parsed.sourcesContent) ? parsed.sourcesContent : [];
    return sources.map((id, index) => ({
        id,
        code: contents[index] ?? null,
    }));
}
