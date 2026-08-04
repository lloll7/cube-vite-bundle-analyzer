<script setup lang="ts">
import type { Dimension, Module } from '../types';
import { CATEGORY_COLORS, categorizeFile, formatSize, getSize } from '../utils';

defineProps<{ modules: Module[]; dimension: Dimension; selected: Module | null }>();
const emit = defineEmits<{ select: [module: Module] }>();
</script>

<template>
    <section class="file-list-panel">
        <div class="panel-head">
            <span class="panel-title">产物列表</span>
            <span class="panel-count">{{ modules.length }}</span>
        </div>
        <div v-if="!modules.length" class="file-empty">当前筛选条件下没有产物</div>
        <div v-else class="file-grid">
            <button
                v-for="mod in modules"
                :key="mod.filename"
                type="button"
                class="file-item"
                :class="{ active: selected?.filename === mod.filename }"
                @click="emit('select', mod)"
            >
                <span
                    class="file-dot"
                    :style="{ background: CATEGORY_COLORS[categorizeFile(mod.filename)] }"
                ></span>
                <span class="file-name">{{ mod.label }}</span>
                <span v-if="mod.isEntry" class="file-entry">ENTRY</span>
                <span class="file-size">{{ formatSize(getSize(mod, dimension)) }}</span>
            </button>
        </div>
    </section>
</template>

<style scoped>
.file-list-panel {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
}
.panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.panel-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
}
.panel-count {
    font-size: 11px;
    color: var(--muted);
    background: #f1f5f9;
    border-radius: 999px;
    padding: 2px 8px;
}
.file-empty {
    color: var(--muted);
    font-size: 12px;
    padding: 12px 0;
}
.file-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 8px;
}
.file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: #ffffff;
    color: var(--text);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
}
.file-item:hover {
    border-color: var(--accent);
}
.file-item.active {
    border-color: var(--accent);
    background: var(--accent-soft);
}
.file-dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
}
.file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
}
.file-entry {
    font-size: 9px;
    font-weight: 700;
    color: #1d4ed8;
    background: #dbeafe;
    border-radius: 999px;
    padding: 2px 6px;
}
.file-size {
    flex-shrink: 0;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
}
</style>
