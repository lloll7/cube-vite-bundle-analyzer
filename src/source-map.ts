// 这个导入语句是导入 SourceMapConsumer 用于解析 source map，下面 pickupMappingsFromCodeStr 函数会用它来根据 sourcemap 查找每一个生成后代码字符对应的原始 source 文件，实现代码映射分组功能。
import { SourceMapConsumer } from '@jridgewell/source-map';

/**
 * 清理路径字符串中的上级目录前缀。
 *
 * 该函数用于规范化源文件路径，将形如 '../foo/bar' 或 '..\foo\bar'
 * 这种以一个或多个上级目录前缀（../ 或 ..\）开头的路径，去除这些前缀，返回更简洁的相对路径。
 *
 * 常用于 source map 路径展示或分组，避免不同层级前缀导致相同源文件被识别为不同文件。
 *
 * @param id 原始路径字符串 (例：'../../src/main.js')
 * @returns 去除上级目录前缀后的路径字符串 (例：'src/main.js')
 */
export function cleanPath(id: string) {
    // 使用正则匹配并去除开头的 ../ 或 ..\，可匹配多个连续出现的上级目录前缀
    return id.replace(/^((\.\.\/)+|(\.\.\\)+)/, '');
}

/**
 * source map 代码位置回溯分组函数
 *
 * 遍历生成后的代码字符串，依据源码映射(rawSourcemap)查找每个字符对应的原始 source 文件，
 * 将代码片段分组到不同的 source 文件下，同时收集所有出现过的 source 文件。
 *
 * @param code 生成后的代码字符串
 * @param rawSourcemap 原始 source map 字符串
 * @returns 包含每个 source 分组的代码和文件集合 { grouped, files }
 */
export function pickupMappingsFromCodeStr(code: string, rawSourcemap: string) {
    /** 创建 source-map 对象，用于查询生成代码到原始代码的映射关系 */
    const consumer = new SourceMapConsumer(rawSourcemap); // 将 rawSourcemap 转为可查询的映射对象
    /** 结果分组对象，key 为 source 路径，value 为 { code,  importedBy: []} */
    const grouped: Record<string, { code: string; importedBy: [] }> = {}; // 存储分组后的代码和导入来源
    // 当前处理的源码行号（1-based，最初为 1）
    let line = 1;
    // 当前处理的源码列号（0-based，最初为 0）
    let column = 0;
    // 用于收集所有映射到的 source 文件名（去重，不保证顺序）
    const files = new Set();
    // 遍历生成后的代码
    for (let i = 0; i < code.length; i++, column++) {
        // 查询当前位置在原始 source map 中对应的 source 文件名
        const { source } = consumer.originalPositionFor({ line, column });
        if (source != null) {
            const id = source;
            const char = code[i];
            // 若当前 source 文件未记录，则初始化其分组结构
            if (!(id in grouped)) {
                grouped[id] = { importedBy: [], code: '' };
            }
            // 将当前字符追加到该 source 文件分组的代码内容中
            grouped[id].code += char;
            // 记录当前文件到去重集合
            files.add(id);
        }
        // 若遇到换行字符则行号递增，列号重置为 -1 （因为后续 ++column 会变成 0）
        if (code[i] === '\n') {
            line += 1;
            column = -1;
        }
    }
    // 返回分组后的结果和出现过的文件集合
    return { grouped, files };
}
