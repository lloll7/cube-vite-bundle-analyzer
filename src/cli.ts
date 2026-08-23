/**
 * CLI 参数解析与插件选项转换，供 cli-bin.ts（可执行入口）复用。
 * 本文件不包含直接执行逻辑，便于单测 import。
 */
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
export async function main() {
    const options = parseCliArgs(process.argv.slice(2));
    await build({
        configFile: options.configFile,
        plugins: [bundleAnalyzer(createAnalyzerOptions(options))],
    });
}
