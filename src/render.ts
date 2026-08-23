import type { Module } from './interface.ts';

export interface RenderOptions {
    title: string;
    mode: 'parsedSize' | 'gzipSize' | 'brotliSize';
}

/** 将 Module[] 注入预编译的 Vue UI 模板，返回完整 HTML */
export async function renderView(modules: Module[], options: RenderOptions): Promise<string> {
    // html.mjs 由 pre-compile.ts 生成，不存在时上层会 fallback 到简单静态报告
    // @ts-expect-error generated module
    const { html } = await import('./output/html.mjs');
    const data = JSON.stringify(modules).replace(/</g, '\\u003c');
    const injectCode = `window.__ANALYZER_DATA__=${data};window.__ANALYZER_MODE__='${options.mode}';`;
    return html(options.title, injectCode);
}
