import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import type { GroupWithNode } from '../trie.ts';
import type { DependencyAnalysis, Module } from '../interface.ts';

/** HTML 转义，防止文件名/路径中的 < > & 等字符破坏页面结构 */
function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    }
    return bytes + ' B';
}

function categorizeFile(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const jsExts = new Set(['js', 'mjs', 'cjs']);
    const cssExts = new Set(['css']);
    const imgExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']);

    if (jsExts.has(ext)) return 'JS';
    if (cssExts.has(ext)) return 'CSS';
    if (imgExts.has(ext)) return '图片';
    return '其他';
}

interface CategoryRow {
    count: number;
    parsedSize: number;
    gzipSize: number;
    brotliSize: number;
}

function renderCategoryTable(modules: Module[]): string {
    const categories: Record<string, CategoryRow> = {
        JS: { count: 0, parsedSize: 0, gzipSize: 0, brotliSize: 0 },
        CSS: { count: 0, parsedSize: 0, gzipSize: 0, brotliSize: 0 },
        图片: { count: 0, parsedSize: 0, gzipSize: 0, brotliSize: 0 },
        其他: { count: 0, parsedSize: 0, gzipSize: 0, brotliSize: 0 },
    };

    for (const mod of modules) {
        const cat = categorizeFile(mod.filename);
        categories[cat].count++;
        categories[cat].parsedSize += mod.parsedSize;
        categories[cat].gzipSize += mod.gzipSize;
        categories[cat].brotliSize += mod.brotliSize;
    }

    const total = categories.JS.parsedSize + categories.CSS.parsedSize + categories.图片.parsedSize + categories.其他.parsedSize;
    const totalGzip = categories.JS.gzipSize + categories.CSS.gzipSize + categories.图片.gzipSize + categories.其他.gzipSize;
    const totalBrotli = categories.JS.brotliSize + categories.CSS.brotliSize + categories.图片.brotliSize + categories.其他.brotliSize;

    const rows = ['JS', 'CSS', '图片', '其他']
        .filter((cat) => categories[cat].count > 0)
        .map((cat) => {
            const info = categories[cat];
            const pct = total ? ((info.parsedSize / total) * 100).toFixed(1) : '0.0';
            return `<tr>
                <td>${escapeHtml(cat)}</td>
                <td>${info.count}</td>
                <td>${formatSize(info.parsedSize)}</td>
                <td>${formatSize(info.gzipSize)}</td>
                <td>${formatSize(info.brotliSize)}</td>
                <td>${pct}%</td>
            </tr>`;
        })
        .join('');

    return `<table class="summary-table">
        <thead>
            <tr><th>分类</th><th>文件数</th><th>大小</th><th>gzip</th><th>brotli</th><th>占比</th></tr>
        </thead>
        <tbody>${rows}
            <tr class="total">
                <td>合计</td>
                <td>${modules.length}</td>
                <td>${formatSize(total)}</td>
                <td>${formatSize(totalGzip)}</td>
                <td>${formatSize(totalBrotli)}</td>
                <td>100.0%</td>
            </tr>
        </tbody>
    </table>`;
}

/** 递归渲染 source 树；目录节点可折叠，叶子节点直接展示体积 */
function renderSourceTree(source: Array<GroupWithNode> | undefined, depth = 0): string {
    if (!source || source.length === 0) {
        return '<div class="tree-empty">无子模块</div>';
    }

    return source
        .map((node) => {
            const hasChildren = Array.isArray(node.groups) && node.groups.length > 0;
            const label = escapeHtml(node.label || node.filename);
            const filename = escapeHtml(node.filename);
            const parsedSize = formatSize(node.parsedSize ?? 0);
            const gzipSize = formatSize(node.gzipSize ?? 0);
            const brotliSize = formatSize(node.brotliSize ?? 0);
            const style = `style="padding-left:${depth * 18 + 8}px"`;

            const content = `<span class="tree-size">${parsedSize}</span>
                <span class="tree-gzip">${gzipSize}</span>
                <span class="tree-brotli">${brotliSize}</span>
                <span class="tree-path">${filename}</span>`;

            if (hasChildren) {
                return `<details class="tree-node" ${style}>
                    <summary><span class="tree-label">${label}</span>${content}</summary>
                    ${renderSourceTree(node.groups, depth + 1)}
                </details>`;
            }

            return `<div class="tree-node tree-leaf" ${style}>
                <span class="tree-label">${label}</span>${content}
            </div>`;
        })
        .join('');
}

