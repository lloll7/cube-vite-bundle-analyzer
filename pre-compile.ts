import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * 读取 client 构建产物，内联 JS/CSS 后压缩成 src/output/html.mjs。
 * 运行方式：node --experimental-strip-types pre-compile.ts
 */
const clientDist = path.resolve('client/cube-vite-bundle-analyzer-client/dist');
const outputFile = path.resolve('src/output/html.mjs');

async function inlineAssets(html: string, distDir: string): Promise<string> {
    let result = html;

    const cssRefs = [...result.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/gi)];
    for (const match of cssRefs) {
        const href = match[1];
        const abs = path.join(distDir, href.replace(/^\.?\//, ''));
        const content = await fsp.readFile(abs, 'utf8');
        // 用函数替换避免 content 中的 $& / $' / $` 被当作替换模式展开
        result = result.replace(match[0], () => `<style>${content}</style>`);
    }

    const jsRefs = [...result.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/gi)];
    for (const match of jsRefs) {
        const src = match[1];
        const abs = path.join(distDir, src.replace(/^\.?\//, ''));
        const content = await fsp.readFile(abs, 'utf8');
        result = result.replace(match[0], () => `<script type="module">${content}</script>`);
    }

    return result;
}

// UTF-8 base64 编码，对中文/emoji 等 Unicode 内容可靠
function encode(str: string): string {
    return Buffer.from(str, 'utf8').toString('base64');
}

function decode(base64Str: string): string {
    return Buffer.from(base64Str, 'base64').toString('utf8');
}

async function main() {
    let html = await fsp.readFile(path.join(clientDist, 'index.html'), 'utf8');
    html = await inlineAssets(html, clientDist);
    html = html.replace(/<title>.*?<\/title>/i, '<title><--title--></title>');

    // Vite 会把主脚本放在 <head>；内联后浏览器对 head 中的大 module 脚本不执行，
    // 因此把主脚本移动到 </body> 前，放在数据注入脚本之后。
    const scriptStart = html.indexOf('<script type="module">');
    const scriptEnd = html.indexOf('</script>', scriptStart) + '</script>'.length;
    const scriptBlock = html.slice(scriptStart, scriptEnd);
    html = html.slice(0, scriptStart) + html.slice(scriptEnd);

    // 同样使用函数替换，避免 scriptBlock 中的 $& / $' / $` 被当作替换模式展开
    html = html.replace('</body>', () => {
        return (
            '<script type="module"><--module--></script>\n' +
            scriptBlock +
            '\n</body>'
        );
    });

    const b64 = encode(html);
    const code = [
        'export function html(title, module) {',
        `  const b64 = ${JSON.stringify(b64)};`,
        "  return decode(b64).split('<--title-->').join(title).split('<--module-->').join(module);",
        '}',
        '',
        decode.toString(),
        '',
    ].join('\n');

    await fsp.writeFile(outputFile, code, 'utf-8');
    console.log(`pre-compiled → ${outputFile} (${code.length} bytes)`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
