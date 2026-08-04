<script setup lang="ts">
import { computed } from 'vue';
import type { Dimension, Module } from '../types';
import { CATEGORIES, categorizeFile, formatPercent, formatSize } from '../utils';

const props = defineProps<{ modules: Module[]; dimension: Dimension }>();

interface Row {
    count: number;
    parsedSize: number;
    gzipSize: number;
    brotliSize: number;
}

const rows = computed(() => {
    const map = new Map<string, Row>();
    for (const category of CATEGORIES) {
        map.set(category, { count: 0, parsedSize: 0, gzipSize: 0, brotliSize: 0 });
    }
    for (const mod of props.modules) {
        const row = map.get(categorizeFile(mod.filename))!;
        row.count++;
        row.parsedSize += mod.parsedSize;
        row.gzipSize += mod.gzipSize;
        row.brotliSize += mod.brotliSize;
    }
    return map;
});

const totals = computed(() => {
    let count = 0;
    let parsedSize = 0;
    let gzipSize = 0;
    let brotliSize = 0;
    for (const row of rows.value.values()) {
        count += row.count;
        parsedSize += row.parsedSize;
        gzipSize += row.gzipSize;
        brotliSize += row.brotliSize;
    }
    return { count, parsedSize, gzipSize, brotliSize };
});

function rowSize(row: Row, dimension: Dimension): number {
    return row[dimension];
}
</script>

<template>
    <section class="summary-panel">
        <div class="panel-title">资源类型汇总</div>
        <div class="table-wrap">
            <table>
                <thead>
                    <tr>
                        <th>分类</th>
                        <th>文件数</th>
                        <th>大小</th>
                        <th>gzip</th>
                        <th>brotli</th>
                        <th>占比</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="[category, row] in rows" :key="category">
                        <td>{{ category }}</td>
                        <td>{{ row.count }}</td>
                        <td>{{ formatSize(row.parsedSize) }}</td>
                        <td>{{ formatSize(row.gzipSize) }}</td>
                        <td>{{ formatSize(row.brotliSize) }}</td>
                        <td>{{ formatPercent(rowSize(row, dimension), rowSize(totals, dimension)) }}</td>
                    </tr>
                    <tr class="total-row">
                        <td>合计</td>
                        <td>{{ totals.count }}</td>
                        <td>{{ formatSize(totals.parsedSize) }}</td>
                        <td>{{ formatSize(totals.gzipSize) }}</td>
                        <td>{{ formatSize(totals.brotliSize) }}</td>
                        <td>100.0%</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>

<style scoped>
.summary-panel {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
}
.panel-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 10px;
}
.table-wrap {
    overflow-x: auto;
}
table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    min-width: 620px;
}
th,
td {
    text-align: right;
    padding: 7px 10px;
    border-bottom: 1px solid var(--border);
}
th:first-child,
td:first-child {
    text-align: left;
}
th {
    color: var(--muted);
    font-weight: 600;
    background: #f8fafc;
}
.total-row td {
    font-weight: 700;
    background: var(--accent-soft);
    border-bottom: none;
}
</style>
