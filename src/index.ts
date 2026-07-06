import type { Plugin } from 'vite'

export function bundleAnalyzer(options = {}): Plugin {
    return {
        name: 'vite-bundle-analyzer',
        apply: 'build',
        enforce: 'post',
        generateBundle(_, outputBundle) {
            // 遍历 outputBundle，收集 chunk / asset
        },
        closeBundle() {
            // 输出终端摘要 / 写 JSON / 启动 server
        }
    }
}