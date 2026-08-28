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

# 与上一次 stats.json 对比输出构建 diff（CI 体积回归检查）
vite-bundle-analyzer-lin -m json -d
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
| `diff` | `boolean` | `false` | 与磁盘上上一次的 stats.json 对比，输出构建 diff |
| `budget` | `BudgetOptions` | - | 体积预算（CI 门槛），超限打印告警并置退出码 1 |

### 体积预算（CI 门槛）

```ts
bundleAnalyzer({
    budget: {
        totalParsedSize: 800 * 1024,   // 所有 JS chunk parsedSize 总和 ≤ 800 KB
        totalGzipSize: 250 * 1024,     // 所有 JS chunk gzipSize 总和 ≤ 250 KB
        entryParsedSize: 200 * 1024,   // 单个入口 chunk parsedSize ≤ 200 KB
        entryGzipSize: 60 * 1024,      // 单个入口 chunk gzipSize ≤ 60 KB
        chunkParsedSize: 300 * 1024,   // 单个 chunk（含非入口）parsedSize ≤ 300 KB
    },
})
```

超限时终端会打印违规明细并置 `process.exitCode = 1`，CI 中构建即失败，可用于体积回归拦截。

### 构建 diff

开启 `diff: true`（或 CLI `-d`）后，插件会读取磁盘上上一次构建的 `stats.json` 与本次对比：

```
  构建 diff（本次 vs 上次）
  总量 parsedSize: 341.80 KB  (上次 380.86 KB, -40000 B (-10.3%))
  文件：3 个（新增 1 / 删除 1 / 变化 2）
  变化 Top 10:
    195.31 KB  -50000 B (-20.0%)  [减小]  assets/vendor.js
    29.30 KB  +29.30 KB (新增)  [新增]  assets/new.js
```

> 注意：diff 需要先有一次构建产生基线；首次构建会提示"未找到上一次基线，跳过对比"。基线存放在 `<项目根>/node_modules/.cache/vite-bundle-analyzer-lin/stats.json`（outDir 之外），因此不会被 Vite 的 `emptyOutDir` 清空，可跨构建持续对比。

## 说明

- sourcemap 关闭后仍能得到 chunk 级体积，但 source 树和源文件归因不可用；
- 开启 sourcemap 会生成 `.map` 文件，生产环境可按需通过 `sourcemap: false` 关闭；
- server 模式默认地址为 `http://localhost:8888`；
- CI 中通过 `ANALYZER_MODE=json` 环境变量可强制 json 模式，避免 server 模式挂起进程。

## 组内试点接入

### 本地分析（server 模式，推荐日常使用）

```ts
// vite.config.ts
import { bundleAnalyzer } from 'vite-bundle-analyzer-lin';

export default defineConfig({
    plugins: [
        bundleAnalyzer({
            analyzerMode: 'server', // 构建完成后启动本地可视化服务
            openAnalyzer: true,     // 自动打开浏览器
        }),
    ],
});
```

构建完成后访问 `http://localhost:8888`，查看树图、source 归因、分类汇总。

### CI 体积回归拦截

```ts
bundleAnalyzer({
    analyzerMode: 'json',   // CI 中使用 json 模式，构建完正常退出
    diff: true,             // 与上一次基线对比，输出体积变化
    budget: {
        totalParsedSize: 800 * 1024, // 超过即构建失败（exit code 1）
    },
});
```

CI 流水线中通过环境变量强制 json 模式（无需改代码）：

```sh
ANALYZER_MODE=json vite build
```

- 首次构建生成基线（`node_modules/.cache/vite-bundle-analyzer-lin/stats.json`）；
- 后续构建输出 diff；超预算时构建以非 0 退出码失败，可阻断合并。

### 常见问题

| 问题 | 解决 |
|------|------|
| 构建后终端没有报告 | 确认插件在 `plugins` 数组中、`apply: 'build'` 只在生产构建运行 |
| server 模式打不开浏览器 | 手动访问终端打印的地址；`openAnalyzer` 依赖系统命令（Windows `start`） |
| CI 中构建挂起 | 设置 `ANALYZER_MODE=json` 环境变量 |
| diff 提示"首次构建跳过" | 正常，首次无基线；跑第二次即输出对比 |