function renderModuleList(modules: Module[]): string {
    const maxParsedSize = Math.max(1, ...modules.map((mod) => mod.parsedSize));

    return modules
        .map((mod) => {
            const sourceCount = mod.source?.length ?? 0;
            const badge = mod.isEntry ? 'ENTRY' : mod.isAsset ? 'ASSET' : 'CHUNK';
            const width = Math.max(2, Math.round((mod.parsedSize / maxParsedSize) * 100));
            const imports = mod.imports.length
                ? `<div class="module-imports">imports: ${mod.imports.map(escapeHtml).join(', ')}</div>`
                : '';

            return `<article class="module">
                <header class="module-head">
                    <span class="module-label">${escapeHtml(mod.label)}</span>
                    <span class="module-badge">${badge}</span>
                </header>
                <div class="module-path">${escapeHtml(mod.filename)}</div>
                <div class="module-sizes">
                    <span>parsed ${formatSize(mod.parsedSize)}</span>
                    <span>gzip ${formatSize(mod.gzipSize)}</span>
                    <span>brotli ${formatSize(mod.brotliSize)}</span>
                    <span>map ${formatSize(mod.mapSize)}</span>
                </div>
                <div class="bar"><div class="bar-fill" style="width:${width}%"></div></div>
                ${imports}
                <details class="source">
                    <summary>source 子模块 (${sourceCount})</summary>
                    ${renderSourceTree(mod.source)}
                </details>
            </article>`;
        })
        .join('');
}

