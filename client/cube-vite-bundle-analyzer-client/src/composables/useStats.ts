import { computed, ref, watch } from 'vue';
import type { Category, Dimension, GroupWithNode, Module, SourceFile } from '../types';
import { CATEGORIES, categorizeFile } from '../utils';

export function useStats() {
    const modules = ref<Module[]>([]);
    const loading = ref(true);
    const error = ref('');
    const selected = ref<Module | null>(null);
    const dimension = ref<Dimension>((window.__ANALYZER_MODE__ as Dimension) ?? 'parsedSize');
    const searchQuery = ref('');
    const showEntryOnly = ref(false);
    const enabledCategories = ref<Set<Category>>(new Set(CATEGORIES));
    const selectedSourcePath = ref('');

    watch(searchQuery, () => {
        selectedSourcePath.value = '';
    });

    async function load() {
        loading.value = true;
        error.value = '';
        try {
            const data =
                window.__ANALYZER_DATA__ ??
                (await fetch('/api/stats').then((res) => {
                    if (!res.ok) {
                        throw new Error(`请求失败: ${res.status}`);
                    }
                    return res.json();
                }));
            modules.value = Array.isArray(data) ? (data as Module[]) : [];
            selected.value = modules.value[0] ?? null;
        } catch (e) {
            error.value = e instanceof Error ? e.message : String(e);
        } finally {
            loading.value = false;
        }
    }

    const filteredModules = computed(() => {
        const query = searchQuery.value.trim().toLowerCase();
        const sourceChunkFilenames = new Set<string>();
        if (query) {
            for (const mod of modules.value) {
                if (mod.source?.length && sourceTreeHasMatch(mod.source, query)) {
                    sourceChunkFilenames.add(mod.filename);
                }
            }
        }

        return modules.value.filter((mod) => {
            const category = categorizeFile(mod.filename);
            if (!enabledCategories.value.has(category)) return false;
            if (showEntryOnly.value && !mod.isEntry) return false;
            if (query && !sourceChunkFilenames.has(mod.filename)) return false;
            return true;
        });
    });

    const sourceMatches = computed<SourceMatch[]>(() => {
        const query = searchQuery.value.trim().toLowerCase();
        if (!query) return [];

        const result: SourceMatch[] = [];
        for (const mod of modules.value) {
            if (mod.source?.length) {
                collectSourceMatches(mod.source, mod, result, query);
            }
        }

        return result
            .sort((a, b) => b[dimension.value] - a[dimension.value])
            .slice(0, 50);
    });

    const filteredSourceFiles = computed(() => {
        return buildSourceFiles(filteredModules.value, searchQuery.value)
            .sort((a, b) => b[dimension.value] - a[dimension.value]);
    });

    const summary = computed(() => {
        const rows = new Map<
            Category,
            { count: number; parsedSize: number; gzipSize: number; brotliSize: number }
        >();
        for (const category of CATEGORIES) {
            rows.set(category, { count: 0, parsedSize: 0, gzipSize: 0, brotliSize: 0 });
        }
        for (const mod of modules.value) {
            const category = categorizeFile(mod.filename);
            const row = rows.get(category)!;
            row.count++;
            row.parsedSize += mod.parsedSize;
            row.gzipSize += mod.gzipSize;
            row.brotliSize += mod.brotliSize;
        }
        const totals = { count: modules.value.length, parsedSize: 0, gzipSize: 0, brotliSize: 0 };
        for (const row of rows.values()) {
            totals.parsedSize += row.parsedSize;
            totals.gzipSize += row.gzipSize;
            totals.brotliSize += row.brotliSize;
        }
        return { rows, totals };
    });

    return {
        modules,
        loading,
        error,
        selected,
        dimension,
        searchQuery,
        showEntryOnly,
        enabledCategories,
        selectedSourcePath,
        load,
        filteredModules,
        filteredSourceFiles,
        sourceMatches,
        summary,
    };
}

export interface SourceMatch {
    path: string; // 源文件路径
    isDirectory: boolean;
    parsedSize: number;
    gzipSize: number;
    brotliSize: number;
    chunk: Module; // 这个源文件属于哪个打包后的 chunk
}

function sourceNodeMatches(node: GroupWithNode, query: string): boolean {
    return `${node.filename ?? ''} ${node.label ?? ''}`.toLowerCase().includes(query);
}

function sourceTreeHasMatch(groups: GroupWithNode[], query: string): boolean {
    return groups.some(
        (node) =>
            sourceNodeMatches(node, query) ||
            (node.groups?.length ? sourceTreeHasMatch(node.groups, query) : false)
    );
}

function collectSourceMatches(
    groups: GroupWithNode[],
    chunk: Module,
    result: SourceMatch[],
    query: string
) {
    for (const node of groups) {
        const path = node.filename ?? node.label ?? '';
        if (sourceNodeMatches(node, query)) {
            result.push({
                path,
                isDirectory: Array.isArray(node.groups),
                parsedSize: node.parsedSize ?? 0,
                gzipSize: node.gzipSize ?? 0,
                brotliSize: node.brotliSize ?? 0,
                chunk,
            });
        }
        if (node.groups?.length) {
            collectSourceMatches(node.groups, chunk, result, query);
        }
    }
}

function collectSourceLeaves(groups: GroupWithNode[], result: GroupWithNode[]) {
    for (const node of groups) {
        if (node.groups?.length) {
            collectSourceLeaves(node.groups, result);
        } else {
            result.push(node);
        }
    }
}

function buildSourceFiles(modules: Module[], query = ''): SourceFile[] {
    const normalizedQuery = query.trim().toLowerCase();
    const map = new Map<string, SourceFile>();

    function addSource(
        path: string,
        sizes: Pick<SourceFile, 'parsedSize' | 'gzipSize' | 'brotliSize'>,
        chunk: Module
    ) {
        if (!path) return;
        if (normalizedQuery && !`${path} ${chunk.label}`.toLowerCase().includes(normalizedQuery)) {
            return;
        }

        const existing = map.get(path);
        if (existing) {
            existing.parsedSize += sizes.parsedSize;
            existing.gzipSize += sizes.gzipSize;
            existing.brotliSize += sizes.brotliSize;
            existing.chunkCount += 1;
            return;
        }

        map.set(path, {
            path,
            parsedSize: sizes.parsedSize,
            gzipSize: sizes.gzipSize,
            brotliSize: sizes.brotliSize,
            chunk,
            chunkCount: 1,
        });
    }

    for (const mod of modules) {
        const leaves: GroupWithNode[] = [];
        if (mod.source?.length) {
            collectSourceLeaves(mod.source, leaves);
        }

        if (leaves.length) {
            for (const leaf of leaves) {
                addSource(
                    leaf.filename ?? leaf.label ?? '',
                    {
                        parsedSize: leaf.parsedSize ?? 0,
                        gzipSize: leaf.gzipSize ?? 0,
                        brotliSize: leaf.brotliSize ?? 0,
                    },
                    mod
                );
            }
        } else {
            addSource(
                mod.label,
                {
                    parsedSize: mod.parsedSize,
                    gzipSize: mod.gzipSize,
                    brotliSize: mod.brotliSize,
                },
                mod
            );
        }
    }

    return Array.from(map.values());
}
