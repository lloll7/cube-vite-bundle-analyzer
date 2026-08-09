<script setup lang="ts">
import { computed } from 'vue';
import type { SourceMatch } from '../composables/useStats';
import type { Dimension, Module, SourceFile } from '../types';
import { CATEGORY_COLORS, categorizeFile, formatSize } from '../utils';

const props = defineProps<{
    items: SourceFile[];
    dimension: Dimension;
    selected: Module | null;
    sourceMatches?: SourceMatch[];
    searchQuery?: string;
    selectedSourcePath?: string;
}>();

function sourceSize(match: SourceMatch, dimension: Dimension): number {
    return match[dimension];
}

function sourceFileSize(item: SourceFile, dimension: Dimension): number {
    return item[dimension];
}

function isMatchActive(match: SourceMatch): boolean {
    return (
        props.selected?.filename === match.chunk.filename &&
        props.selectedSourcePath === match.path
    );
}

function isSourceFileActive(item: SourceFile): boolean {
    return (
        props.selected?.filename === item.chunk.filename &&
        props.selectedSourcePath === item.path
    );
}

const hasSourceSearch = computed(() => Boolean(props.searchQuery?.trim() && props.sourceMatches));

const emit = defineEmits<{
    selectSource: [match: SourceMatch];
    selectSourceFile: [item: SourceFile];
}>();
</script>

<template>
    <section class="file-list-panel">
        <div class="panel-head">
            <span class="panel-title">{{ hasSourceSearch ? '源文件/目录搜索结果' : '源文件列表' }}</span>
            <span class="panel-count">{{ hasSourceSearch ? sourceMatches?.length ?? 0 : items.length }}</span>
        </div>
        <div v-if="hasSourceSearch && !sourceMatches?.length" class="file-empty">
            未找到匹配的源文件或目录
        </div>
        <div v-else-if="hasSourceSearch" class="file-grid source-grid">
            <button
                v-for="match in sourceMatches"
                :key="`${match.chunk.filename}-${match.path}`"
                type="button"
                class="file-item source-item"
                :class="{ active: isMatchActive(match) }"
                @click="emit('selectSource', match)"
            >
                <span
                    class="file-dot"
                    :style="{ background: CATEGORY_COLORS[categorizeFile(match.path)] }"
                ></span>
                <span class="source-main">
                    <span class="source-path">{{ match.path }}</span>
                    <span class="source-chunk">位于 {{ match.chunk.label || match.chunk.filename }}</span>
                </span>
                <span v-if="match.isDirectory" class="source-badge">目录</span>
                <span class="file-size">{{ formatSize(sourceSize(match, dimension)) }}</span>
            </button>
        </div>
        <div v-else-if="!items.length" class="file-empty">当前筛选条件下没有源文件</div>
        <div v-else class="file-grid">
            <button
                v-for="item in items"
                :key="item.path"
                type="button"
                class="file-item"
                :class="{ active: isSourceFileActive(item) }"
                @click="emit('selectSourceFile', item)"
            >
                <span
                    class="file-dot"
                    :style="{ background: CATEGORY_COLORS[categorizeFile(item.path)] }"
                ></span>
                <span class="file-name">{{ item.path }}</span>
                <span v-if="item.chunkCount > 1" class="source-badge">x{{ item.chunkCount }}</span>
                <span class="file-size">{{ formatSize(sourceFileSize(item, dimension)) }}</span>
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
.source-grid {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
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
.source-item {
    align-items: flex-start;
}
.source-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.source-path {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.source-chunk {
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.source-badge {
    flex-shrink: 0;
    font-size: 9px;
    font-weight: 700;
    color: #7c3aed;
    background: #ede9fe;
    border-radius: 999px;
    padding: 2px 6px;
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