/** 依赖分析区块：业务 vs node_modules 拆分、依赖包聚合、重复模块告警 */
function renderDependencySection(modules: Module[], analysis: DependencyAnalysis | null): string {
    const chunks = modules.filter((mod) => !mod.isAsset && mod.parsedSize > 0);

    // 业务 vs 依赖汇总
    const totalBusiness = chunks.reduce((sum, m) => sum + (m.businessSize ?? 0), 0);
    const totalVendor = chunks.reduce((sum, m) => sum + (m.vendorSize ?? 0), 0);
    const totalRendered = totalBusiness + totalVendor;

    let html = '<section><h2>依赖分析</h2>';

    if (totalRendered > 0) {
        const bizPct = totalRendered ? ((totalBusiness / totalRendered) * 100).toFixed(1) : '0.0';
        const vendorPct = totalRendered ? ((totalVendor / totalRendered) * 100).toFixed(1) : '0.0';
        html += `
            <div class="dep-summary">
                <div class="dep-bar">
                    <div class="dep-bar-business" style="width:${bizPct}%"></div>
                    <div class="dep-bar-vendor" style="width:${vendorPct}%"></div>
                </div>
                <div class="dep-legend">
                    <span class="legend-business">业务代码 ${formatSize(totalBusiness)} (${bizPct}%)</span>
                    <span class="legend-vendor">node_modules ${formatSize(totalVendor)} (${vendorPct}%)</span>
                </div>
            </div>`;

        // 每个 chunk 的拆分
        html += `<table class="summary-table dep-chunk-table">
            <thead><tr><th>chunk</th><th>业务</th><th>依赖</th><th>依赖占比</th></tr></thead><tbody>`;
        for (const chunk of [...chunks].sort((a, b) => b.parsedSize - a.parsedSize)) {
            const chunkTotal = (chunk.businessSize ?? 0) + (chunk.vendorSize ?? 0);
            const pct = chunkTotal > 0 ? ((chunk.vendorSize / chunkTotal) * 100).toFixed(0) : '0';
            html += `<tr>
                <td>${escapeHtml(chunk.filename)}</td>
                <td>${formatSize(chunk.businessSize ?? 0)}</td>
                <td>${formatSize(chunk.vendorSize ?? 0)}</td>
                <td>${pct}%</td>
            </tr>`;
        }
        html += '</tbody></table>';

        // 依赖包 Top 10
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
                chunkFiles: [...info.chunkFiles],
            }))
            .sort((a, b) => b.renderedLength - a.renderedLength)
            .slice(0, 10);

        if (topPackages.length) {
            html += `<h3>依赖包 Top 10（renderedLength 口径）</h3>
                <table class="summary-table">
                    <thead><tr><th>包名</th><th>体积</th><th>占比</th><th>所在 chunk</th></tr></thead><tbody>`;
            for (const pkg of topPackages) {
                const pct = totalRendered ? ((pkg.renderedLength / totalRendered) * 100).toFixed(1) : '0.0';
                html += `<tr>
                    <td>${escapeHtml(pkg.name)}</td>
                    <td>${formatSize(pkg.renderedLength)}</td>
                    <td>${pct}%</td>
                    <td>${pkg.chunkFiles.map(escapeHtml).join(', ')}</td>
                </tr>`;
            }
            html += '</tbody></table>';
        }
    }

    // 重复模块
    const duplicates = analysis?.duplicates ?? [];
    if (duplicates.length) {
        html += `<h3>⚠ 重复模块 ${duplicates.length} 个（同一模块被多个 chunk 包含）</h3>
            <table class="summary-table">
                <thead><tr><th>模块</th><th>体积</th><th>出现次数</th><th>所在 chunk</th></tr></thead><tbody>`;
        for (const dup of duplicates.slice(0, 20)) {
            html += `<tr>
                <td>${escapeHtml(dup.id)}</td>
                <td>${formatSize(dup.renderedLength)}</td>
                <td>${dup.count}</td>
                <td>${dup.chunkFiles.map(escapeHtml).join(', ')}</td>
            </tr>`;
        }
        html += '</tbody></table>';
    } else if (totalRendered > 0) {
        html += '<h3>无重复模块 ✅</h3>';
    }

    if (analysis && Object.keys(analysis.moduleGraph).length) {
        html += `<p class="dep-graph-hint">模块级依赖图已采集（${Object.keys(analysis.moduleGraph).length} 个模块），支持反向追溯「某个依赖为什么被带进来」。</p>`;
    }

    html += '</section>';
    return html;
}

