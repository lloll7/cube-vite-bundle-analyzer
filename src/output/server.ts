import http from 'node:http';
import { Module } from '../interface';
import { renderStaticHtml } from './static-html';
import { exec } from 'node:child_process';

export function startServer(modules: Module[], options?: { port?: number, openAnalyzer?: boolean }): Promise<http.Server> {
    const port = options?.port ?? 8888;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url!, `http://${req.headers.host}`);
        if (url.pathname === '/api/stats') {
            res.writeHead(200, { 'Content-type': 'application/json' });
            res.end(JSON.stringify(modules));
            return;
        }
        if (url.pathname === '/' || url.pathname === '/index.html') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(renderStaticHtml(modules));
            return;
        }
        res.writeHead(404);
        res.end('Not Found');
    })
    return new Promise((resolve) => {
        server.listen(port, () => {
            console.log(`  analyzer server → http://localhost:${port}`);
            if (options?.openAnalyzer) exec(`start http://localhost:${port}`);
            resolve(server);
        })
    })
}
