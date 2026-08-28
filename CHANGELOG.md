# Changelog

本项目的所有重要变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-08-28

### 新增

- **Vite/Rollup 插件**：构建完成后采集 `outputBundle`，计算每个产物的 parsed / gzip / brotli 体积，按 JS / CSS / 图片 / 字体 / 音视频 / 数据配置 / 网页等分类汇总
- **sourcemap 归因**：通过 `sourcesContent` 还原每个 chunk 的源文件构成树（source 树），支持搜索、分类筛选、入口筛选、体积维度切换
- **四种输出模式**：
  - 终端报告（分类汇总表 + 首屏入口体积）
  - `stats.json`（结构化数据）
  - 静态 HTML（自包含离线报告）
  - server 模式（HTTP 可视化服务 + Vue UI 树图，默认 `http://localhost:8888`）
- **CLI 命令行**：`vite-bundle-analyzer-lin` 支持 `-c/--config`、`-m/--mode`、`-p/--port`、`-o/--open`、`-d/--diff`、`-h/--help`
- **构建 diff**：与上一次构建基线对比，输出总量/文件级体积变化（插件 `diff: true` 或 CLI `-d`）
- **体积预算（CI 门槛）**：`budget` 选项支持总包/入口/单 chunk 五档阈值，超限打印告警并置退出码 1
- **配置选项**：`include` / `exclude` 过滤、`pathFormatter` 路径格式化、`sourcemap` 开关、`ANALYZER_MODE` 环境变量（CI 不挂起）

### 修复

- **JS chunk 体积口径**：chunk 的 parsedSize 使用产物文件真实字节数，不再被 source 子树累加值覆盖（此前 demo 中 JS 实际 1719 B 只报告 769 B）
- **sourcemap 解析性能**：改为直接读取 `sourcesContent`，不再逐字符调用 `originalPositionFor`（大项目分析耗时从秒级降到毫秒级）
- **二进制资源**：图片/视频/字体不再计算 gzip/brotli（结果无参考价值且耗时）
- **磁盘一致性**：构建落盘后按磁盘真实文件刷新体积（Vite 可能在 `generateBundle` 后追加 modulepreload 等代码）
- **并发控制**：源文件压缩任务限制并发数，避免大项目内存/CPU 峰值过高
- **server 跨平台**：自动打开浏览器兼容 Windows（`start`）/ macOS（`open`）/ Linux（`xdg-open`）
- **diff 基线持久化**：基线存于 `node_modules/.cache`，不再被 Vite `emptyOutDir` 清空

### 变更

- 移除无用依赖 `@jridgewell/source-map`
- 移除演示项目 `demo/`，统一以 `cube-zigbee-bridge-ultra-web` 作为验证项目
- 脚本统一：`u:build` → `real:build`，`u:dev` → `real:dev`

### 测试

- vitest 单测覆盖：体积口径、source 归因、二进制资源跳过、include/exclude、sourcemap 容错、并发、CLI 解析、插件选项、体积预算（7 用例）、构建 diff（6 用例）
- `test:real`：真实项目端到端（json 模式，构建完退出）
- `test:verify`：stats.json 与磁盘 parsedSize/mapSize 自动核对

[1.0.0]: https://github.com/your-org/vite-bundle-analyzer-lin/releases/tag/v1.0.0