/** 生成自包含的离线 HTML 报告：汇总表 + 产物列表 + source 树 + 依赖分析 + 内联 JSON 数据 */
export function renderStaticHtml(
    modules: Module[],
    analysis: DependencyAnalysis | null = null
): string {
    const data = JSON.stringify(modules).replace(/</g, '\\u003c');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bundle 分析报告</title>
<style>
:root {
    color-scheme: light;
    --text: #1f2933;
    --muted: #6b7280;
    --border: #e5e7eb;
    --bg: #ffffff;
    --accent: #2563eb;
    --accent-soft: #eff6ff;
    --ok: #16a34a;
}
* { box-sizing: border-box; }
body {
    margin: 0;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
    color: var(--text);
    background: #f8fafc;
}
.page { max-width: 980px; margin: 0 auto; padding: 32px 20px 56px; }
h1 { font-size: 22px; margin: 0 0 4px; }
.subtitle { color: var(--muted); font-size: 13px; margin-bottom: 28px; }
section { margin-bottom: 32px; }
h2 { font-size: 15px; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
.summary-table { width: 100%; border-collapse: collapse; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; font-size: 13px; }
.summary-table th, .summary-table td { text-align: right; padding: 9px 14px; border-bottom: 1px solid var(--border); }
.summary-table th:first-child, .summary-table td:first-child { text-align: left; }
.summary-table th { background: #f3f4f6; font-weight: 600; }
.summary-table tr.total td { font-weight: 700; background: var(--accent-soft); border-bottom: none; }
.module { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; margin-bottom: 12px; }
.module-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.module-label { font-weight: 600; font-size: 14px; word-break: break-all; }
.module-badge { flex-shrink: 0; font-size: 11px; font-weight: 700; color: var(--accent); background: var(--accent-soft); border-radius: 999px; padding: 3px 10px; }
.module-path { color: var(--muted); font-size: 12px; margin-top: 4px; word-break: break-all; }
.module-sizes { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; margin: 10px 0 8px; }
.bar { height: 6px; background: #eef2f7; border-radius: 999px; overflow: hidden; margin-bottom: 10px; }
.bar-fill { height: 100%; background: var(--accent); border-radius: 999px; }
.module-imports { color: var(--muted); font-size: 12px; margin-bottom: 8px; word-break: break-all; }
.source summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--accent); }
.tree { margin-top: 8px; font-size: 12px; }
.tree-node { display: flex; align-items: center; gap: 10px; padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
.tree-node summary { display: flex; align-items: center; gap: 10px; cursor: pointer; list-style-position: inside; flex: 1; }
.tree-label { font-weight: 600; min-width: 120px; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-size, .tree-gzip, .tree-brotli { min-width: 60px; text-align: right; color: var(--muted); }
.tree-path { flex: 1; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-empty { color: var(--muted); padding: 8px; }
.dep-summary { margin-bottom: 14px; }
.dep-bar { display: flex; height: 14px; border-radius: 999px; overflow: hidden; background: #eef2f7; margin-bottom: 8px; }
.dep-bar-business { background: var(--accent); }
.dep-bar-vendor { background: #f59e0b; }
.dep-legend { display: flex; gap: 18px; font-size: 13px; flex-wrap: wrap; }
.legend-business { color: var(--accent); font-weight: 600; }
.legend-vendor { color: #b45309; font-weight: 600; }
.dep-chunk-table { margin-bottom: 16px; }
.dep-graph-hint { color: var(--muted); font-size: 12px; margin-top: 12px; }
h3 { font-size: 13px; margin: 18px 0 10px; color: var(--text); }
@media (max-width: 640px) {
    .tree-path { display: none; }
    .tree-gzip, .tree-brotli { display: none; }
    .page { padding: 20px 12px 40px; }
}
</style>
</head>
<body>
<div class="page">
    <h1>Bundle 分析报告</h1>
    <div class="subtitle">${new Date().toLocaleString()} · ${modules.length} 个产物</div>
    <section>
        <h2>资源类型汇总</h2>
        ${renderCategoryTable(modules)}
    </section>
    ${renderDependencySection(modules, analysis)}
    <section>
        <h2>产物列表</h2>
        ${renderModuleList(modules)}
    </section>
</div>
<script id="__ANALYZER_DATA__" type="application/json">${data}</script>
</body>
</html>`;
}

/** 将静态报告写入 outDir，返回绝对路径 */
export async function writeStaticHtmlReport(
    modules: Module[],
    outDir: string,
    fileName = 'stats.html',
    analysis: DependencyAnalysis | null = null
): Promise<string> {
    let html: string;
    try {
        const { renderView } = await import('../render.ts');
        html = await renderView(modules, { title: 'Bundle 分析报告', mode: 'parsedSize' });
    } catch {
        // 预编译模板不存在时退回简单静态报告
        html = renderStaticHtml(modules, analysis);
    }
    const absPath = path.isAbsolute(fileName) ? fileName : path.resolve(outDir, fileName);
    await mkdir(path.dirname(absPath), { recursive: true });
    await writeFile(absPath, html, 'utf-8');
    return absPath;
}
