import http from 'node:http';
import net from 'node:net';
import type { Module } from '../interface.ts';
import { renderStaticHtml } from './static-html.ts';
import { exec } from 'node:child_process';

/** 探测端口是否可用；返回 true 表示可以监听 */
function checkPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.once('listening', () => probe.close(() => resolve(true)));
        probe.listen(port);
    });
}

/** 首选端口被占用时自动 +1，直到找到可用端口 */
export async function ensureEmptyPort(preferredPort: number): Promise<number> {
    let port = preferredPort;
    while (!(await checkPortAvailable(port))) {
        port++;
    }
    return port;
}

export async function startServer(modules: Module[], options?: { port?: number, openAnalyzer?: boolean }): Promise<http.Server> {
    const port = await ensureEmptyPort(options?.port ?? 8888);
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        if (url.pathname === '/api/stats') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(modules));
            return;
        }
        if (url.pathname === '/' || url.pathname === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            try {
                const { renderView } = await import('../render.ts');
                const html = await renderView(modules, { title: 'Bundle 分析报告', mode: 'parsedSize' });
                res.end(html);
            } catch {
                res.end(renderStaticHtml(modules));
            }
            return;
        }
        res.writeHead(404);
        res.end('Not Found');
    });
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, () => {
            server.removeListener('error', reject);
            console.log(`  analyzer server → http://localhost:${port}`);
            if (options?.openAnalyzer) exec(`start http://localhost:${port}`);
            resolve(server);
        });
    });
}
