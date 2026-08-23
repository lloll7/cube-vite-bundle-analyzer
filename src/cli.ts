/**
 * 命令行入口：解析参数后调用 vite build，并自动注入 bundleAnalyzer 插件。
 * 支持 npm run analyze -- -m json 这种用法，也可以直接用 node 执行本文件。
 */
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import { bundleAnalyzer } from './index.ts';
import type { AnalyzerOptions } from './interface.ts';

/** 插件支持的输出模式，-m/--mode 只允许这三个值 */
const ANALYZER_MODES = ['json', 'static', 'server'] as const;
type AnalyzerMode = (typeof ANALYZER_MODES)[number];

/** CLI 解析结果，字段与 bundleAnalyzer 的部分选项一一对应 */
export interface CliOptions {
    configFile?: string;
    analyzerMode?: AnalyzerMode;
    analyzerPort?: number;
    openAnalyzer?: boolean;
}

/** 打印命令行帮助信息 */
export function printHelp() {
    console.log(`
Usage: vite-bundle-analyzer [options]

Options:
  -c, --config <file>   Vite config file to load 指定 Vite 配置文件
  -m, --mode <mode>     Analyzer output mode: json | static | server (default: server)
  -p, --port <port>     Server mode port (default: 8888)
  -o, --open            Open browser after server starts 启动后打开浏览器
  -h, --help            Show this help 打印帮助
`);
}

/** 解析命令行参数，遇到 -h/未知参数/非法值时会直接退出进程 */
export function parseCliArgs(argv: string[]): CliOptions {
    const options: CliOptions = {};

    // 逐个参数解析；带值的选项（-c/-m/-p）取下一个参数作为值
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '-h':
            case '--help':
                // 帮助请求直接打印后退出，不再执行构建
                printHelp();
                process.exit(0);
                break;
            case '-c':
            case '--config':
                // 指定要加载的 Vite 配置文件
                options.configFile = argv[++i];
                break;
            case '-m':
            case '--mode': {
                const mode = argv[++i] as AnalyzerMode;
                // 模式必须是 json/static/server 之一，否则直接报错
                if (!ANALYZER_MODES.includes(mode)) {
                    console.error(`Invalid mode: ${mode}. Expected ${ANALYZER_MODES.join(' | ')}`);
                    process.exit(1);
                }
                options.analyzerMode = mode;
                break;
            }
            case '-p':
            case '--port': {
                const raw = argv[++i];
                const port = Number(raw);
                // 端口必须是 1-65535 的整数
                if (!Number.isInteger(port) || port <= 0 || port > 65535) {
                    console.error(`Invalid port: ${raw}`);
                    process.exit(1);
                }
                options.analyzerPort = port;
                break;
            }
            case '-o':
            case '--open':
                // server 模式启动后自动打开浏览器
                options.openAnalyzer = true;
                break;
            default:
                // 未知参数直接报错并提示帮助
                console.error(`Unknown option: ${arg}`);
                printHelp();
                process.exit(1);
        }
    }

    return options;
}

/** 把 CLI 参数转换成 bundleAnalyzer 的选项，mode 缺省时使用 server */
export function createAnalyzerOptions(options: CliOptions): AnalyzerOptions {
    return {
        analyzerMode: options.analyzerMode ?? 'server',
        analyzerPort: options.analyzerPort,
        openAnalyzer: options.openAnalyzer,
    };
}

/** CLI 主流程：解析参数 -> 注入插件 -> 执行一次 vite build */
async function main() {
    const options = parseCliArgs(process.argv.slice(2));
    await build({
        configFile: options.configFile,
        plugins: [bundleAnalyzer(createAnalyzerOptions(options))],
    });
}

/** 只有直接运行 cli.ts 时才执行主流程，被 import 时（如单测）不触发构建 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
