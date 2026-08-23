# vite-bundle-analyzer-lin

Vite/Rollup 打包分析插件：构建完成后统计产物体积、gzip/brotli 压缩体积，并通过 sourcemap 还原每个 chunk 的源文件构成，输出终端报告、JSON、静态 HTML 或 HTTP 可视化服务。

## 安装

```sh
npm install -D vite-bundle-analyzer-lin
```

## 插件用法

```ts
// vite.config.ts
import { bundleAnalyzer } from 'vite-bundle-analyzer-lin';

export default defineConfig({
    plugins: [
        bundleAnalyzer({
            analyzerMode: 'server', // json | static | server
        }),
    ],
});
```

## CLI 用法

```sh
# 指定模式与 Vite 配置文件
vite-bundle-analyzer-lin -m json -c vite.config.ts

# server 模式指定端口并自动打开浏览器
vite-bundle-analyzer-lin -m server -p 8888 -o
```

开发环境也可以直接运行源码：

```sh
npm run analyze -- -m json
```

## 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `analyzerMode` | `'json' \| 'static' \| 'server'` | 终端表格 | 输出模式 |
| `fileName` | `string` | `stats.json` / `stats.html` | JSON/HTML 文件名 |
| `analyzerPort` | `number` | `8888` | server 模式端口 |
| `openAnalyzer` | `boolean` | `false` | server 模式是否自动打开浏览器 |
| `sourcemap` | `boolean` | `true` | 是否强制开启 sourcemap；传 `false` 时不修改使用方配置 |
| `include` | `FilterPattern` | - | 只分析匹配的产物 |
| `exclude` | `FilterPattern` | - | 排除匹配的产物 |
| `pathFormatter` | `(path, defaultWD) => string` | 原样 | 自定义 source 树展示路径 |

## 说明

- sourcemap 关闭后仍能得到 chunk 级体积，但 source 树和源文件归因不可用；
- 开启 sourcemap 会生成 `.map` 文件，生产环境可按需通过 `sourcemap: false` 关闭；
- server 模式默认地址为 `http://localhost:8888`。
