import { computed, ref } from 'vue';
import type { Category, Dimension, Module } from '../types';
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
        return modules.value.filter((mod) => {
            const category = categorizeFile(mod.filename);
            if (!enabledCategories.value.has(category)) return false;
            if (showEntryOnly.value && !mod.isEntry) return false;
            if (query && !`${mod.filename} ${mod.label}`.toLowerCase().includes(query)) {
                return false;
            }
            return true;
        });
    });

    const summary = computed(() => {
        const rows = new Map<Category, { count: number; parsedSize: number; gzipSize: number; brotliSize: number }>();
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
        load,
        filteredModules,
        summary,
    };
}
